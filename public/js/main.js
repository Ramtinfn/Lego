/* Storefront behaviour: live prices from the Worker + Stripe checkout hand-off. */

(function () {
  "use strict";

  var btn = document.getElementById("checkout-btn");
  var qty = document.getElementById("qty");
  var errBox = document.getElementById("order-error");

  function formatMoney(cents, currency) {
    try {
      return new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: (currency || "aud").toUpperCase()
      }).format(cents / 100);
    } catch (e) {
      return "A$" + (cents / 100).toFixed(2);
    }
  }

  // Pull the authoritative prices from the Worker so they're defined in one place.
  fetch("/api/product")
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (p) {
      if (!p || !p.variants) return;
      var amounts = [];
      p.variants.forEach(function (v) {
        amounts.push(v.unitAmount);
        var el = document.getElementById("price-" + v.id);
        if (el) el.textContent = formatMoney(v.unitAmount, p.currency);
      });
      var hero = document.getElementById("price");
      if (hero && amounts.length) {
        hero.textContent = "From " + formatMoney(Math.min.apply(null, amounts), p.currency);
      }
    })
    .catch(function () { /* static prices in the HTML stand */ });

  function selectedVariant() {
    var checked = document.querySelector('input[name="variant"]:checked');
    return checked ? checked.value : "compat";
  }

  function showError(message) {
    if (!errBox) return;
    errBox.textContent = message;
    errBox.classList.add("show");
  }

  if (btn) {
    btn.addEventListener("click", function () {
      errBox.classList.remove("show");
      btn.disabled = true;
      btn.textContent = "Taking you to payment";

      fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variant: selectedVariant(),
          quantity: parseInt(qty ? qty.value : "1", 10) || 1
        })
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          if (res.ok && res.data && res.data.url) {
            window.location.href = res.data.url;
            return;
          }
          showError((res.data && res.data.error) || "Checkout is not available right now. Please try again shortly.");
          btn.disabled = false;
          btn.textContent = "Pay securely";
        })
        .catch(function () {
          showError("We couldn't reach the payment service. Check your connection and try again.");
          btn.disabled = false;
          btn.textContent = "Pay securely";
        });
    });
  }
})();
