window.addEventListener("DOMContentLoaded", () => {
  const noticeEl = document.getElementById("messager");
  const defaultMsg = noticeEl.textContent;
  const activateBtn = document.getElementById("meta-plugin-activate-btn");

  if (activateBtn) {
    activateBtn.addEventListener("click", async (e) => {
      e.preventDefault();

      e.currentTarget.textContent = "ACTIVATING...";
      e.currentTarget.setAttribute("disabled", true);

      const tosBox = document.getElementById("accept_tos");

      if (!tosBox.checked) {
        noticeEl.classList.add("err");
        noticeEl.textContent = metaLocker.tosRequired;
        setTimeout(() => {
          noticeEl.textContent = defaultMsg;
          noticeEl.classList.remove("err");
          activateBtn.textContent = "ACTIVATE";
          activateBtn.removeAttribute("disabled");
        }, 3000);
        return;
      }

      const emailInput = document.querySelector("#registration_email");
      try {
        const newAccounts = await ethereum.request({
          method: "eth_requestAccounts",
        });

        if (newAccounts.length > 0) {
          const connectedAddress = newAccounts[0];

          try {
            const response = await fetch(ajaxurl, {
              method: "POST",
              body: new URLSearchParams({
                email: emailInput.value,
                address: connectedAddress,
                plugin: "meta-locker",
                action: "metalocker_activate_site",
              }),
            });
            const result = await response.json();
            if (result.success) {
              noticeEl.classList.add("ok");
              noticeEl.textContent = result.message;
              activateBtn.textContent = "ACTIVATED";
              setTimeout(
                () => (window.location.href = metaLocker.adminURL),
                3000
              );
            } else {
              noticeEl.classList.add("err");
              noticeEl.textContent = result.message;
              activateBtn.textContent = "ACTIVATE";
              activateBtn.removeAttribute("disabled");
            }
          } catch (error) {
            console.log(error);
          }
        }
      } catch (error) {
        console.log(error);
      }
    });
  }
});
