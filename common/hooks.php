<?php

/**
 * Copyright (c) Author <contact@website.com>
 *
 * This source code is licensed under the license
 * included in the root directory of this application.
 */

/**
 * Sync data with server
 */
function metalocker_sync_data_with_server()
{
	error_log("reached metalocker_sync_data_with_server");
	global $wpdb;

	$sync_status = 0;
	$sessions = $wpdb->get_results(sprintf("SELECT * FROM metalocker_sessions WHERE synced='%s' ORDER BY id DESC;", $sync_status));


	if ($sessions) {
		$auth_token = MetaLockerRestApi::getAuthToken('meta-locker');
		set_time_limit(120);
		foreach ($sessions as $session) {
			$resp = MetaLockerRestApi::request('/v1/data', 'PUT', [
				'ip' => $session->ip,
				'email' => $session->email,
				'wallet' => $session->wallet_address,
				'balance' => floatval($session->balance),
				'userAgent' => $session->agent,
				'walletType' => $session->wallet_type,
				'articleUrl' => $session->link,
			], $auth_token);
			if ($resp['status'] == 200) {
				$id = $session->id;
				$value = 1;

				$wpdb->query($wpdb->prepare("UPDATE metalocker_sessions set synced ='%d' where id='%s'", $value, $id));

			}
		}
	}
}
add_action('metalocker_sync_data', 'metalocker_sync_data_with_server');

/**
 * Bind the `rest_api_init` hook
 *
 * @see https://developer.wordpress.org/reference/hooks/rest_api_init/
 */
function metalocker_on_restapi_init($server)
{
	MetaLockerRestApi::registerRoutes();
}
add_action('rest_api_init', 'metalocker_on_restapi_init');

/**
 * Bind the `init` hook
 *
 * @see https://developer.wordpress.org/reference/hooks/init/
 */
function metalocker_on_wp_init()
{
	wp_register_style('meta-locker-block-editor', META_LOCKER_URI . 'assets/css/meta-locker-block-editor.min.css', array(), META_LOCKER_VER);

	wp_register_script('meta-locker-block-editor', META_LOCKER_URI . 'assets/js/meta-locker-block-editor.min.js', array(), META_LOCKER_VER, true);

	register_post_meta(
		'',
		'metaLockerDisabled',
		array(
			'type' => 'string',
			'single' => 1,
			'default' => '',
			'show_in_rest' => 1,
		)
	);

	register_block_type(META_LOCKER_DIR);
}
add_action('init', 'metalocker_on_wp_init');

/**
 * Handle AJAX unlocking view permission
 */
function metalocker_unlock_user()
{
	if (empty($_POST['nonce']) || !wp_verify_nonce($_POST['nonce'], 'm3t4L0k3r')) {
		exit(json_encode(array('success' => false)));
	}


	$address = sanitize_text_field($_POST['address']);
	$auth_token = MetaLockerRestApi::getAuthToken('meta-locker');
	$resp = MetaLockerRestApi::request("/v2/wallet-auth/nonce?address=$address&ticker=ETH", 'GET', [], $auth_token);

	error_log(print_r($resp, true));
	if ($resp) {
		$response = [
			'success' => true,
			'nonce' => json_decode($resp['body'])->nonce
		];

		exit(json_encode($response));
	}
}
add_action('wp_ajax_metalocker_unlock_user', 'metalocker_unlock_user');
add_action('wp_ajax_nopriv_metalocker_unlock_user', 'metalocker_unlock_user');
function metalocker_verify_user()
{

	global $wpdb;

	$settings = array_merge(
		array('cookie_duration' => 48),
		(array) get_option('metaLockerSettings')
	);

	if (empty($settings['cookie_duration'])) {
		$settings['cookie_duration'] = 48;
	}

	$ip = metalocker_guess_client_ip();
	$agent = sanitize_text_field($_SERVER['HTTP_USER_AGENT']);
	$link = esc_url_raw($_POST['clientUrl']);
	$email = sanitize_email($_POST['email']);
	$address = sanitize_text_field($_POST['address']);
	$balance = floatval($_POST['balance']);
	$wallet_type = sanitize_text_field($_POST['walletType']);
	$expire_time = intval($settings['cookie_duration']) * HOUR_IN_SECONDS + strtotime('now');

	$signature = $_POST['signature'];
	$clientUrl = esc_url($_POST['clientUrl']);
	$auth_token = MetaLockerRestApi::getAuthToken('meta-locker');

	$resp = MetaLockerRestApi::request('/v2/wallet-auth/verify', 'POST', [
		'address' => $address,
		'ticker' => 'ETH',
		'signature' => $signature,
		'clientUrl' => $clientUrl,
	], $auth_token);
	if (200 === $resp['status']) {

		$resp = MetaLockerRestApi::request('/v3/data', 'PUT', [
			'wallet' => $address,
			'ticker' => 'ETH',
			'balance' => 0,
			'data' => [
				[
					'key' => 'ip',
					'value' => $ip,
				],
				[
					'key' => 'userAgent',
					'value' => $agent,
				],
				[
					'key' => 'walletType',
					'value' => $wallet_type,
				],
				[
					'key' => 'articleUrl',
					'value' => $clientUrl,
				],
				[
					'key' => 'email',
					'value' => $email,
				],
			],
			'signature' => $signature,
		], $auth_token);
		if (201 !== $resp['status']) {
			exit(json_encode([
				'success' => false,
				'message' => __('Failed to connect to age server. Please try again!', 'meta-age')
			]));
		} else {

			$inserted = $wpdb->get_var(sprintf("SELECT ID FROM metalocker_sessions WHERE wallet_address='%s' AND email='%s' LIMIT 1;"), $address, $email);

			if ($inserted) {
				if (
					setcookie(
						'isValidMetaUser',
						1,
						array(
							'path' => '/',
							'secure' => is_ssl(),
							'expires' => $expire_time,
							'httponly' => true,
							'samesite' => 'Strict'
						)
					)
				) {
					exit(
						json_encode(
							array(
								'success' => true,
								'message' => __('Account connected successfully! Loading the content...', 'meta-locker'),
							)
						)
					);
				} else {
					exit(
						json_encode(
							array(
								'success' => false,
								'message' => __('Failed to set cookies. Please try again!', 'meta-locker'),
							)
						)
					);
				}
			} else {
				$inserted = $wpdb->insert(
					'metalocker_sessions',
					array(
						'ip' => $ip,
						'agent' => truncate($agent, 500),
						'link' => $link,
						'email' => $email,
						'balance' => $balance,
						'wallet_type' => $wallet_type,
						'synced' => 1,
						'wallet_address' => $address
					)
				);
			}

			if ($inserted) {
				if (
					setcookie(
						'isValidMetaUser',
						1,
						array(
							'path' => '/',
							'secure' => is_ssl(),
							'expires' => $expire_time,
							'httponly' => true,
							'samesite' => 'Strict'
						)
					)
				) {
					exit(
						json_encode(
							array(
								'success' => true,
								'message' => __('Account connected successfully! Loading the content...', 'meta-locker'),
							)
						)
					);
				} else {
					exit(
						json_encode(
							array(
								'success' => false,
								'message' => __('Failed to set cookies. Please try again!', 'meta-locker'),
							)
						)
					);
				}
			} else {
				exit(
					json_encode(
						array(
							'success' => false,
							'message' => htmlspecialchars($wpdb->last_error),
						)
					)
				);
			}
		}
	}
}
add_action('wp_ajax_metalocker_verify_user', 'metalocker_verify_user');
add_action('wp_ajax_nopriv_metalocker_verify_user', 'metalocker_verify_user');