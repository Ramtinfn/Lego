/* Shahyad storefront: catalogue, shipping totals, Stripe checkout hand-off,
 * and conversion analytics (GA4 + Meta Pixel, loaded only when the site
 * owner has configured their IDs — no tracking otherwise).
 *
 * Funnel events (GA4 recommended-ecommerce naming):
 *   page_view (automatic) -> view_item -> select_item
 *   -> pay_securely_click (custom) -> begin_checkout -> purchase
 * `purchase` fires on success.html only after /api/order-status verifies
 * the payment with Stripe server-side. No PII is sent to analytics.
 */

(function () {
  "use strict";

  /* ---------------- attribution (first touch per session) -------------- */
  var ATTR_KEY = "pib_attr";
  function captureAttribution() {
    try {
      if (sessionStorage.getItem(ATTR_KEY)) return;
      var q = new URLSearchParams(window.location.search);
      var ref = document.referrer || "";
      var attr = {
        source: q.get("utm_source") || (ref ? new URL(ref).hostname : ""),
        medium: q.get("utm_medium") || (ref ? "referral" : "direct"),
        campaign: q.get("utm_campaign") || "",
        referrer: ref.slice(0, 120),
        landing: (window.location.pathname + window.location.search).slice(0, 120)
      };
      sessionStorage.setItem(ATTR_KEY, JSON.stringify(attr));
    } catch (e) { /* storage unavailable: attribution simply omitted */ }
  }
  function getAttribution() {
    try { return JSON.parse(sessionStorage.getItem(ATTR_KEY)) || {}; }
    catch (e) { return {}; }
  }
  captureAttribution();

  /* ---------------- analytics loaders and dispatcher ------------------- */
  var FB_MAP = { begin_checkout: "InitiateCheckout", purchase: "Purchase" };

  function loadGa4(id) {
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", id);
  }

  function loadMetaPixel(id) {
    /* Standard Meta Pixel bootstrap */
    (function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = true; n.version = "2.0";
      n.queue = []; t = b.createElement(e); t.async = true; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", id);
    window.fbq("track", "PageView");
  }

  function track(event, params) {
    params = params || {};
    try { if (window.gtag) window.gtag("event", event, params); } catch (e) {}
    try {
      if (window.fbq) {
        var std = FB_MAP[event];
        var fbParams = { value: params.value, currency: params.currency,
          content_name: params.content_name || (params.items && params.items[0] && params.items[0].item_name) };
        if (std) window.fbq("track", std, fbParams);
        else window.fbq("trackCustom", event, fbParams);
      }
    } catch (e) {}
  }
  window.pibTrack = track;

  /* ---------------- storefront ----------------------------------------- */
  function money(cents) {
    try {
      return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);
    } catch (e) {
      return "A$" + (cents / 100).toFixed(2);
    }
  }

  function itemFor(data, model, editionId) {
    var p = data.products[model];
    var ed = p.editions[editionId];
    return {
      item_id: model + "_" + editionId,
      item_name: p.name + " — " + ed.name,
      price: ed.unitAmount / 100,
      currency: "AUD",
      quantity: 1
    };
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
    edition.addEventListener("change", function () {
      track("select_item", { items: [itemFor(data, model, edition.value)] });
    });
    refresh();

    if (!data.salesEnabled) {
      btn.disabled = true;
      btn.textContent = "Opening soon";
      var note = document.createElement("p");
      note.className = "order-note";
      note.innerHTML = "Ordering is temporarily unavailable. <a href='mailto:ramtinf@gmail.com'>Email us</a> and we will let you know when it reopens.";
      btn.insertAdjacentElement("afterend", note);
      return;
    }

    btn.addEventListener("click", function () {
      err.classList.remove("show");
      btn.disabled = true;
      btn.textContent = "Taking you to payment";

      var n = parseInt(qty.value, 10) || 1;
      var unit = product.editions[edition.value].unitAmount;
      var zone = data.countryZone[country.value];
      var total = (unit + product.shipping[zone]) * n / 100;
      var item = itemFor(data, model, edition.value);
      item.quantity = n;

      track("pay_securely_click", {
        value: total, currency: "AUD", items: [item],
        content_name: item.item_name, destination: country.value
      });

      fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model,
          edition: edition.value,
          country: country.value,
          quantity: n,
          attribution: getAttribution()
        })
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          if (res.ok && res.data && res.data.url) {
            track("begin_checkout", { value: total, currency: "AUD", items: [item] });
            /* brief pause so the event leaves before navigation */
            setTimeout(function () { window.location.href = res.data.url; }, 250);
            return;
          }
          err.innerHTML = ((res.data && res.data.error) || "Checkout is not available right now. Please try again shortly.") + " If this keeps happening, <a href='mailto:ramtinf@gmail.com?subject=Checkout%20problem%20persiainbricks.com.au'>email us</a> and we will sort it out.";
          err.classList.add("show");
          btn.disabled = false;
          btn.textContent = "Pay securely";
        })
        .catch(function () {
          err.innerHTML = "We could not reach the payment service. Check your connection and try again, or <a href='mailto:ramtinf@gmail.com?subject=Checkout%20problem%20persiainbricks.com.au'>email us</a>.";
          err.classList.add("show");
          btn.disabled = false;
          btn.textContent = "Pay securely";
        });
    });
  }

  function watchViewItem(data) {
    if (!("IntersectionObserver" in window)) return;
    var seen = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var model = entry.target.id;
        if (!data.products[model] || seen[model]) return;
        seen[model] = true;
        io.unobserve(entry.target);
        var p = data.products[model];
        track("view_item", {
          currency: "AUD",
          value: p.editions.compat.unitAmount / 100,
          items: [itemFor(data, model, "compat")]
        });
      });
    }, { threshold: 0.3 });
    Object.keys(data.products).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) io.observe(el);
    });
  }

  fetch("/api/catalogue")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.analytics) {
        try { if (data.analytics.ga4) loadGa4(data.analytics.ga4); } catch (e) {}
        try { if (data.analytics.metaPixel) loadMetaPixel(data.analytics.metaPixel); } catch (e) {}
      }
      document.querySelectorAll(".order-panel[data-model]").forEach(function (panel) {
        setupPanel(panel, data);
      });
      watchViewItem(data);
    })
    .catch(function () {
      document.querySelectorAll('.order-panel [data-role="error"]').forEach(function (el) {
        el.textContent = "The catalogue couldn't load. Refresh the page to order.";
        el.classList.add("show");
      });
    });
})();
