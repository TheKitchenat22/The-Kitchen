/**
 * Public-menu traffic tracker (not loaded on admin.html).
 * Sends pageviews + clicks to KitchenStore / local API for the admin Tráfico tab.
 */
(function () {
  "use strict";

  if (/admin\.html/i.test(location.pathname)) return;

  const VISITOR_KEY = "kitchen-vid";
  const IP_KEY = "kitchen-vip";
  const queue = [];
  let flushTimer = null;
  let ip = "";

  function visitorId() {
    try {
      let id = sessionStorage.getItem(VISITOR_KEY);
      if (!id) {
        id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        sessionStorage.setItem(VISITOR_KEY, id);
      }
      return id;
    } catch {
      return "anon";
    }
  }

  function clickLabel(el) {
    if (!el || el === document.body || el === document.documentElement) return "";
    if (el.dataset && el.dataset.add) return "add:" + el.dataset.add;
    if (el.dataset && el.dataset.orderType) return "orderType:" + el.dataset.orderType;
    if (el.id === "sendWhatsApp" || el.closest?.("#sendWhatsApp")) return "whatsapp";
    if (el.id === "fabCart" || el.closest?.("#fabCart")) return "open-cart";
    if (el.dataset && el.dataset.section) return "nav:" + el.dataset.section;
    const href = el.getAttribute && el.getAttribute("href");
    if (href && href.startsWith("#")) return "jump:" + href.slice(1);
    const txt = (el.innerText || el.getAttribute("aria-label") || el.id || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    const tag = (el.tagName || "").toLowerCase();
    if (txt) return tag + ":" + txt;
    return tag || "click";
  }

  function enqueue(ev) {
    queue.push({
      type: ev.type || "pageview",
      path: ev.path || location.pathname + location.hash,
      label: ev.label || "",
      visitor: visitorId(),
      ip,
      ref: document.referrer || "",
      lang: document.documentElement.lang || navigator.language || "",
      ua: (navigator.userAgent || "").slice(0, 180),
      t: new Date().toISOString(),
    });
    if (queue.length >= 8) flush();
    else {
      clearTimeout(flushTimer);
      flushTimer = setTimeout(flush, 2500);
    }
  }

  async function flush() {
    clearTimeout(flushTimer);
    if (!queue.length) return;
    const batch = queue.splice(0, queue.length);
    try {
      if (window.KitchenStore && KitchenStore.trackAnalytics) {
        await KitchenStore.trackAnalytics(batch);
      } else {
        await fetch("/api/analytics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "track", events: batch }),
          keepalive: true,
        });
      }
    } catch (_) {
      /* ignore — analytics is best-effort */
    }
  }

  async function resolveIp() {
    try {
      const cached = sessionStorage.getItem(IP_KEY);
      if (cached) {
        ip = cached;
        return;
      }
    } catch (_) {}
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch("https://api.ipify.org?format=json", { signal: ctrl.signal });
      clearTimeout(t);
      const data = await res.json();
      ip = String(data.ip || "").slice(0, 80);
      try {
        sessionStorage.setItem(IP_KEY, ip);
      } catch (_) {}
    } catch (_) {
      ip = "";
    }
  }

  function onClick(e) {
    const t = e.target;
    const hit = t.closest
      ? t.closest("a, button, [data-add], [data-order-type], .chip, .menu-card, .tab, .menu-switcher__btn")
      : t;
    if (!hit || hit.closest?.("#announceOverlay")) return;
    const label = clickLabel(hit);
    if (!label) return;
    enqueue({ type: "click", label, path: location.pathname + location.hash });
  }

  function boot() {
    enqueue({
      type: "pageview",
      path: location.pathname + location.hash || "/",
      label: "menu",
    });
    document.addEventListener("click", onClick, true);
    window.addEventListener("hashchange", () => {
      enqueue({
        type: "section",
        path: location.pathname + location.hash,
        label: (location.hash || "#").slice(1) || "top",
      });
    });
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
  }

  resolveIp().finally(() => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  });
})();
