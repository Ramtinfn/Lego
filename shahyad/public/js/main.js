/* Shahyad storefront: live catalogue, shipping estimate, Stripe checkout hand-off. */

(function () {
  "use strict";

  var catalogue = null;

  function money(cents) {
    try {
      return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);
    } catch (e) {
      return "A$" + (cents / 100).toFixed(2);
    }
  }

  function populateCountries(select, data) {
    var groups = { AU: [], NZ: [], ASIA: [], WORLD: [] };
    Object.keys(data.countryZone).forEach(function (code) {
      groups[data.countryZone[code]].push(code);
    });
    var labels = { AU: "Australia", NZ: "New Zealand", ASIA: "Asia", WORLD: "Rest of the world" };
    select.innerHTML = "";
    ["AU", "NZ", "ASIA", "WORLD"].forEach(function (zone) {
      var og = document.createElement("optgroup");
      og.label = labels[zone];
      groups[zone]
        .sort(function (a, b) { return data.countryNames[a].localeCompare(data.countryNames[b]); })
        .forEach(function (code) {
          var opt = document.createElement("option");
          opt.value = code;
          opt.textContent = data.countryNames[code];
          if (code === "AU") opt.selected = true;
          og.appendChild(opt);
        });
      select.appendChild(og);
    });
  }

  function setupPanel(panel, data) {
    var model = panel.getAttribute("data-model");
    var product = data.products[model];
    var edition = panel.querySelector('[data-role="edition"]');
    var country = panel.querySelector('[data-role="country"]');
    var qty = panel.querySelector('[data-role="qty"]');
    var btn = panel.querySelector('[data-role="checkout"]');
    var err = panel.querySelector('[data-role="error"]');

    populateCountries(country, data);

    function refresh() {
      var unit = product.editions[edition.value].unitAmount;
      var zone = data.countryZone[country.value];
      var ship = product.shipping[zone];
      var n = parseInt(qty.value, 10) || 1;
      panel.querySelector('[data-role="set-price"]').textContent =
        n > 1 ? n + " × " + money(unit) : money(unit);
      panel.querySelector('[data-role="ship-price"]').textContent = money(ship * n);
      panel.querySelector('[data-role="total"]').textContent = money((unit + ship) * n);
    }

    [edition, country, qty].forEach(function (el) { el.addEventListener("change", refresh); });
    refresh();

    btn.addEventListener("click", function () {
      err.classList.remove("show");
      btn.disabled = true;
      btn.textContent = "Taking you to payment";
      fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model,
          edition: edition.value,
          country: country.value,
          quantity: parseInt(qty.value, 10) || 1
        })
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          if (res.ok && res.data && res.data.url) { window.location.href = res.data.url; return; }
          err.textContent = (res.data && res.data.error) || "Checkout is not available right now. Please try again shortly.";
          err.classList.add("show");
          btn.disabled = false;
          btn.textContent = "Pay securely";
        })
        .catch(function () {
          err.textContent = "We couldn't reach the payment service. Check your connection and try again.";
          err.classList.add("show");
          btn.disabled = false;
          btn.textContent = "Pay securely";
        });
    });
  }

  fetch("/api/catalogue")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      catalogue = data;
      document.querySelectorAll(".order-panel[data-model]").forEach(function (panel) {
        setupPanel(panel, data);
      });
    })
    .catch(function () {
      document.querySelectorAll('.order-panel [data-role="error"]').forEach(function (el) {
        el.textContent = "The catalogue couldn't load. Refresh the page to order.";
        el.classList.add("show");
      });
    });
})();
