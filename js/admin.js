/**
 * The Kitchen at 22 — dedicated admin dashboard
 * Auth: sessionStorage kitchen-admin + long staff code
 */
(function () {
  "use strict";

  const ADMIN_CODE = "oCW6x3Kiyx9PwqFd";
  const ADMIN_KEY = "kitchen-admin";
  const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const DEFAULT_HOURS = {
    closedDays: [2],
    open: "14:00",
    close: "21:00",
    deliveryClose: "20:30",
    forceClosed: false,
    forceOpen: false,
  };

  let MENU = window.KITCHEN_MENU || {};
  let FLAT = window.KITCHEN_FLAT || [];
  const ITEM_I18N = window.KITCHEN_ITEM_I18N || { es: {}, en: {} };

  const state = {
    authed: sessionStorage.getItem(ADMIN_KEY) === "1",
    outOfStock: new Set(),
    hours: { ...DEFAULT_HOURS },
    orders: [],
    tab: "kitchen",
    kitchenPoll: null,
    showDone: false,
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function toast(msg) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("is-show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("is-show"), 2400);
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function nameFor(id, fallback) {
    const es = ITEM_I18N.es && ITEM_I18N.es[id];
    if (es) return es;
    if (fallback) return fallback;
    const it = FLAT.find((x) => x.id === id);
    return (it && it.name) || id;
  }

  function rebuildFlat(menu) {
    const out = [];
    Object.values(menu || {}).forEach((section) => {
      const secId = section.id || "";
      Object.entries(section.subcategories || {}).forEach(([subKey, sub]) => {
        (sub.items || []).forEach((item) => {
          out.push({
            ...item,
            sectionId: secId,
            section: secId,
            sectionTitle: section.title || "",
            subKey,
            subLabel: sub.label || subKey,
          });
        });
      });
    });
    FLAT = out;
    window.KITCHEN_FLAT = out;
  }

  function applyMenu(menu) {
    if (!menu || typeof menu !== "object") return;
    MENU = menu;
    window.KITCHEN_MENU = menu;
    rebuildFlat(menu);
  }

  /* —— Variant defs (mirror public app) —— */
  function beerBrandDefs() {
    return [
      { k: "corona", stockId: "b-beer-corona", label: "Corona" },
      { k: "pacifico", stockId: "b-beer-pacifico", label: "Pacífico" },
      { k: "negra_modelo", stockId: "b-beer-negra-modelo", label: "Negra Modelo" },
      { k: "modelo", stockId: "b-beer-modelo", label: "Modelo" },
      { k: "victoria", stockId: "b-beer-victoria", label: "Victoria" },
      { k: "amstel", stockId: "b-beer-amstel", label: "Amstel" },
      { k: "heineken", stockId: "b-beer-heineken", label: "Heineken" },
    ];
  }
  function sodaOptionDefs() {
    return [
      { k: "coke", stockId: "d-soda-coke", label: "Coke Regular" },
      { k: "coke_zero", stockId: "d-soda-coke-zero", label: "Coke Zero" },
      { k: "coke_light", stockId: "d-soda-coke-light", label: "Coke Light" },
      { k: "sprite_zero", stockId: "d-soda-sprite-zero", label: "Sprite Zero" },
    ];
  }
  function boingOptionDefs() {
    return [
      { k: "grape", stockId: "d-boing-grape", label: "Uva" },
      { k: "mango", stockId: "d-boing-mango", label: "Mango" },
      { k: "strawberry", stockId: "d-boing-strawberry", label: "Fresa" },
      { k: "guava", stockId: "d-boing-guava", label: "Guayaba" },
    ];
  }
  function tacoOptionDefs() {
    return [
      { k: "steak", stockId: "f-taco-steak", label: "Bistec" },
      { k: "pastor", stockId: "f-taco-pastor", label: "Pastor" },
    ];
  }
  function spiritOptionDefs() {
    return [
      { k: "cognac", stockId: "b-spirit-cognac", label: "Cognac (Martell)" },
      { k: "gin_bombay", stockId: "b-spirit-gin-bombay", label: "Gin (Bombay)" },
      { k: "mezcal", stockId: "b-spirit-mezcal", label: "Mezcal (400 Conejos)" },
      { k: "rum", stockId: "b-spirit-rum", label: "Ron (Matusalem)" },
    ];
  }
  function fineSpiritOptionDefs() {
    return [
      { k: "tequila", stockId: "b-fine-tequila", label: "Tequila (Don Julio 70)" },
      { k: "vodka", stockId: "b-fine-vodka", label: "Vodka (Haku)" },
      { k: "whiskey", stockId: "b-fine-whiskey", label: "Whiskey (Woodford)" },
      { k: "gin_monkey", stockId: "b-fine-gin-monkey", label: "Gin (Monkey 47)" },
    ];
  }

  function variantOpts(item) {
    const flags = item.flags || [];
    const id = item.id;
    if (flags.includes("beer") || id === "b-cerveza") return beerBrandDefs();
    if (flags.includes("soda") || id === "d-refresco") return sodaOptionDefs();
    if (flags.includes("boing") || id === "d-boing") return boingOptionDefs();
    if (flags.includes("tacos") || id === "f-tacos") return tacoOptionDefs();
    if (flags.includes("spirits") || id === "b-spirits") return spiritOptionDefs();
    if (flags.includes("fineSpirits") || id === "b-fine-spirits") return fineSpiritOptionDefs();
    return null;
  }

  function isOut(id) {
    return state.outOfStock.has(String(id));
  }

  /* —— Auth —— */
  function showGate(show) {
    $("#adminGate")?.classList.toggle("is-hidden", !show);
    $("#adminShell")?.classList.toggle("is-hidden", show);
  }

  function loginWithCode(code) {
    // Strip spaces/newlines (paste / autocomplete glitches)
    const entered = String(code || "").replace(/\s+/g, "").trim();
    if (entered !== ADMIN_CODE) {
      $("#gateError")?.classList.remove("is-hidden");
      toast("Código incorrecto");
      return false;
    }
    state.authed = true;
    sessionStorage.setItem(ADMIN_KEY, "1");
    $("#gateError")?.classList.add("is-hidden");
    showGate(false);
    bootDashboard();
    return true;
  }

  function logout() {
    state.authed = false;
    sessionStorage.removeItem(ADMIN_KEY);
    stopKitchenPoll();
    showGate(true);
    toast("Sesión cerrada");
  }

  /* —— Persistence helpers —— */
  async function loadStock() {
    try {
      const data = window.KitchenStore
        ? await KitchenStore.getStock()
        : await (await fetch("/api/stock", { cache: "no-store" })).json();
      const ids = data.outOfStock || [];
      state.outOfStock = new Set(ids.map(String));
    } catch {
      state.outOfStock = new Set();
    }
  }

  async function saveStock() {
    const ids = [...state.outOfStock];
    try {
      if (window.KitchenStore) {
        await KitchenStore.setStock(ids, ADMIN_CODE);
      } else {
        await fetch("/api/stock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outOfStock: ids, code: ADMIN_CODE }),
        });
      }
      toast("Stock guardado");
    } catch {
      toast("No se pudo guardar stock");
    }
  }

  async function toggleStockId(id) {
    id = String(id);
    if (state.outOfStock.has(id)) state.outOfStock.delete(id);
    else state.outOfStock.add(id);
    renderStock();
    renderCatalog();
    await saveStock();
  }

  async function loadHours() {
    try {
      const data = window.KitchenStore
        ? await KitchenStore.getHours()
        : await (await fetch("/api/hours", { cache: "no-store" })).json();
      state.hours = { ...DEFAULT_HOURS, ...data };
    } catch {
      state.hours = { ...DEFAULT_HOURS };
    }
    fillHoursForm();
  }

  function fillHoursForm() {
    const h = state.hours;
    const set = (id, v) => {
      const el = $(id);
      if (el) el.value = v || "";
    };
    set("#hoursOpen", h.open);
    set("#hoursClose", h.close);
    set("#hoursDelivery", h.deliveryClose);
    $("#hoursForceClosed").checked = !!h.forceClosed;
    $("#hoursForceOpen").checked = !!h.forceOpen;
    const host = $("#hoursDays");
    if (!host) return;
    host.innerHTML = DAY_LABELS.map(
      (label, i) =>
        `<button type="button" class="adm-day${(h.closedDays || []).includes(i) ? " is-on" : ""}" data-day="${i}">${label}</button>`
    ).join("");
    $$(".adm-day", host).forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.classList.toggle("is-on");
      });
    });
  }

  async function saveHours() {
    const closedDays = $$(".adm-day.is-on").map((b) => parseInt(b.dataset.day, 10));
    const payload = {
      open: $("#hoursOpen")?.value || "14:00",
      close: $("#hoursClose")?.value || "21:00",
      deliveryClose: $("#hoursDelivery")?.value || "20:30",
      closedDays,
      forceClosed: !!$("#hoursForceClosed")?.checked,
      forceOpen: !!$("#hoursForceOpen")?.checked,
    };
    if (payload.forceClosed && payload.forceOpen) payload.forceOpen = false;
    try {
      if (window.KitchenStore) {
        state.hours = await KitchenStore.setHours(payload, ADMIN_CODE);
      } else {
        const res = await fetch("/api/hours", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, code: ADMIN_CODE }),
        });
        state.hours = await res.json();
      }
      fillHoursForm();
      toast("Horarios guardados");
    } catch {
      toast("Error al guardar horarios");
    }
  }

  async function loadMenu() {
    try {
      if (window.KitchenStore) {
        const menu = await KitchenStore.getMenu();
        if (menu) applyMenu(menu);
      } else {
        const res = await fetch("/api/menu", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.menu) applyMenu(data.menu);
        }
      }
    } catch (_) {
      /* keep bundled menu-data */
    }
  }

  async function loadAnnouncementForm() {
    try {
      const a = window.KitchenStore
        ? await KitchenStore.getAnnouncement()
        : await (await fetch("/api/announcement", { cache: "no-store" })).json();
      $("#announceEnabled").checked = !!a.enabled;
      $("#announceEs").value = a.messageEs || "";
      $("#announceEn").value = a.messageEn || "";
    } catch {
      /* ignore */
    }
  }

  async function saveAnnouncement() {
    const payload = {
      enabled: !!$("#announceEnabled")?.checked,
      messageEs: ($("#announceEs")?.value || "").trim(),
      messageEn: ($("#announceEn")?.value || "").trim(),
    };
    try {
      const saved = window.KitchenStore
        ? await KitchenStore.setAnnouncement(payload, ADMIN_CODE)
        : await (
            await fetch("/api/announcement", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...payload, code: ADMIN_CODE }),
            })
          ).json();
      $("#announceSaved").textContent = saved.enabled
        ? "Aviso activo en el menú público."
        : "Aviso guardado (oculto).";
      toast("Aviso guardado");
    } catch {
      toast("No se pudo guardar el aviso");
    }
  }

  /** Free MyMemory API — Spanish → English */
  async function translateEsToEn() {
    const es = ($("#announceEs")?.value || "").trim();
    const status = $("#announceTranslateStatus");
    if (!es) {
      toast("Escribe el mensaje en español primero");
      return;
    }
    if (status) status.textContent = "Traduciendo…";
    try {
      const url =
        "https://api.mymemory.translated.net/get?q=" +
        encodeURIComponent(es.slice(0, 500)) +
        "&langpair=es|en";
      const res = await fetch(url);
      const data = await res.json();
      const en =
        data?.responseData?.translatedText ||
        (data?.matches && data.matches[0] && data.matches[0].translation) ||
        "";
      if (!en || /INVALID|QUERY LENGTH/i.test(en)) throw new Error("bad_translate");
      $("#announceEn").value = en;
      if (status) status.textContent = "Listo — revisa y guarda";
      toast("Traducción lista");
    } catch {
      // Offline fallback: copy Spanish so staff can edit
      if (!$("#announceEn").value.trim()) $("#announceEn").value = es;
      if (status) status.textContent = "Traducción automática no disponible — edita EN a mano";
      toast("No se pudo traducir automáticamente");
    }
  }

  /* —— Kitchen —— */
  const SNACK_IDS = new Set(["f-galletas", "f-paletas", "f-bolsa", "f-waffle-d"]);

  /**
   * Beverages + snacks/sweets: still shown, but de-emphasized.
   * Kitchen does not prepare these — food & cooked items stay primary.
   */
  function isSecondaryKitchenItem(it) {
    if (!it) return false;
    const id = String(it.id || "");
    const section = String(it.sectionId || it.section || "").toLowerCase();
    const sub = String(it.subKey || it.subLabel || "").toLowerCase();
    if (section === "drinks" || section === "bar") return true;
    if (id.startsWith("d-") || id.startsWith("b-")) return true;
    if (SNACK_IDS.has(id)) return true;
    if (sub === "dulces" || sub.includes("dulce") || sub.includes("snack")) return true;
    // Resolve from live menu when order item lacks section
    const flat = FLAT.find((x) => x.id === id);
    if (flat) {
      const sid = String(flat.sectionId || flat.section || "").toLowerCase();
      const sk = String(flat.subKey || "").toLowerCase();
      if (sid === "drinks" || sid === "bar") return true;
      if (sk === "dulces") return true;
      if (String(flat.id || "").startsWith("d-") || String(flat.id || "").startsWith("b-")) return true;
      if (SNACK_IDS.has(String(flat.id))) return true;
    }
    return false;
  }

  function orderTypeLabel(o) {
    if (o.orderType === "dinein") return { text: "Comer aquí", cls: "k-ticket__where--dinein", ico: "🍽️" };
    if (o.orderType === "apartment")
      return { text: `Depto ${o.apartment || "—"}`, cls: "", ico: "🏠" };
    if (o.orderType === "amenity")
      return { text: o.amenity || "Amenidad", cls: "k-ticket__where--amenity", ico: "🏊" };
    return { text: o.orderType || "—", cls: "", ico: "📦" };
  }

  function parseOrderDate(iso) {
    if (!iso) return null;
    try {
      const d = new Date(String(iso).includes("T") ? iso : String(iso).replace(" ", "T"));
      return Number.isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }

  function formatTime(iso) {
    const d = parseOrderDate(iso);
    if (!d) return iso || "—";
    return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  }

  function formatDateTime(iso) {
    const d = parseOrderDate(iso);
    if (!d) return iso || "—";
    return d.toLocaleString("es-MX", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  /** Age styling: yellow ≥15 min, red ≥20 min (open tickets only) */
  function orderAgeClass(iso, isOpen) {
    if (!isOpen) return "";
    const d = parseOrderDate(iso);
    if (!d) return "";
    const mins = (Date.now() - d.getTime()) / 60000;
    if (mins >= 20) return "k-ticket__time--late";
    if (mins >= 15) return "k-ticket__time--warn";
    return "";
  }

  function orderAgeMinutes(iso) {
    const d = parseOrderDate(iso);
    if (!d) return null;
    return Math.floor((Date.now() - d.getTime()) / 60000);
  }

  /** Split customizations string into chef-friendly bullet lines */
  function splitModLines(text) {
    return String(text || "")
      .split(/[·|,;/]+|\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function renderItemModsAndNotes(it) {
    const modLines = splitModLines(it.customizations);
    const noteLines = splitModLines(it.notes);
    if (!modLines.length && !noteLines.length) return "";
    let html = `<ul class="k-item__detail-list">`;
    modLines.forEach((line) => {
      html += `<li class="k-item__mod"><span class="k-item__detail-tag">Mod</span>${escapeHtml(line)}</li>`;
    });
    noteLines.forEach((line) => {
      html += `<li class="k-item__note"><span class="k-item__detail-tag">Nota</span>${escapeHtml(line)}</li>`;
    });
    html += `</ul>`;
    return html;
  }

  function renderKitchen() {
    const board = $("#kitchenBoard");
    const stats = $("#kitchenStats");
    if (!board) return;
    const showDone = !!$("#kitchenShowDone")?.checked;
    state.showDone = showDone;
    const open = state.orders.filter((o) => o.status === "open");
    const list = showDone ? state.orders : open;

    if (stats) {
      const last = state.lastKitchenRefresh
        ? state.lastKitchenRefresh.toLocaleTimeString("es-MX", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        : "—";
      stats.innerHTML = `
        <span class="kitchen-stat">Abiertos <strong>${open.length}</strong></span>
        <span class="kitchen-stat">Completados hoy <strong>${countCompletedToday()}</strong></span>
        <span class="kitchen-stat">Total histórico <strong>${state.orders.length}</strong></span>
        <span class="kitchen-stat kitchen-stat--live">Auto · <strong>${escapeHtml(last)}</strong></span>
      `;
    }

    if (!list.length) {
      board.innerHTML = `<p class="admin-empty">${
        showDone ? "Sin pedidos en el historial." : "Sin pedidos abiertos. Se registran al enviar por WhatsApp."
      }</p>`;
      return;
    }

    // Food first, then secondary (drinks / snacks) — secondary still listed but gray
    board.innerHTML = list
      .map((o) => {
        const where = orderTypeLabel(o);
        const isDone = o.status !== "open";
        const isOpen = o.status === "open";
        const ageCls = orderAgeClass(o.createdAt, isOpen);
        const ageMin = orderAgeMinutes(o.createdAt);
        const ageLabel =
          isOpen && ageMin != null && ageMin >= 0
            ? `<span class="k-ticket__age ${ageCls}">${ageMin} min</span>`
            : "";

        const sorted = [...(o.items || [])].sort((a, b) => {
          const sa = isSecondaryKitchenItem(a) ? 1 : 0;
          const sb = isSecondaryKitchenItem(b) ? 1 : 0;
          return sa - sb;
        });

        const items = sorted
          .map((it) => {
            const secondary = isSecondaryKitchenItem(it);
            return `<li class="k-item${secondary ? " k-item--secondary" : ""}">
              <div class="k-item__name">
                <span class="k-item__qty">×${escapeHtml(it.qty)}</span>${escapeHtml(it.name)}
                ${secondary ? `<span class="k-item__sec-tag">Bar / dulce</span>` : ""}
              </div>
              ${renderItemModsAndNotes(it)}
              ${it.dineInOnly ? `<span class="k-item__badge">Solo en restaurante</span>` : ""}
            </li>`;
          })
          .join("");
        return `
        <article class="k-ticket${isDone ? " is-done" : ""}${ageCls === "k-ticket__time--late" ? " k-ticket--late" : ageCls === "k-ticket__time--warn" ? " k-ticket--warn" : ""}" data-order-id="${escapeHtml(o.id)}" data-created="${escapeHtml(o.createdAt || "")}">
          <div class="k-ticket__head">
            <div class="k-ticket__time-wrap">
              <div class="k-ticket__time ${ageCls}">${escapeHtml(formatTime(o.createdAt))}</div>
              ${ageLabel}
            </div>
            <div class="k-ticket__meta">
              ${escapeHtml(formatDateTime(o.createdAt))}<br />
              #${escapeHtml(String(o.id).slice(0, 8))}
              ${isDone ? `<br />${escapeHtml(o.status)}` : ""}
            </div>
          </div>
          <div class="k-ticket__where ${where.cls}">${where.ico} ${escapeHtml(where.text)}</div>
          <ul class="k-ticket__items">${items}</ul>
          ${
            o.status === "open"
              ? `<div class="k-ticket__actions">
            <button type="button" class="btn btn--primary" data-complete="${escapeHtml(o.id)}">Listo</button>
            <button type="button" class="btn btn--ghost" data-dismiss="${escapeHtml(o.id)}">Descartar</button>
          </div>`
              : o.status === "completed" || o.status === "dismissed"
                ? `<div class="k-ticket__actions">
            <button type="button" class="btn btn--ghost" data-reopen="${escapeHtml(o.id)}">Reabrir</button>
            <button type="button" class="btn btn--ghost k-btn-danger" data-delete="${escapeHtml(o.id)}">Eliminar</button>
          </div>`
                : ""
          }
        </article>`;
      })
      .join("");

    $$("[data-complete]", board).forEach((btn) => {
      btn.addEventListener("click", () => setOrderStatus(btn.dataset.complete, "completed"));
    });
    $$("[data-dismiss]", board).forEach((btn) => {
      btn.addEventListener("click", () => setOrderStatus(btn.dataset.dismiss, "dismissed"));
    });
    $$("[data-reopen]", board).forEach((btn) => {
      btn.addEventListener("click", () => setOrderStatus(btn.dataset.reopen, "open"));
    });
    $$("[data-delete]", board).forEach((btn) => {
      btn.addEventListener("click", () => deleteOrder(btn.dataset.delete));
    });
  }

  function countCompletedToday() {
    const today = new Date().toISOString().slice(0, 10);
    return state.orders.filter((o) => {
      if (o.status !== "completed") return false;
      const d = String(o.updatedAt || o.createdAt || "").slice(0, 10);
      return d === today || d.replace("T", " ").slice(0, 10) === today;
    }).length;
  }

  async function loadOrders(silent) {
    try {
      state.orders = window.KitchenStore
        ? await KitchenStore.getOrders(ADMIN_CODE)
        : (
            await (
              await fetch(`/api/orders?code=${encodeURIComponent(ADMIN_CODE)}`, {
                cache: "no-store",
              })
            ).json()
          ).orders || [];
      if (!Array.isArray(state.orders)) state.orders = [];
      state.lastKitchenRefresh = new Date();
    } catch {
      if (!silent) state.orders = state.orders || [];
    }
    if (state.tab === "kitchen" || !state.tab) renderKitchen();
    if (state.tab === "report") renderReport();
  }

  async function setOrderStatus(id, status) {
    try {
      if (window.KitchenStore) {
        await KitchenStore.setOrderStatus(id, status, ADMIN_CODE);
      } else {
        await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: id, status, code: ADMIN_CODE }),
        });
      }
      await loadOrders();
      toast(status === "completed" ? "Pedido listo" : status === "dismissed" ? "Descartado" : "Reabierto");
    } catch {
      toast("No se pudo actualizar el pedido");
    }
  }

  async function deleteOrder(id) {
    if (!confirm("¿Eliminar este pedido de la base de datos? No se puede deshacer.")) return;
    try {
      if (window.KitchenStore) {
        const data = await KitchenStore.deleteOrders({ action: "delete", orderId: id }, ADMIN_CODE);
        if (Array.isArray(data.orders)) state.orders = data.orders;
      } else {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", orderId: id, code: ADMIN_CODE }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "delete");
        if (Array.isArray(data.orders)) state.orders = data.orders;
      }
      await loadOrders();
      toast("Pedido eliminado");
    } catch {
      toast("No se pudo eliminar");
    }
  }

  async function purgeCompletedOrders() {
    const n = state.orders.filter((o) => o.status === "completed" || o.status === "dismissed").length;
    if (!n) {
      toast("No hay completados/descartados para borrar");
      return;
    }
    if (
      !confirm(
        `¿Eliminar ${n} pedido(s) completado(s) o descartado(s) de la base de datos?\nLos abiertos se conservan. No se puede deshacer.`
      )
    ) {
      return;
    }
    try {
      if (window.KitchenStore) {
        const data = await KitchenStore.deleteOrders({ action: "delete_completed" }, ADMIN_CODE);
        if (Array.isArray(data.orders)) state.orders = data.orders;
        toast(`Eliminados: ${data.deleted || n}`);
      } else {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete_completed", code: ADMIN_CODE }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "purge");
        if (Array.isArray(data.orders)) state.orders = data.orders;
        toast(`Eliminados: ${data.deleted || n}`);
      }
      await loadOrders();
      if (state.tab === "report") renderReport();
    } catch {
      toast("No se pudo borrar el historial");
    }
  }

  function startKitchenPoll() {
    stopKitchenPoll();
    // Fetch new tickets often while dashboard is open
    state.kitchenPoll = setInterval(() => {
      loadOrders(true);
    }, 4000);
    // Re-paint age colors (15 / 20 min) even if no new orders
    state.kitchenAgeTimer = setInterval(() => {
      if (state.tab === "kitchen") renderKitchen();
    }, 15000);
    // Refresh when tab becomes visible again (iPad lock / switch apps)
    if (!state.visibilityBound) {
      state.visibilityBound = true;
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && state.authed) {
          loadOrders(true);
        }
      });
    }
  }

  function stopKitchenPoll() {
    if (state.kitchenPoll) clearInterval(state.kitchenPoll);
    state.kitchenPoll = null;
    if (state.kitchenAgeTimer) clearInterval(state.kitchenAgeTimer);
    state.kitchenAgeTimer = null;
  }

  /* —— Stock UI —— */
  function renderStock() {
    const host = $("#stockList");
    if (!host) return;
    const q = ($("#stockFilter")?.value || "").trim().toLowerCase();
    const rows = FLAT.filter((item) => {
      if (!q) return true;
      const n = nameFor(item.id, item.name).toLowerCase();
      return n.includes(q) || String(item.id).toLowerCase().includes(q);
    });
    host.innerHTML = rows
      .map((item) => {
        const opts = variantOpts(item);
        const oos = isOut(item.id);
        let optsHtml = "";
        if (opts) {
          optsHtml = `<div class="stock-row__opts">${opts
            .map((o) => {
              const bad = isOut(o.stockId);
              return `<button type="button" class="btn-stock-pill${bad ? " is-oos" : ""}" data-stock="${escapeHtml(
                o.stockId
              )}">${escapeHtml(o.label)}${bad ? " ✕" : ""}</button>`;
            })
            .join("")}</div>`;
        }
        return `<div class="stock-row">
          <div class="stock-row__name">${escapeHtml(nameFor(item.id, item.name))}
            <div class="stock-row__id">${escapeHtml(item.id)} · ${escapeHtml(item.subLabel || "")}</div>
          </div>
          ${
            opts
              ? ""
              : `<button type="button" class="btn btn--ghost btn--sm btn-stock-pill${oos ? " is-oos" : ""}" data-stock="${escapeHtml(
                  item.id
                )}">${oos ? "Agotado" : "En stock"}</button>`
          }
          ${optsHtml}
        </div>`;
      })
      .join("");
    $$("[data-stock]", host).forEach((btn) => {
      btn.addEventListener("click", () => toggleStockId(btn.dataset.stock));
    });
  }

  /* —— Catalog (light) —— */
  function renderCatalog() {
    const host = $("#catalogListAdm");
    if (!host) return;
    const q = ($("#catalogFilterAdm")?.value || "").trim().toLowerCase();
    const rows = FLAT.filter((item) => {
      if (!q) return true;
      const n = nameFor(item.id, item.name).toLowerCase();
      return n.includes(q) || String(item.id).toLowerCase().includes(q);
    });
    host.innerHTML = rows
      .map((item) => {
        const isNew = !!item.isNew;
        const weekly = !!item.isWeeklySpecial;
        const qty = parseInt(item.weeklyQty, 10) || 0;
        return `<div class="cat-row" data-id="${escapeHtml(item.id)}">
          <div class="cat-row__name">${escapeHtml(nameFor(item.id, item.name))}
            <div class="stock-row__id">${escapeHtml(item.id)} · $${item.price || 0}${
          weekly ? ` · Especial (${qty})` : ""
        }${isNew ? " · NUEVO" : ""}</div>
          </div>
          <div class="cat-row__actions">
            <button type="button" class="btn btn--ghost btn--sm" data-toggle-new="${escapeHtml(item.id)}">${
              isNew ? "Quitar nuevo" : "Marcar nuevo"
            }</button>
            <button type="button" class="btn btn--ghost btn--sm" data-toggle-weekly="${escapeHtml(item.id)}">${
              weekly ? "Quitar especial" : "Especial semanal"
            }</button>
            ${
              weekly
                ? `<button type="button" class="btn btn--ghost btn--sm" data-edit-qty="${escapeHtml(
                    item.id
                  )}">Cantidad (${qty})</button>`
                : ""
            }
            <button type="button" class="btn btn--ghost btn--sm" data-edit-price="${escapeHtml(item.id)}">Precio</button>
          </div>
        </div>`;
      })
      .join("");

    $$("[data-toggle-new]", host).forEach((btn) => {
      btn.addEventListener("click", () => toggleNew(btn.dataset.toggleNew));
    });
    $$("[data-toggle-weekly]", host).forEach((btn) => {
      btn.addEventListener("click", () => toggleWeekly(btn.dataset.toggleWeekly));
    });
    $$("[data-edit-qty]", host).forEach((btn) => {
      btn.addEventListener("click", () => editWeeklyQty(btn.dataset.editQty));
    });
    $$("[data-edit-price]", host).forEach((btn) => {
      btn.addEventListener("click", () => editPrice(btn.dataset.editPrice));
    });
  }

  async function menuUpdate(itemId, fields) {
    try {
      const data = window.KitchenStore
        ? await KitchenStore.menuItem({ action: "update", itemId, ...fields }, ADMIN_CODE)
        : await (
            await fetch("/api/menu/item", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code: ADMIN_CODE, action: "update", itemId, ...fields }),
            })
          ).json();
      if (data.menu) applyMenu(data.menu);
      else {
        // patch local
        const it = FLAT.find((x) => x.id === itemId);
        if (it) Object.assign(it, fields);
      }
      renderCatalog();
      renderStock();
      toast("Menú actualizado");
    } catch {
      toast("Error al actualizar menú (¿servidor / JSONBin?)");
    }
  }

  async function toggleNew(id) {
    const it = FLAT.find((x) => x.id === id);
    await menuUpdate(id, { isNew: !(it && it.isNew) });
  }

  async function toggleWeekly(id) {
    const it = FLAT.find((x) => x.id === id);
    const on = !(it && it.isWeeklySpecial);
    const fields = { isWeeklySpecial: on };
    if (on && !(it && it.weeklyQty > 0)) fields.weeklyQty = 10;
    await menuUpdate(id, fields);
  }

  async function editWeeklyQty(id) {
    const it = FLAT.find((x) => x.id === id);
    const cur = (it && it.weeklyQty) || 0;
    const v = prompt("Cantidad disponible del especial", String(cur));
    if (v == null) return;
    const n = parseInt(v, 10);
    if (!Number.isFinite(n) || n < 0) {
      toast("Cantidad inválida");
      return;
    }
    await menuUpdate(id, { weeklyQty: n, isWeeklySpecial: true });
  }

  async function editPrice(id) {
    const it = FLAT.find((x) => x.id === id);
    const cur = (it && it.price) || 0;
    const v = prompt("Nuevo precio (MXN)", String(cur));
    if (v == null) return;
    const n = parseInt(v, 10);
    if (!Number.isFinite(n) || n < 0) {
      toast("Precio inválido");
      return;
    }
    await menuUpdate(id, { price: n });
  }

  /* —— Reporting (no money) —— */
  // reportPeriod: "day" | "week" | "month"
  if (!state.reportPeriod) state.reportPeriod = "week";

  function localDayKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function orderDateObj(o) {
    return parseOrderDate(o.createdAt);
  }

  function ordersInPeriod(orders, period) {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    if (period === "week") {
      start.setDate(start.getDate() - 6);
    } else if (period === "month") {
      start.setDate(start.getDate() - 29);
    }
    // day = today only
    return (orders || []).filter((o) => {
      const d = orderDateObj(o);
      if (!d) return false;
      return d >= start && d <= now;
    });
  }

  function periodLabel(period) {
    if (period === "day") return "Hoy";
    if (period === "week") return "Últimos 7 días";
    return "Últimos 30 días";
  }

  /** Simple CSS bar chart */
  function barChartHtml(rows, { valueKey = "v", labelKey = "l", maxBars = 31 } = {}) {
    const data = rows.slice(0, maxBars);
    const max = Math.max(1, ...data.map((r) => r[valueKey] || 0));
    if (!data.length) {
      return `<p class="adm-muted">Sin datos en este periodo</p>`;
    }
    return `<div class="r-chart" role="img" aria-label="Gráfico">
      ${data
        .map((r) => {
          const v = r[valueKey] || 0;
          const pct = Math.round((v / max) * 100);
          return `<div class="r-chart__row">
            <span class="r-chart__label">${escapeHtml(r[labelKey])}</span>
            <div class="r-chart__track"><div class="r-chart__bar" style="width:${pct}%"></div></div>
            <span class="r-chart__val">${v}</span>
          </div>`;
        })
        .join("")}
    </div>`;
  }

  function hourChartHtml(byHour) {
    const max = Math.max(1, ...byHour);
    const cells = byHour
      .map((v, h) => {
        const pct = Math.round((v / max) * 100);
        const hh = String(h).padStart(2, "0");
        return `<div class="r-hour__cell" title="${hh}:00 — ${v} pedidos">
          <div class="r-hour__bar" style="height:${Math.max(v ? 8 : 2, pct)}%"></div>
          <span class="r-hour__h">${h % 3 === 0 ? hh : ""}</span>
        </div>`;
      })
      .join("");
    return `<div class="r-hour">${cells}</div>
      <p class="adm-muted r-hour__hint">Pedidos por hora del día (0–23) en el periodo</p>`;
  }

  function fillApartmentSelect(orders) {
    const sel = $("#reportAptSelect");
    if (!sel) return;
    const prev = sel.value;
    const apts = new Set();
    (orders || []).forEach((o) => {
      if (o.orderType === "apartment" && o.apartment) apts.add(String(o.apartment).trim());
    });
    const list = [...apts].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    sel.innerHTML =
      `<option value="">— Selecciona —</option>` +
      list.map((a) => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join("");
    if (prev && list.includes(prev)) sel.value = prev;
  }

  function renderApartmentDetail() {
    const host = $("#reportAptDetail");
    const sel = $("#reportAptSelect");
    if (!host || !sel) return;
    const apt = (sel.value || "").trim();
    if (!apt) {
      host.innerHTML = `<p class="adm-muted">Selecciona un departamento.</p>`;
      return;
    }
    const orders = (state.orders || [])
      .filter((o) => o.orderType === "apartment" && String(o.apartment || "").trim() === apt)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

    const itemCount = {};
    let totalPieces = 0;
    const byDay = {};
    const hour = Array.from({ length: 24 }, () => 0);
    orders.forEach((o) => {
      const day = String(o.createdAt || "").slice(0, 10);
      if (day) byDay[day] = (byDay[day] || 0) + 1;
      const d = orderDateObj(o);
      if (d) hour[d.getHours()] += 1;
      (o.items || []).forEach((it) => {
        const key = it.name || it.id || "?";
        const q = it.qty || 1;
        itemCount[key] = (itemCount[key] || 0) + q;
        totalPieces += q;
      });
    });
    const topItems = Object.entries(itemCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
    const dayRows = Object.entries(byDay)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 20);

    const recent = orders.slice(0, 12);

    host.innerHTML = `
      <div class="report-apt-stats">
        <span class="kitchen-stat">Pedidos <strong>${orders.length}</strong></span>
        <span class="kitchen-stat">Piezas <strong>${totalPieces}</strong></span>
        <span class="kitchen-stat">Días con pedido <strong>${Object.keys(byDay).length}</strong></span>
      </div>
      <div class="report-grid" style="margin-top:0.85rem">
        <div class="report-card">
          <h3>Productos favoritos · Depto ${escapeHtml(apt)}</h3>
          <table>
            <tr><th>Producto</th><th>Cant.</th></tr>
            ${
              topItems.length
                ? topItems.map(([n, c]) => `<tr><td>${escapeHtml(n)}</td><td>${c}</td></tr>`).join("")
                : `<tr><td colspan="2">Sin datos</td></tr>`
            }
          </table>
        </div>
        <div class="report-card">
          <h3>Actividad por día</h3>
          ${barChartHtml(
            dayRows.map(([d, v]) => ({ l: d.slice(5), v })),
            { maxBars: 20 }
          )}
        </div>
        <div class="report-card report-card--wide">
          <h3>Horas habituales</h3>
          ${hourChartHtml(hour)}
        </div>
        <div class="report-card report-card--wide">
          <h3>Últimos pedidos</h3>
          <table>
            <tr><th>Fecha</th><th>Estado</th><th>Items</th></tr>
            ${
              recent.length
                ? recent
                    .map((o) => {
                      const names = (o.items || [])
                        .map((it) => `×${it.qty || 1} ${it.name || it.id}`)
                        .join(", ");
                      return `<tr>
                        <td>${escapeHtml(formatDateTime(o.createdAt))}</td>
                        <td>${escapeHtml(o.status || "")}</td>
                        <td>${escapeHtml(names)}</td>
                      </tr>`;
                    })
                    .join("")
                : `<tr><td colspan="3">Sin pedidos</td></tr>`
            }
          </table>
        </div>
      </div>
    `;
  }

  function renderReport() {
    const host = $("#reportGrid");
    if (!host) return;
    const period = state.reportPeriod || "week";
    const all = state.orders || [];
    const orders = ordersInPeriod(all, period);
    const totalOrders = orders.length;
    const openN = orders.filter((o) => o.status === "open").length;
    const completedN = orders.filter((o) => o.status === "completed").length;

    // By day in period (chronological for chart)
    const byDay = {};
    orders.forEach((o) => {
      const d = orderDateObj(o);
      if (!d) return;
      const day = localDayKey(d);
      if (!byDay[day]) byDay[day] = { orders: 0, items: 0 };
      byDay[day].orders += 1;
      (o.items || []).forEach((it) => {
        byDay[day].items += it.qty || 1;
      });
    });
    // Fill empty days in range for continuous chart
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const span = period === "day" ? 1 : period === "week" ? 7 : 30;
    const daySeries = [];
    for (let i = span - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = localDayKey(d);
      const label =
        period === "month"
          ? `${d.getDate()}/${d.getMonth() + 1}`
          : period === "day"
            ? "Hoy"
            : `${d.getDate()}/${d.getMonth() + 1}`;
      daySeries.push({
        l: label,
        v: (byDay[key] && byDay[key].orders) || 0,
        items: (byDay[key] && byDay[key].items) || 0,
        key,
      });
    }
    const dayRowsTable = Object.entries(byDay)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 31);

    // By hour
    const byHour = Array.from({ length: 24 }, () => 0);
    const byHourItems = Array.from({ length: 24 }, () => 0);
    orders.forEach((o) => {
      const d = orderDateObj(o);
      if (!d) return;
      const h = d.getHours();
      byHour[h] += 1;
      (o.items || []).forEach((it) => {
        byHourItems[h] += it.qty || 1;
      });
    });

    // By apartment (all-time for list, still useful)
    const byApt = {};
    all.forEach((o) => {
      if (o.orderType !== "apartment") return;
      const apt = String(o.apartment || "—").trim() || "—";
      if (!byApt[apt]) byApt[apt] = { orders: 0, items: 0 };
      byApt[apt].orders += 1;
      (o.items || []).forEach((it) => {
        byApt[apt].items += it.qty || 1;
      });
    });
    const aptRows = Object.entries(byApt).sort((a, b) => b[1].orders - a[1].orders);

    const byType = { dinein: 0, apartment: 0, amenity: 0 };
    orders.forEach((o) => {
      if (byType[o.orderType] != null) byType[o.orderType] += 1;
    });

    const itemCount = {};
    orders.forEach((o) => {
      (o.items || []).forEach((it) => {
        const key = it.name || it.id || "?";
        itemCount[key] = (itemCount[key] || 0) + (it.qty || 1);
      });
    });
    const topItems = Object.entries(itemCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);

    const modCount = {};
    orders.forEach((o) => {
      (o.items || []).forEach((it) => {
        const c = String(it.customizations || "").trim();
        if (!c) return;
        c.split(/[·|,;]/).forEach((part) => {
          const p = part.trim();
          if (!p) return;
          modCount[p] = (modCount[p] || 0) + 1;
        });
      });
    });
    const topMods = Object.entries(modCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);

    // Peak hour
    let peakH = 0;
    let peakV = 0;
    byHour.forEach((v, h) => {
      if (v > peakV) {
        peakV = v;
        peakH = h;
      }
    });

    host.innerHTML = `
      <div class="report-card">
        <h3>Resumen · ${escapeHtml(periodLabel(period))}</h3>
        <p class="report-big">${totalOrders}</p>
        <p class="adm-muted">pedidos en el periodo</p>
        <table>
          <tr><td>Abiertos</td><td>${openN}</td></tr>
          <tr><td>Completados</td><td>${completedN}</td></tr>
          <tr><td>Descartados</td><td>${orders.filter((o) => o.status === "dismissed").length}</td></tr>
          <tr><td>Histórico total</td><td>${all.length}</td></tr>
          <tr><td>Hora pico</td><td>${peakV ? String(peakH).padStart(2, "0") + ":00 (" + peakV + ")" : "—"}</td></tr>
        </table>
      </div>
      <div class="report-card">
        <h3>Tipo de servicio</h3>
        <table>
          <tr><th>Tipo</th><th>Pedidos</th></tr>
          <tr><td>Comer aquí</td><td>${byType.dinein}</td></tr>
          <tr><td>Departamento</td><td>${byType.apartment}</td></tr>
          <tr><td>Amenidad</td><td>${byType.amenity}</td></tr>
        </table>
      </div>
      <div class="report-card report-card--wide">
        <h3>Pedidos por día</h3>
        ${barChartHtml(daySeries)}
      </div>
      <div class="report-card report-card--wide">
        <h3>Patrón por hora</h3>
        ${hourChartHtml(byHour)}
      </div>
      <div class="report-card">
        <h3>Tabla por día</h3>
        <table>
          <tr><th>Día</th><th>Pedidos</th><th>Piezas</th></tr>
          ${
            dayRowsTable.length
              ? dayRowsTable
                  .map(
                    ([d, v]) =>
                      `<tr><td>${escapeHtml(d)}</td><td>${v.orders}</td><td>${v.items}</td></tr>`
                  )
                  .join("")
              : `<tr><td colspan="3">Sin datos</td></tr>`
          }
        </table>
      </div>
      <div class="report-card">
        <h3>Por departamento (histórico)</h3>
        <table>
          <tr><th>Depto</th><th>Pedidos</th><th>Piezas</th></tr>
          ${
            aptRows.length
              ? aptRows
                  .map(
                    ([a, v]) =>
                      `<tr><td><button type="button" class="linkish" data-jump-apt="${escapeHtml(
                        a
                      )}">${escapeHtml(a)}</button></td><td>${v.orders}</td><td>${v.items}</td></tr>`
                  )
                  .join("")
              : `<tr><td colspan="3">Sin entregas a depto</td></tr>`
          }
        </table>
      </div>
      <div class="report-card">
        <h3>Productos más pedidos</h3>
        <table>
          <tr><th>Producto</th><th>Cant.</th></tr>
          ${
            topItems.length
              ? topItems
                  .map(([n, c]) => `<tr><td>${escapeHtml(n)}</td><td>${c}</td></tr>`)
                  .join("")
              : `<tr><td colspan="2">Sin datos</td></tr>`
          }
        </table>
      </div>
      <div class="report-card">
        <h3>Modificaciones frecuentes</h3>
        <table>
          <tr><th>Mod</th><th>Veces</th></tr>
          ${
            topMods.length
              ? topMods
                  .map(([n, c]) => `<tr><td>${escapeHtml(n)}</td><td>${c}</td></tr>`)
                  .join("")
              : `<tr><td colspan="2">Sin modificaciones registradas</td></tr>`
          }
        </table>
      </div>
    `;

    $$("[data-jump-apt]", host).forEach((btn) => {
      btn.addEventListener("click", () => {
        const sel = $("#reportAptSelect");
        if (sel) {
          sel.value = btn.dataset.jumpApt;
          renderApartmentDetail();
          $("#reportAptDetail")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });

    fillApartmentSelect(all);
    renderApartmentDetail();

    // Period buttons active state
    $$("[data-period]").forEach((b) => {
      b.classList.toggle("is-period-on", b.dataset.period === period);
    });
  }

  /* —— Tabs —— */
  function setTab(tab) {
    state.tab = tab;
    $$(".admin-nav__btn").forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    $$(".admin-panel").forEach((p) => {
      const on = p.id === `tab-${tab}`;
      p.classList.toggle("is-active", on);
      p.hidden = !on;
    });
    if (tab === "kitchen") loadOrders();
    if (tab === "stock") renderStock();
    if (tab === "catalog") renderCatalog();
    if (tab === "report") {
      loadOrders().then(() => {
        renderReport();
        fillApartmentSelect(state.orders);
        renderApartmentDetail();
      });
    }
    if (tab === "announce") loadAnnouncementForm();
    if (tab === "hours") fillHoursForm();
  }

  function updateSyncLabel() {
    const el = $("#adminSyncLabel");
    if (!el) return;
    const label = window.KitchenStore?.label?.() || "local";
    el.textContent =
      label === "local-server"
        ? "Servidor local"
        : label === "cloud-jsonbin"
          ? "Nube (JSONBin)"
          : "Solo este dispositivo";
  }

  function bindDashboard() {
    $$(".admin-nav__btn").forEach((btn) => {
      btn.addEventListener("click", () => setTab(btn.dataset.tab));
    });
    $("#adminLogoutBtn")?.addEventListener("click", logout);
    $("#kitchenRefresh")?.addEventListener("click", () => loadOrders());
    $("#kitchenShowDone")?.addEventListener("change", () => renderKitchen());
    $("#kitchenPurgeDone")?.addEventListener("click", () => purgeCompletedOrders());
    $("#announceSave")?.addEventListener("click", saveAnnouncement);
    $$("[data-period]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.reportPeriod = btn.dataset.period || "week";
        $$("[data-period]").forEach((b) =>
          b.classList.toggle("is-period-on", b.dataset.period === state.reportPeriod)
        );
        renderReport();
      });
    });
    $("#reportAptSelect")?.addEventListener("change", () => renderApartmentDetail());
    $("#announceTranslate")?.addEventListener("click", translateEsToEn);
    $("#hoursSave")?.addEventListener("click", saveHours);
    $("#hoursForceClosed")?.addEventListener("change", () => {
      if ($("#hoursForceClosed")?.checked) $("#hoursForceOpen").checked = false;
    });
    $("#hoursForceOpen")?.addEventListener("change", () => {
      if ($("#hoursForceOpen")?.checked) $("#hoursForceClosed").checked = false;
    });
    $("#stockFilter")?.addEventListener("input", () => renderStock());
    $("#catalogFilterAdm")?.addEventListener("input", () => renderCatalog());
    $("#reportRefresh")?.addEventListener("click", () => loadOrders().then(renderReport));
  }

  async function bootDashboard() {
    updateSyncLabel();
    await loadMenu();
    await Promise.all([loadStock(), loadHours(), loadAnnouncementForm(), loadOrders()]);
    renderStock();
    renderCatalog();
    setTab(state.tab || "kitchen");
    startKitchenPoll();
  }

  async function init() {
    if (window.KitchenStore) {
      await KitchenStore.init();
    }
    updateSyncLabel();

    $("#gateSubmit")?.addEventListener("click", () => loginWithCode($("#gateCode")?.value));
    $("#gateCode")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        loginWithCode($("#gateCode")?.value);
      }
    });

    bindDashboard();

    if (state.authed) {
      showGate(false);
      await bootDashboard();
    } else {
      showGate(true);
      setTimeout(() => $("#gateCode")?.focus(), 100);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
