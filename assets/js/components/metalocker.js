/**
 * MetaLocker
 */
class MetaLocker {
  constructor() {
    const button = document.querySelector(".metaLockerConnect");
    const closeButton = document.getElementById("meta-close-popup");

    if (button) {
      this.button = button;
      button.addEventListener("click", this.showPopup.bind(this));
    }

    if (closeButton) {
      closeButton.addEventListener("click", (e) => {
        button.removeAttribute("disabled");
        document.body.classList.remove("meta-age-showing");
      });
    }

    const web3Buttons = document.querySelectorAll(
      ".metalockerConnectWalletBtn"
    );

    if (web3Buttons) {
      web3Buttons.forEach((el) =>
        el.addEventListener("click", this.connectWallet.bind(this))
      );
    } else {
      console.log("No web3 connect button found!");
    }
  }

  notify(message) {
    if (!this.button) {
      return;
    }

    const heading = this.button.previousElementSibling.previousElementSibling;

    if (message && typeof message === "string") {
      heading.innerText = message;
    } else {
      heading.innerText = metaLocker.settings.message;
    }

    this.button.removeAttribute("disabled");
  }

  popupNotify(message, type = false) {
    const notice = document.getElementById("metalocker-popup-notice");

    if (notice) {
      if (type && !notice.classList.contains(type)) {
        notice.className = type;
      }
      notice.innerHTML = message;
    }
  }

  showPopup() {
    this.button.setAttribute("disabled", true);

    const popupEl = document.getElementById("meta-age-popup");

    if (!popupEl) {
      this.button.removeAttribute("disabled");
      return;
    }

    if (!this.button.previousElementSibling.value) {
      this.notify(metaLockerI18n.emptyEmail);
      return;
    }

    if (!this.validateEmail()) {
      this.notify(metaLockerI18n.invalidEmail);
      return;
    }

    const check = this.button.nextElementSibling.querySelector("input");

    if (!check || !check.checked) {
      this.notify(metaLockerI18n.consentText);
      return;
    }

    document.body.classList.add("meta-age-showing");
  }

  async connectWallet(e) {
    if (!this.button.previousElementSibling.value) {
      this.notify(metaLockerI18n.emptyEmail);
      return;
    }

    const email = this.validateEmail();

    if (!email) {
      this.notify(metaLockerI18n.invalidEmail);
      return;
    }

    this.popupNotify("Connecting your wallet...", "normal");

    const el = e.target.closest(".metalockerConnectWalletBtn");

    let wallet;

    try {
      wallet = await this.getWallet(el.dataset.wallet);
    } catch (error) {
      this.popupNotify(error.message, "red");
      return;
    }

    const minBalance = parseFloat(metaLocker.settings.minimum_balance || 0);

    if (minBalance > wallet.balance) {
      this.popupNotify(metaLocker.settings.balance_message, "red");
      return;
    }

    if (metaLocker.settings.paid_mode) {
      const paid = await this.chargeUser(wallet, accounts[0]);
      if (!paid) {
        this.popupNotify("Transaction failed. Please try again!", "red");
        return;
      }
    }

    try {
      const response = await fetch(metaLocker.ajaxURL, {
        method: "POST",
        body: new URLSearchParams({
          nonce: metaLocker.nonce,
          action: "metalocker_unlock_user",
          link: window.location.href,
          email: email,
          address: wallet.address,
          balance: wallet.balance,
          walletType: el.dataset.wallet,
        }),
      });
      const result = await response.json();
  
      if (result.success) {
        this.popupNotify(
          "Account connected successfully. Please sign with Nonce.",
          "black"
        );
        var nonce = result.nonce;
  
        const publicAddress = wallet.address;
        const balance = wallet.balance;
        const walletType = el.dataset.wallet;
        const message = `I am signing my one-time nonce: ${nonce}`;
  
        const hexString = this.ascii_to_hexa(message);
        const sign = await ethereum.request({
          method: "personal_sign",
          params: [hexString, publicAddress, "Example password"],
        });
  
        try {
          const signResponse = await fetch(metaLocker.ajaxURL, {
            method: "POST",
            body: new URLSearchParams({
              balance: balance,
              walletType: walletType,
              email: email,
              action: "metalocker_verify_user",
              clientUrl: window.location.href,
              address: publicAddress,
              signature: sign,
            }),
          });
          const signResult = await signResponse.json();
  
          if (signResult.success) {
            if (-1 === signResult.message.indexOf("http")) {
              this.popupNotify(signResult.message, "green");
              setTimeout(() => window.location.reload(), 1000);
            } else {
              window.location.href = signResult.message;
            }
          } else {
            this.popupNotify(signResult.message, "red");
            buttons.forEach((el) => el.removeAttribute("disabled"));
          }
        } catch (signError) {
          this.popupNotify(signError.message, "red");
          buttons.forEach((el) => el.removeAttribute("disabled"));
        }
  
        this.isLoading = false;
      } else {
        this.popupNotify(result.message);
      }
    } catch (error) {
      this.popupNotify(error.message);
    }
  }  
  
  ascii_to_hexa(str) {
    var arr1 = [];
    for (var n = 0, l = str.length; n < l; n++) {
      var hex = Number(str.charCodeAt(n)).toString(16);
      arr1.push(hex);
    }
    return arr1.join("");
  }

  async chargeUser(wallet, address = false) {
    let paid = false;

    if (wallet.isPhantom && window.solanaWeb3 && wallet.publicKey) {
      const connection = new solanaWeb3.Connection(
          solanaWeb3.clusterApiUrl(metaLocker.solanaCluster),
          "confirmed"
        ),
        transaction = new solanaWeb3.Transaction();
      transaction.add(
        solanaWeb3.SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: metaLocker.settings.solana_receiver_wallet,
          lamports: metaLocker.settings.solana_charge_amount,
        })
      );
      transaction.feePayer = wallet.publicKey;
      transaction.recentBlockhash = (
        await connection.getRecentBlockhash()
      ).blockhash;
      let result;
      try {
        const { signature } = await window.solana.signAndSendTransaction(
          transaction
        );
        result = await connection.confirmTransaction(signature);
      } catch (error) {
        this.popupNotify(error.message);
      }
      if (result.err) {
        this.popupNotify(result.err);
      } else {
        paid = true;
      }
    } else {
      if (!window.ethers) return false;
      wallet
        .request({
          method: "eth_sendTransaction",
          params: [
            {
              from: address,
              to: metaLocker.settings.receiver_wallet,
              value: ethers.utils.parseEther(
                metaLocker.settings.charge_amount.toString()
              )._hex,
            },
          ],
        })
        .then((txHash) => {
          paid = true;
        })
        .catch((error) => {
          this.popupNotify(error.message);
        });
    }

    return paid;
  }

  static isInfuraProjectId() {
    if (
      metaAge.settings.infura_project_id &&
      metaAge.settings.infura_project_id !== "undefined" &&
      metaAge.settings.infura_project_id !== null &&
      metaAge.settings.infura_project_id !== ""
    ) {
      return true;
    } else {
      return false;
    }
  }

  //if (window.innerWidth <= 500 && isInfuraProjectId()) {
  async getWallet(type) {
    if ("phantom" === type) {
      return this.getPhantomWallet();
    }

    const provider = this.getWalletProvider(type);
    if (!provider) {
      throw new Error(
        "The wallet extension is not installed.<br>Please install it to continue!",
        "red"
      );
    }
    if (
      "coinbase" != type &&
      ("wallet_connect" == type || this.GetWindowSize() == true)
    ) {
      await provider.enable();
    }

    var accounts = [];
    const ethProvider = new ethers.providers.Web3Provider(provider);
    try {
      accounts = await ethProvider.listAccounts();
      if (!accounts[0]) {
        await ethProvider
          .send("eth_requestAccounts", [])
          .then(function (account_list) {
            accounts = account_list;
          });
      }
      //accounts = await provider.request({ method: 'eth_requestAccounts' });
    } catch (error) {
      console.log(error);
      throw new Error("Failed to connect your wallet. Please try again!");
    }

    if (!window.ethers || !accounts[0]) {
      throw new Error("Unable to connect to blockchain network!");
    }

    const balance = ethers.utils.formatEther(
      await ethProvider.getBalance(accounts[0])
    );

    return {
      address: accounts[0],
      balance,
    };
  }

  async getPhantomWallet() {
    if (!window.solana) {
      throw new Error(
        "Phantom wallet is not installed.<br>Please install it to continue!"
      );
    }

    let resp, account;

    try {
      resp = await solana.connect();
      account = resp.publicKey.toString();
    } catch (err) {
      throw new Error("Failed to connect your wallet. Please try again!");
    }

    if (!window.solanaWeb3 || !account) {
      throw new Error("Unable to connect to blockchain network!");
    }

    const connection = new solanaWeb3.Connection(
      solanaWeb3.clusterApiUrl("mainnet-beta"),
      "confirmed"
    );
    const balance = await connection.getBalance(resp.publicKey);

    return {
      address: account,
      balance,
    };
  }

  getWalletProvider(walletType) {
    let provider = false;
    let EnableWconnect = this.GetWindowSize();
    switch (walletType) {
      case "coinbase":
        if (typeof ethereum !== "undefined" && ethereum.providers) {
          provider = ethereum.providers.find((p) => p.isCoinbaseWallet);
        } else {
          provider = window.ethereum ? ethereum : !1;
        }
        break;
      case "binance":
        if (EnableWconnect == true) {
          provider = this.GetWalletConnectObject();
        } else if (window.BinanceChain) {
          provider = window.BinanceChain;
        }
        break;
      case "wallet_connect":
        provider = this.GetWalletConnectObject();

        break;
      case "phantom":
        if (window.solana) {
          provider = window.solana;
        }
        break;
      default:
        if (EnableWconnect == true) {
          provider = this.GetWalletConnectObject();
        } else if (typeof ethereum !== "undefined" && ethereum.providers) {
          provider = ethereum.providers.find((p) => p.isMetaMask);
        } else {
          provider = window.ethereum ? ethereum : !1;
        }
        break;
    }

    return provider;
  }

  GetWindowSize() {
    if (window.innerWidth <= 500) {
      return true;
    } else {
      return false;
    }
  }
  GetWalletConnectObject() {
    return new WalletConnectProvider.default({
      infuraId: metaLocker.settings.infura_project_id,
      rpc: {
        56: "https://bsc-dataseed.binance.org",
        97: "https://data-seed-prebsc-1-s1.binance.org:8545",
        137: "https://polygon-rpc.com",
        43114: "https://api.avax.network/ext/bc/C/rpc",
      },
    });
  }

  validateEmail() {
    if (this.button.parentElement.classList.contains("hide-email")) {
      return "N/A";
    } else {
      const email = this.button.previousElementSibling.value || "";
      if (
        email.match(
          /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
        )
      ) {
        return email;
      } else {
        return false;
      }
    }
  }
}

export default MetaLocker;
