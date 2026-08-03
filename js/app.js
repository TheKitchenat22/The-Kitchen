/**
 * The Kitchen at 22 — Action Black–inspired UI + WhatsApp orders
 * Change restaurant number (Mexico +52, digits only):
 */
const WHATSAPP_NUMBER = "523329149245"; // 33 29 14 92 45
const ADMIN_CODE = "1254";
const STOCK_KEY = "kitchen-out-of-stock";
const HOURS_KEY = "kitchen-hours";
const ADMIN_KEY = "kitchen-admin";

/** Default: open every day except Tuesday, 14:00–21:00, delivery until 20:30 */
const DEFAULT_HOURS = {
  closedDays: [2], // 0=Sun … 6=Sat
  open: "14:00",
  close: "21:00",
  deliveryClose: "20:30",
  forceClosed: false,
  forceOpen: false,
};

(function () {
  "use strict";

  let MENU = window.KITCHEN_MENU;
  let FLAT = window.KITCHEN_FLAT;
  const I18N = window.KITCHEN_I18N;
  const FALLBACK_IMG =
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=640&h=640&fit=crop&q=80";

  /**
   * Product photos: drop files in assets/products/{id}.jpg (or .png/.webp/.jpeg),
   * then commit & push. Those files win over Unsplash/stock URLs.
   * Admin browser upload only works well with local server.py (not GitHub alone).
   */
  // Prefer .jpg (one try); .png second. Keeps missing-file 404s low.
  const PRODUCT_IMG_EXTS = ["jpg", "png"];

  /** Base path for project site (/The-Kitchen/) or local (/) */
  function siteRoot() {
    try {
      const path = String(window.location.pathname || "/");
      // "/The-Kitchen/", "/The-Kitchen/index.html" -> "/The-Kitchen/"
      const m = path.match(/^(\/[^/]+\/)/);
      if (m && /github\.io$/i.test(window.location.hostname || "")) {
        return m[1];
      }
    } catch (_) {}
    return "";
  }

  function productLocalCandidates(itemId) {
    const id = String(itemId || "").trim();
    if (!id) return [];
    const root = siteRoot(); // "" local, "/The-Kitchen/" on Pages
    const rel = PRODUCT_IMG_EXTS.map((ext) => `assets/products/${id}.${ext}`);
    const abs = root
      ? PRODUCT_IMG_EXTS.map((ext) => `${root}assets/products/${id}.${ext}`)
      : [];
    // raw.githubusercontent always has the committed files (Pages deploy can lag)
    const raw = PRODUCT_IMG_EXTS.map(
      (ext) =>
        `https://raw.githubusercontent.com/TheKitchenat22/The-Kitchen/main/assets/products/${id}.${ext}`
    );
    const onPages = /github\.io$/i.test(window.location.hostname || "");
    // On GitHub Pages prefer raw first so photos show even if Pages asset deploy is stuck
    if (onPages) return [...raw, ...abs, ...rel];
    return [...rel, ...abs, ...raw];
  }

  /** Ordered list of image URLs to try for a menu item */
  function productImgStages(item) {
    if (!item) return [FALLBACK_IMG];
    const stages = [];
    const seen = new Set();
    const push = (u) => {
      if (!u || seen.has(u)) return;
      seen.add(u);
      stages.push(u);
    };
    const img = item.img ? String(item.img) : "";
    // 1) Absolute http(s)/data menu img first (JSONBin / raw GitHub / uploads)
    if (
      img.startsWith("http://") ||
      img.startsWith("https://") ||
      img.startsWith("data:")
    ) {
      push(img);
    }
    // 2) Drop-in / raw candidates
    productLocalCandidates(item.id).forEach(push);
    // 3) Any other explicit path (relative assets/)
    if (img) push(img);
    push(FALLBACK_IMG);
    return stages;
  }

  /** Best URL for storage / cart */
  function productImgSrc(item) {
    if (!item) return FALLBACK_IMG;
    const img = item.img ? String(item.img) : "";
    if (
      img.startsWith("http://") ||
      img.startsWith("https://") ||
      img.startsWith("data:")
    ) {
      return img;
    }
    const local = productLocalCandidates(item.id)[0];
    if (local) return local;
    if (img) return img;
    return FALLBACK_IMG;
  }

  /** HTML attributes for cascading fallbacks on <img> */
  function productImgAttrs(item, extraClass = "") {
    const stages = productImgStages(item);
    const first = escapeHtml(stages[0] || FALLBACK_IMG);
    const rest = stages
      .slice(1)
      .map((u) => escapeHtml(u))
      .join("|");
    const cls = extraClass ? ` class="${extraClass}"` : "";
    return `${cls} src="${first}" data-img-stages="${rest}" loading="lazy" decoding="async" onerror="window.__kitchenImgFail&&window.__kitchenImgFail(this)"`;
  }

  window.__kitchenImgFail = function (el) {
    if (!el) return;
    const raw = el.getAttribute("data-img-stages") || "";
    const stages = raw ? raw.split("|").filter(Boolean) : [];
    if (!stages.length) {
      el.onerror = null;
      el.src = FALLBACK_IMG;
      return;
    }
    const next = stages.shift();
    el.setAttribute("data-img-stages", stages.join("|"));
    el.src = next;
  };

  function rebuildFlat() {
    const out = [];
    Object.values(MENU || {}).forEach((section) => {
      Object.entries(section.subcategories || {}).forEach(([subKey, sub]) => {
        (sub.items || []).forEach((item) => {
          out.push({
            ...item,
            sectionId: section.id,
            sectionTitle: section.title,
            subKey,
            subLabel: sub.label,
          });
        });
      });
    });
    FLAT = out;
    window.KITCHEN_MENU = MENU;
    window.KITCHEN_FLAT = FLAT;
  }

  function applyMenuData(menu) {
    if (!menu || typeof menu !== "object") return false;
    MENU = menu;
    rebuildFlat();
    return true;
  }

  async function fetchMenu() {
    try {
      if (window.KitchenStore) {
        const menu = await KitchenStore.getMenu();
        if (menu) {
          applyMenuData(menu);
          return true;
        }
      } else {
        const res = await fetch("/api/menu", { cache: "no-store" });
        if (!res.ok) throw new Error("no menu api");
        const data = await res.json();
        if (data.menu) {
          applyMenuData(data.menu);
          return true;
        }
      }
    } catch {
      /* keep bundled menu-data.js */
    }
    return false;
  }

  function loadLocalStock() {
    try {
      const raw = localStorage.getItem(STOCK_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr.map(String) : []);
    } catch {
      return new Set();
    }
  }

  function normalizeHours(raw) {
    const base = { ...DEFAULT_HOURS, closedDays: [...DEFAULT_HOURS.closedDays] };
    if (!raw || typeof raw !== "object") return base;
    if (Array.isArray(raw.closedDays)) {
      base.closedDays = [
        ...new Set(
          raw.closedDays.map((d) => parseInt(d, 10)).filter((d) => d >= 0 && d <= 6)
        ),
      ].sort((a, b) => a - b);
    }
    const timeOk = (s) => typeof s === "string" && /^\d{1,2}:\d{2}$/.test(s);
    if (timeOk(raw.open)) base.open = padTime(raw.open);
    if (timeOk(raw.close)) base.close = padTime(raw.close);
    if (timeOk(raw.deliveryClose)) base.deliveryClose = padTime(raw.deliveryClose);
    base.forceClosed = !!raw.forceClosed;
    base.forceOpen = !!raw.forceOpen;
    if (base.forceClosed && base.forceOpen) base.forceOpen = false;
    return base;
  }

  function padTime(s) {
    const [h, m] = s.split(":").map((x) => parseInt(x, 10));
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function loadLocalHours() {
    try {
      const raw = localStorage.getItem(HOURS_KEY);
      return normalizeHours(raw ? JSON.parse(raw) : null);
    } catch {
      return normalizeHours(null);
    }
  }

  const state = {
    lang: localStorage.getItem("kitchen-lang") || "es",
    cart: JSON.parse(sessionStorage.getItem("kitchen-cart") || "[]"),
    apartment: sessionStorage.getItem("kitchen-apt") || "",
    // "dinein" | "apartment" | "amenity" | null
    orderType: sessionStorage.getItem("kitchen-order-type") || null,
    amenity: sessionStorage.getItem("kitchen-amenity") || null,
    activeSub: { drinks: "all", bar: "all", food: "all" },
    pendingItem: null,
    outOfStock: loadLocalStock(),
    hours: loadLocalHours(),
    isAdmin: sessionStorage.getItem(ADMIN_KEY) === "1",
  };

  const isOut = (id) => state.outOfStock.has(String(id));

  /**
   * Variant stock (beer brands, soda types, Boing flavors).
   * Each option has a stockId admins can mark OOS independently.
   */
  function beerBrandDefs() {
    return [
      { k: "corona", stockId: "b-beer-corona", labelKey: "b-beer-corona" },
      { k: "pacifico", stockId: "b-beer-pacifico", labelKey: "b-beer-pacifico" },
      { k: "negra_modelo", stockId: "b-beer-negra-modelo", labelKey: "b-beer-negra-modelo" },
      { k: "modelo", stockId: "b-beer-modelo", labelKey: "b-beer-modelo" },
      { k: "victoria", stockId: "b-beer-victoria", labelKey: "b-beer-victoria" },
      { k: "amstel", stockId: "b-beer-amstel", labelKey: "b-beer-amstel" },
      { k: "heineken", stockId: "b-beer-heineken", labelKey: "b-beer-heineken" },
    ];
  }

  function sodaOptionDefs() {
    return [
      { k: "coke", stockId: "d-soda-coke", labelKey: "sodaCoke" },
      { k: "coke_zero", stockId: "d-soda-coke-zero", labelKey: "sodaCokeZero" },
      { k: "coke_light", stockId: "d-soda-coke-light", labelKey: "sodaCokeLight" },
      { k: "sprite_zero", stockId: "d-soda-sprite-zero", labelKey: "sodaSpriteZero" },
    ];
  }

  function boingOptionDefs() {
    return [
      { k: "grape", stockId: "d-boing-grape", labelKey: "boingGrape" },
      { k: "mango", stockId: "d-boing-mango", labelKey: "boingMango" },
      { k: "strawberry", stockId: "d-boing-strawberry", labelKey: "boingStrawberry" },
      { k: "guava", stockId: "d-boing-guava", labelKey: "boingGuava" },
    ];
  }

  /** Tacos: steak or pastor (order of 4) — per-option stock like soda/beer */
  function tacoOptionDefs() {
    return [
      { k: "steak", stockId: "f-taco-steak", labelKey: "tacoSteak" },
      { k: "pastor", stockId: "f-taco-pastor", labelKey: "tacoPastor" },
    ];
  }

  /** Spirits $170 / 2 oz */
  function spiritOptionDefs() {
    return [
      { k: "cognac", stockId: "b-spirit-cognac", labelKey: "spiritCognac" },
      { k: "gin_bombay", stockId: "b-spirit-gin-bombay", labelKey: "spiritGinBombay" },
      { k: "mezcal", stockId: "b-spirit-mezcal", labelKey: "spiritMezcal" },
      { k: "rum", stockId: "b-spirit-rum", labelKey: "spiritRum" },
    ];
  }

  /** Fine / premium spirits $205 */
  function fineSpiritOptionDefs() {
    return [
      { k: "tequila", stockId: "b-fine-tequila", labelKey: "fineTequila" },
      { k: "vodka", stockId: "b-fine-vodka", labelKey: "fineVodka" },
      { k: "whiskey", stockId: "b-fine-whiskey", labelKey: "fineWhiskey" },
      { k: "gin_monkey", stockId: "b-fine-gin-monkey", labelKey: "fineGinMonkey" },
    ];
  }

  /** Which variant-stock group this item uses (if any) */
  function variantStockKind(item) {
    const flags = (item && item.flags) || [];
    if (flags.includes("beer")) return "beer";
    if (flags.includes("soda")) return "soda";
    if (flags.includes("boing")) return "boing";
    if (flags.includes("tacos")) return "tacos";
    if (flags.includes("spirits")) return "spirits";
    if (flags.includes("fineSpirits")) return "fineSpirits";
    return null;
  }

  function variantOptionDefs(kind) {
    if (kind === "beer") return beerBrandDefs();
    if (kind === "soda") return sodaOptionDefs();
    if (kind === "boing") return boingOptionDefs();
    if (kind === "tacos") return tacoOptionDefs();
    if (kind === "spirits") return spiritOptionDefs();
    if (kind === "fineSpirits") return fineSpiritOptionDefs();
    return [];
  }

  function variantOptionLabel(kind, key) {
    const def = variantOptionDefs(kind).find((o) => o.k === key);
    if (!def) return key;
    if (kind === "beer") return nameFor(def.stockId, def.k);
    // UI / product option labels
    return t(def.labelKey);
  }

  function variantOptionStockId(kind, key) {
    return variantOptionDefs(kind).find((o) => o.k === key)?.stockId || null;
  }

  function variantStockAdminTitle(kind) {
    if (kind === "beer") return t("beerStockAdmin");
    if (kind === "soda") return t("sodaStockAdmin");
    if (kind === "boing") return t("boingStockAdmin");
    if (kind === "tacos") return t("tacosStockAdmin");
    if (kind === "spirits") return t("spiritsStockAdmin");
    if (kind === "fineSpirits") return t("fineSpiritsStockAdmin");
    return t("optionStockAdmin");
  }

  function variantFieldName(kind) {
    if (kind === "beer") return "beerBrand";
    if (kind === "spirits") return "spiritChoice";
    if (kind === "fineSpirits") return "fineSpiritChoice";
    if (kind === "soda") return "soda";
    if (kind === "boing") return "boing";
    if (kind === "tacos") return "tacoType";
    return kind;
  }

  function beerBrandLabel(key) {
    return variantOptionLabel("beer", key);
  }

  function beerBrandStockId(key) {
    return variantOptionStockId("beer", key);
  }

  /** Product unavailable: simple OOS, weekly special sold out, or all variants OOS */
  function isItemUnavailable(item) {
    if (!item) return true;
    if (isOut(item.id)) return true;
    if (isWeeklySpecial(item) && weeklyQtyOf(item) <= 0) return true;
    const kind = variantStockKind(item);
    if (kind) {
      const opts = variantOptionDefs(kind);
      if (opts.length && opts.every((o) => isOut(o.stockId))) return true;
    }
    return false;
  }

  /** Admin HTML: per-option stock chips for beer / soda / boing */
  function optionStockAdminHTML(item, { catalog = false } = {}) {
    const kind = variantStockKind(item);
    if (!kind) return "";
    const opts = variantOptionDefs(kind);
    if (!opts.length) return "";
    const title = variantStockAdminTitle(kind);
    const wrapClass = catalog ? "catalog-beer-stock" : "beer-stock-admin";
    const labelClass = catalog ? "catalog-beer-stock__label" : "beer-stock-admin__label";
    const rowClass = catalog ? "catalog-beer-stock__row" : "beer-stock-admin__row";
    return `<div class="${wrapClass}" aria-label="${escapeHtml(title)}">
      <span class="${labelClass}">${escapeHtml(title)}</span>
      <div class="${rowClass}">
        ${opts
          .map((o) => {
            const oos = isOut(o.stockId);
            const label = variantOptionLabel(kind, o.k);
            const extra = catalog
              ? oos
                ? ` · ${escapeHtml(t("outOfStock"))}`
                : ""
              : oos
                ? " ✕"
                : "";
            return `<button type="button" class="btn-stock btn-stock--brand${oos ? " is-oos" : ""}" data-stock="${escapeHtml(
              o.stockId
            )}" title="${escapeHtml(label)}: ${oos ? t("markInStock") : t("markOutOfStock")}">${escapeHtml(
              label
            )}${extra}</button>`;
          })
          .join("")}
      </div>
    </div>`;
  }

  function toMinutes(hhmm) {
    const [h, m] = padTime(hhmm).split(":").map(Number);
    return h * 60 + m;
  }

  /** Uses the visitor's device clock (local timezone). */
  function getOrderStatus(now = new Date()) {
    const h = state.hours;
    if (h.forceOpen) {
      return { open: true, reason: "forceOpen" };
    }
    if (h.forceClosed) {
      return { open: false, reason: "forceClosed" };
    }
    const day = now.getDay(); // 0 Sun … 6 Sat
    if (h.closedDays.includes(day)) {
      return { open: false, reason: "closedDay", day };
    }
    const mins = now.getHours() * 60 + now.getMinutes();
    const openM = toMinutes(h.open);
    const deliveryM = toMinutes(h.deliveryClose);
    if (mins < openM) {
      return { open: false, reason: "beforeOpen" };
    }
    // Delivery window ends at deliveryClose; salon close is informational
    if (mins >= deliveryM) {
      return { open: false, reason: "afterDelivery", deliveryClose: h.deliveryClose };
    }
    return { open: true, reason: "ok" };
  }

  function formatTime12(hhmm) {
    const [h, m] = padTime(hhmm).split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  }

  function dayName(i) {
    const keys = ["day0", "day1", "day2", "day3", "day4", "day5", "day6"];
    return t(keys[i]);
  }

  function hoursSummaryText() {
    const h = state.hours;
    const closed = h.closedDays.map(dayName).join(", ") || "—";
    return t("hoursSummary")
      .replace("{open}", formatTime12(h.open))
      .replace("{close}", formatTime12(h.close))
      .replace("{delivery}", formatTime12(h.deliveryClose))
      .replace("{closed}", closed);
  }

  function closedMessage(status) {
    if (!status || status.open) return "";
    if (status.reason === "forceClosed") return t("closedForce");
    if (status.reason === "closedDay") {
      return t("closedDayMsg")
        .replace("{day}", dayName(new Date().getDay()))
        .replace("{open}", formatTime12(state.hours.open))
        .replace("{delivery}", formatTime12(state.hours.deliveryClose));
    }
    if (status.reason === "beforeOpen") {
      return t("closedBefore").replace("{open}", formatTime12(state.hours.open));
    }
    if (status.reason === "afterDelivery") {
      return t("closedAfterDelivery")
        .replace("{delivery}", formatTime12(state.hours.deliveryClose))
        .replace("{close}", formatTime12(state.hours.close));
    }
    return t("closedGeneric");
  }

  // status labels emphasize to-go / para llevar
  function statusLabel(open) {
    return open ? t("statusOpen") : t("statusClosed");
  }

  function updateHoursUI() {
    const status = getOrderStatus();
    const chip = $("#hoursChip");
    const dot = $("#hoursDot");
    const stEl = $("#hoursStatus");
    const det = $("#hoursDetail");
    if (stEl) stEl.textContent = statusLabel(status.open);
    if (det) det.textContent = hoursSummaryText();
    if (chip) chip.classList.toggle("is-closed", !status.open);
    if (chip) chip.classList.toggle("is-open", status.open);
    // Green when open (to-go available), red when closed
    if (dot) {
      dot.classList.toggle("is-open", status.open);
      dot.classList.toggle("is-closed", !status.open);
    }

    const banner = $("#closedBanner");
    const hint = $("#waHint");
    const send = $("#sendWhatsApp");
    const count = state.cart.reduce((s, l) => s + l.qty, 0);
    const canSend = status.open && count > 0;

    if (banner) {
      if (!status.open) {
        banner.textContent = closedMessage(status);
        banner.classList.remove("is-hidden");
      } else {
        banner.classList.add("is-hidden");
        banner.textContent = "";
      }
    }
    if (hint) {
      hint.textContent = status.open ? t("waHint") : closedMessage(status);
      hint.classList.toggle("is-closed-hint", !status.open);
    }
    if (send) {
      send.disabled = !canSend;
      send.classList.toggle("is-disabled", !status.open);
      send.setAttribute("aria-disabled", status.open ? "false" : "true");
      if (!status.open) send.title = closedMessage(status);
      else send.removeAttribute("title");
    }

    document.body.classList.toggle("orders-closed", !status.open);
  }

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const t = (k) => (I18N[state.lang] && I18N[state.lang][k]) || I18N.es[k] || k;
  const fmt = (n) => `$${Math.round(n)} MXN`;
  const noteFor = (item) => (item.notesKey ? t(item.notesKey) : item.notes || "");

  /** Translate subcategory tab labels (Café, Street food, etc.) */
  function subLabelFor(subKey, fallback = "") {
    const key = `sub${subKey}`;
    const tr = t(key);
    return tr !== key ? tr : fallback || subKey;
  }

  /** Translate menu item display name by id */
  function nameFor(itemOrId, fallback = "") {
    const id = typeof itemOrId === "string" ? itemOrId : itemOrId?.id;
    let itemObj = typeof itemOrId === "object" ? itemOrId : null;
    if (!itemObj && id) itemObj = FLAT.find((x) => x.id === id) || null;
    const fb =
      fallback ||
      itemObj?.name ||
      id ||
      "";
    if (!id && !itemObj) return fb;
    // Per-item translations saved by admin
    if (state.lang === "en" && itemObj?.name_en) return itemObj.name_en;
    if (state.lang === "ja" && itemObj?.name_ja) return itemObj.name_ja;
    const table = window.KITCHEN_ITEM_NAMES;
    if (table && id) {
      const langTable = table[state.lang] || table.es || {};
      if (langTable[id]) return langTable[id];
      if (table.es?.[id]) return table.es[id];
    }
    return fb;
  }

  const saveCart = () => {
    sessionStorage.setItem("kitchen-cart", JSON.stringify(state.cart));
    renderCart();
    updateBadges();
    updateOrderMini();
  };

  const subtotal = () => state.cart.reduce((s, l) => s + l.unitPrice * l.qty, 0);

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* i18n */
  function applyI18n() {
    document.documentElement.lang = state.lang;
    $$("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    $$("[data-i18n-placeholder]").forEach((el) => {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
    });
    $$(".lang__btn").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.lang === state.lang)
    );
    renderAll();
    renderCart();
    updateOrderMini();
    setAdminUI();
    updateOrderTypeUI();
    updateHoursUI();
  }

  /* Menu cards — fixed structure for alignment */
  function itemsFor(sectionKey) {
    const section = MENU[sectionKey];
    const active = state.activeSub[sectionKey];
    const list = [];
    Object.entries(section.subcategories).forEach(([k, sub]) => {
      if (active !== "all" && active !== k) return;
      sub.items.forEach((item) =>
        list.push({
          ...item,
          sectionId: section.id,
          sectionTitle: section.title,
          subKey: k,
          subLabel: subLabelFor(k, sub.label),
        })
      );
    });
    return list;
  }

  function isNewItem(item) {
    return !!(item && (item.isNew === true || item.isNew === "true" || item.isNew === 1));
  }

  function isWeeklySpecial(item) {
    return !!(
      item &&
      (item.isWeeklySpecial === true ||
        item.isWeeklySpecial === "true" ||
        item.isWeeklySpecial === 1)
    );
  }

  function weeklyQtyOf(item) {
    if (!item) return 0;
    const n = parseInt(item.weeklyQty, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  /** Units left after cart lines for this weekly special */
  function weeklyQtyRemaining(item) {
    if (!isWeeklySpecial(item)) return Infinity;
    const cap = weeklyQtyOf(item);
    const inCart = state.cart
      .filter((l) => l.id === item.id)
      .reduce((s, l) => s + (l.qty || 0), 0);
    return Math.max(0, cap - inCart);
  }

  function isDineInOnly(item) {
    if (!item) return false;
    if (item.dineInOnly === true || item.dineInOnly === "true" || item.dineInOnly === 1) return true;
    return (item.flags || []).includes("dineInOnly");
  }

  function cardHTML(item) {
    const note = noteFor(item);
    const noteHtml = note ? escapeHtml(note) : "&nbsp;";
    const oos = isItemUnavailable(item);
    const isNew = isNewItem(item);
    const weekly = isWeeklySpecial(item);
    const weeklyLeft = weekly ? weeklyQtyOf(item) : 0;
    const admin = state.isAdmin;
    const hasVariantStock = !!variantStockKind(item);
    const addAttr = oos ? "" : ` data-add="${escapeHtml(item.id)}"`;
    const badges = [
      weekly
        ? `<span class="menu-card__badge menu-card__badge--weekly" title="${escapeHtml(
            t("badgeWeekly")
          )}">${escapeHtml(t("badgeWeeklyAvailable"))}<span class="menu-card__badge-count">${weeklyLeft}</span></span>`
        : "",
      isNew ? `<span class="menu-card__badge menu-card__badge--new">${t("badgeNew")}</span>` : "",
      oos ? `<span class="menu-card__badge">${t("outOfStock")}</span>` : "",
    ]
      .filter(Boolean)
      .join("");
    const optionStockAdmin = admin && hasVariantStock ? optionStockAdminHTML(item) : "";
    return `
      <article class="menu-card${oos ? " is-oos" : ""}${admin ? " is-admin" : ""}${oos ? "" : " is-tappable"}${isNew ? " is-new" : ""}${weekly ? " is-weekly" : ""}" data-id="${item.id}">
        <div class="menu-card__media"${addAttr} role="${oos ? "presentation" : "button"}" tabindex="${oos ? "-1" : "0"}" aria-label="${oos ? "" : escapeHtml(t("add") + ": " + nameFor(item))}">
          <img
            alt="${escapeHtml(nameFor(item))}"
            ${productImgAttrs(item)}
          />
          ${badges}
        </div>
        <div class="menu-card__body">
          <div class="menu-card__top">
            <h3 class="menu-card__name">${escapeHtml(nameFor(item))}</h3>
            <span class="menu-card__price">${fmt(item.price)}</span>
          </div>
          <p class="menu-card__note">${noteHtml}</p>
          <div class="menu-card__mid">${optionStockAdmin}</div>
          <div class="menu-card__foot">
            <span class="menu-card__cat">${escapeHtml(item.subLabel || "")}</span>
            <div class="menu-card__actions">
              ${
                admin && !hasVariantStock
                  ? `<button type="button" class="btn-stock${isOut(item.id) ? " is-oos" : ""}" data-stock="${item.id}" title="${
                      isOut(item.id) ? t("markInStock") : t("markOutOfStock")
                    }">${isOut(item.id) ? t("stockOn") : t("stockOff")}</button>`
                  : ""
              }
              ${
                oos
                  ? `<button type="button" class="btn-add is-disabled" disabled aria-label="${t("outOfStock")}">+</button>`
                  : `<button type="button" class="btn-add" data-add="${item.id}" aria-label="${t("add")}">+</button>`
              }
            </div>
          </div>
        </div>
      </article>`;
  }

  function renderTabs(sectionKey) {
    const host = $(`.tabs[data-section="${sectionKey}"]`);
    if (!host) return;
    const section = MENU[sectionKey];
    host.innerHTML = "";

    const mk = (label, key) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `tab${state.activeSub[sectionKey] === key ? " is-active" : ""}`;
      b.setAttribute("role", "tab");
      b.textContent = label;
      b.addEventListener("click", () => {
        state.activeSub[sectionKey] = key;
        renderTabs(sectionKey);
        renderGrid(sectionKey);
      });
      host.appendChild(b);
    };

    mk(t("all"), "all");
    Object.entries(section.subcategories).forEach(([k, sub]) =>
      mk(subLabelFor(k, sub.label), k)
    );
  }

  function renderGrid(sectionKey) {
    const grid = $(`#${sectionKey}Grid`);
    if (!grid) return;
    grid.innerHTML = itemsFor(sectionKey).map(cardHTML).join("");
    bindAdds(grid);
  }

  /** Active weekly specials (duplicated at top; still listed in their normal section) */
  function getWeeklySpecialItems() {
    return FLAT.filter((item) => isWeeklySpecial(item));
  }

  function renderSpecials() {
    const section = $("#specials");
    const grid = $("#specialsGrid");
    const navLink = $("#navSpecials");
    const switcher = $("#switcherSpecials");
    const drinksBack = $("#drinksNavSpecials");
    const drinksSpacer = $("#drinksNavSpacer");
    const specials = getWeeklySpecialItems();
    const has = specials.length > 0;

    if (section) section.classList.toggle("is-hidden", !has);
    if (navLink) navLink.classList.toggle("is-hidden", !has);
    if (switcher) switcher.classList.toggle("is-hidden", !has);
    if (drinksBack) drinksBack.classList.toggle("is-hidden", !has);
    // Spacer only when no "back to specials" link (keeps drinks nav aligned)
    if (drinksSpacer) drinksSpacer.classList.toggle("is-hidden", has);

    if (grid) {
      if (has) {
        // Feature cards at top — same product ids, so cart/customize work as usual
        grid.innerHTML = specials.map((item) => cardHTML(item)).join("");
        bindAdds(grid);
      } else {
        grid.innerHTML = "";
      }
    }
  }

  function renderAll() {
    renderSpecials();
    ["drinks", "bar", "food"].forEach((k) => {
      renderTabs(k);
      renderGrid(k);
    });
    // Equalize layout after DOM swap (fonts/images/async menu can shift heights)
    requestAnimationFrame(() => {
      try {
        if (window.ScrollTrigger) window.ScrollTrigger.refresh();
      } catch (_) {}
    });
  }

  function openItemById(id) {
    const item = FLAT.find((x) => x.id === id);
    if (!id || !item || isItemUnavailable(item)) {
      if (id) toast(t("outOfStock"));
      return;
    }
    openCustomize(item);
  }

  function bindAdds(root) {
    $$("[data-add]", root).forEach((el) => {
      const handler = (e) => {
        // Don't double-fire when + is inside a tappable media (it isn't)
        e.stopPropagation();
        openItemById(el.dataset.add);
      };
      el.addEventListener("click", handler);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openItemById(el.dataset.add);
        }
      });
    });
    $$("[data-stock]", root).forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!state.isAdmin) return;
        toggleStock(btn.dataset.stock);
      });
    });
  }

  /* ---------- Shared stock (server + localStorage fallback) ---------- */
  async function fetchStock() {
    try {
      const data = window.KitchenStore
        ? await KitchenStore.getStock()
        : await (await fetch("/api/stock", { cache: "no-store" })).json();
      const ids = Array.isArray(data.outOfStock) ? data.outOfStock.map(String) : [];
      state.outOfStock = new Set(ids);
      localStorage.setItem(STOCK_KEY, JSON.stringify(ids));
      return true;
    } catch {
      state.outOfStock = loadLocalStock();
      return false;
    }
  }

  async function persistStock() {
    const ids = [...state.outOfStock];
    localStorage.setItem(STOCK_KEY, JSON.stringify(ids));
    try {
      const data = window.KitchenStore
        ? await KitchenStore.setStock(ids, ADMIN_CODE)
        : await (
            await fetch("/api/stock", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ outOfStock: ids, code: ADMIN_CODE }),
            })
          ).json();
      if (Array.isArray(data.outOfStock)) {
        state.outOfStock = new Set(data.outOfStock.map(String));
        localStorage.setItem(STOCK_KEY, JSON.stringify([...state.outOfStock]));
      }
      if (data._localOnly || (window.KitchenStore && !KitchenStore.isShared())) {
        toast(t("stockSavedLocal"));
      } else {
        toast(t("stockSaved"));
      }
      updateSyncBadge();
      return true;
    } catch {
      toast(t("stockSavedLocal"));
      updateSyncBadge();
      return false;
    }
  }

  async function toggleStock(id) {
    id = String(id);
    if (state.outOfStock.has(id)) state.outOfStock.delete(id);
    else state.outOfStock.add(id);
    // Remove from cart if product or variant option marked OOS
    if (state.outOfStock.has(id)) {
      const before = state.cart.length;
      const matchOpt = (kind, productId) => {
        const def = variantOptionDefs(kind).find((o) => o.stockId === id);
        if (!def) return null;
        return { def, productId, label: variantOptionLabel(kind, def.k) };
      };
      const hit =
        matchOpt("beer", "b-cerveza") ||
        matchOpt("soda", "d-refresco") ||
        matchOpt("boing", "d-boing") ||
        matchOpt("tacos", "f-tacos") ||
        matchOpt("spirits", "b-spirits") ||
        matchOpt("fineSpirits", "b-fine-spirits");
      state.cart = state.cart.filter((l) => {
        if (l.id === id) return false;
        if (hit && l.id === hit.productId) {
          if (l.customizations && String(l.customizations).includes(hit.label)) return false;
        }
        return true;
      });
      if (state.cart.length !== before) saveCart();
    }
    renderAll();
    // Re-apply search results if open
    const q = $("#searchInput")?.value;
    if (q) runSearch(q);
    // Refresh open catalog if admin catalog is visible
    if (state.isAdmin && !$("#catalogModal")?.classList.contains("is-hidden")) {
      renderCatalogPanel();
    }
    await persistStock();
  }

  function setAdminUI() {
    document.body.classList.toggle("is-admin", state.isAdmin);
    const bar = $("#adminBar");
    const btn = $("#adminBtn");
    if (bar) bar.classList.toggle("is-hidden", !state.isAdmin);
    if (btn) btn.textContent = state.isAdmin ? t("adminActiveShort") : t("adminBtn");
    updateSyncBadge();
  }

  async function fetchHours() {
    try {
      const data = window.KitchenStore
        ? await KitchenStore.getHours()
        : await (await fetch("/api/hours", { cache: "no-store" })).json();
      state.hours = normalizeHours(data);
      localStorage.setItem(HOURS_KEY, JSON.stringify(state.hours));
      return true;
    } catch {
      state.hours = loadLocalHours();
      return false;
    }
  }

  async function persistHours() {
    localStorage.setItem(HOURS_KEY, JSON.stringify(state.hours));
    try {
      const data = window.KitchenStore
        ? await KitchenStore.setHours(state.hours, ADMIN_CODE)
        : await (
            await fetch("/api/hours", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...state.hours, code: ADMIN_CODE }),
            })
          ).json();
      state.hours = normalizeHours(data);
      localStorage.setItem(HOURS_KEY, JSON.stringify(state.hours));
      if (data._localOnly || (window.KitchenStore && !KitchenStore.isShared())) {
        toast(t("hoursSavedLocal"));
      } else {
        toast(t("hoursSaved"));
      }
      updateHoursUI();
      updateSyncBadge();
      return true;
    } catch {
      toast(t("hoursSavedLocal"));
      updateHoursUI();
      updateSyncBadge();
      return false;
    }
  }

  function updateSyncBadge() {
    const el = $("#adminSyncBadge");
    if (!el) return;
    const shared = window.KitchenStore?.isShared?.();
    const mode = window.KitchenStore?.mode || "none";
    if (shared) {
      el.textContent =
        mode === "jsonbin" ? t("syncCloud") : t("syncLocalServer");
      el.classList.remove("is-warn");
      el.classList.add("is-ok");
    } else {
      el.textContent = t("syncDeviceOnly");
      el.classList.add("is-warn");
      el.classList.remove("is-ok");
    }
  }

  function openHoursModal() {
    if (!state.isAdmin) return;
    const h = state.hours;
    const grid = $("#hoursDayGrid");
    if (grid) {
      grid.innerHTML = [0, 1, 2, 3, 4, 5, 6]
        .map(
          (d) => `
        <label class="day-chip${h.closedDays.includes(d) ? " is-on" : ""}">
          <input type="checkbox" data-day="${d}" ${h.closedDays.includes(d) ? "checked" : ""} />
          <span>${dayName(d)}</span>
        </label>`
        )
        .join("");
      $$("input[data-day]", grid).forEach((inp) => {
        inp.addEventListener("change", () => {
          inp.closest(".day-chip")?.classList.toggle("is-on", inp.checked);
        });
      });
    }
    const open = $("#hoursOpen");
    const close = $("#hoursClose");
    const delivery = $("#hoursDelivery");
    if (open) open.value = h.open;
    if (close) close.value = h.close;
    if (delivery) delivery.value = h.deliveryClose;
    const fc = $("#hoursForceClosed");
    const fo = $("#hoursForceOpen");
    if (fc) fc.checked = !!h.forceClosed;
    if (fo) fo.checked = !!h.forceOpen;
    openModal("hoursModal");
  }

  function closeHoursModal() {
    closeModal("hoursModal");
  }

  async function saveHoursFromForm() {
    if (!state.isAdmin) return;
    const open = $("#hoursOpen")?.value || DEFAULT_HOURS.open;
    const close = $("#hoursClose")?.value || DEFAULT_HOURS.close;
    const delivery = $("#hoursDelivery")?.value || DEFAULT_HOURS.deliveryClose;
    const closedDays = $$("#hoursDayGrid input[data-day]:checked").map((el) =>
      parseInt(el.dataset.day, 10)
    );
    state.hours = normalizeHours({
      open,
      close,
      deliveryClose: delivery,
      closedDays,
      forceClosed: !!$("#hoursForceClosed")?.checked,
      forceOpen: !!$("#hoursForceOpen")?.checked,
    });
    await persistHours();
    closeHoursModal();
  }

  /* ---------- Admin catalog: add / remove / photos ---------- */
  function openCatalogModal() {
    if (!state.isAdmin) {
      toast(t("adminNeedLogin"));
      return;
    }
    renderCatalogPanel();
    openModal("catalogModal");
  }

  function closeCatalogModal() {
    closeModal("catalogModal");
  }

  function sectionSubOptions() {
    const opts = [];
    Object.entries(MENU || {}).forEach(([secKey, section]) => {
      Object.entries(section.subcategories || {}).forEach(([subKey, sub]) => {
        opts.push({
          value: `${secKey}::${subKey}`,
          label: `${section.title} · ${subLabelFor(subKey, sub.label)}`,
          section: secKey,
          subKey,
        });
      });
    });
    return opts;
  }

  function renderCatalogPanel() {
    const list = $("#catalogList");
    const sel = $("#catalogSection");
    if (sel) {
      const cur = sel.value;
      sel.innerHTML = sectionSubOptions()
        .map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`)
        .join("");
      if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
    }
    if (!list) return;
    const filter = ($("#catalogFilter")?.value || "").trim().toLowerCase();
    const rows = FLAT.filter((item) => {
      if (!filter) return true;
      const n = nameFor(item).toLowerCase();
      return n.includes(filter) || String(item.id).toLowerCase().includes(filter);
    });
    if (!rows.length) {
      list.innerHTML = `<p class="empty">${t("catalogEmpty")}</p>`;
      return;
    }
    list.innerHTML = rows
      .map((item) => {
        const oos = isItemUnavailable(item);
        const isNew = isNewItem(item);
        const weekly = isWeeklySpecial(item);
        const weeklyLeft = weeklyQtyOf(item);
        const dropName = `${item.id}.jpg`;
        const optionStockRows = optionStockAdminHTML(item, { catalog: true });
        return `
        <div class="catalog-row" data-id="${escapeHtml(item.id)}">
          <div class="catalog-row__media">
            <img alt="" ${productImgAttrs(item)} />
            ${isNew ? `<span class="catalog-row__new">${t("badgeNew")}</span>` : ""}
            ${weekly ? `<span class="catalog-row__weekly">${escapeHtml(t("badgeWeekly"))} · ${weeklyLeft}</span>` : ""}
            <label class="catalog-upload">
              <input type="file" accept="image/*" data-upload="${escapeHtml(item.id)}" hidden />
              <span>${t("catalogChangePhoto")}</span>
            </label>
          </div>
          <div class="catalog-row__body">
            <strong>${escapeHtml(nameFor(item))}${isNew ? ` <em class="catalog-new-tag">${t("badgeNew")}</em>` : ""}${weekly ? ` <em class="catalog-weekly-tag">${escapeHtml(t("badgeWeekly"))} · ${weeklyLeft}</em>` : ""}</strong>
            <span class="catalog-row__meta">${escapeHtml(item.subLabel || item.subKey || "")} · ${fmt(item.price)}</span>
            <span class="catalog-row__id">${escapeHtml(item.id)}${oos ? ` · ${t("outOfStock")}` : ""}</span>
            <span class="catalog-row__file" title="${escapeHtml(t("catalogDropHint"))}">📁 assets/products/${escapeHtml(dropName)}</span>
            ${optionStockRows}
            <div class="catalog-row__actions">
              <button type="button" class="btn btn--ghost catalog-btn${isNew ? " is-new-on" : ""}" data-toggle-new="${escapeHtml(item.id)}">${isNew ? t("catalogUnmarkNew") : t("catalogMarkNew")}</button>
              <button type="button" class="btn btn--ghost catalog-btn${weekly ? " is-weekly-on" : ""}" data-toggle-weekly="${escapeHtml(item.id)}">${weekly ? t("catalogUnmarkWeekly") : t("catalogMarkWeekly")}</button>
              ${
                weekly
                  ? `<button type="button" class="btn btn--ghost catalog-btn" data-edit-weekly-qty="${escapeHtml(item.id)}">${t("catalogEditWeeklyQty")} (${weeklyLeft})</button>`
                  : ""
              }
              <button type="button" class="btn btn--ghost catalog-btn" data-edit-price="${escapeHtml(item.id)}">${t("catalogEditPrice")}</button>
              <button type="button" class="btn btn--ghost catalog-btn catalog-btn--danger" data-delete-item="${escapeHtml(item.id)}">${t("catalogDelete")}</button>
            </div>
          </div>
        </div>`;
      })
      .join("");

    $$("[data-upload]", list).forEach((input) => {
      input.addEventListener("change", () => {
        const file = input.files && input.files[0];
        if (file) uploadItemImage(input.dataset.upload, file);
        input.value = "";
      });
    });
    $$("[data-delete-item]", list).forEach((btn) => {
      btn.addEventListener("click", () => deleteMenuItem(btn.dataset.deleteItem));
    });
    $$("[data-edit-price]", list).forEach((btn) => {
      btn.addEventListener("click", () => editItemPrice(btn.dataset.editPrice));
    });
    $$("[data-toggle-new]", list).forEach((btn) => {
      btn.addEventListener("click", () => toggleItemNew(btn.dataset.toggleNew));
    });
    $$("[data-toggle-weekly]", list).forEach((btn) => {
      btn.addEventListener("click", () => toggleItemWeekly(btn.dataset.toggleWeekly));
    });
    $$("[data-edit-weekly-qty]", list).forEach((btn) => {
      btn.addEventListener("click", () => editWeeklyQty(btn.dataset.editWeeklyQty));
    });
    // Per-brand beer stock toggles inside catalog
    $$("[data-stock]", list).forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!state.isAdmin) return;
        toggleStock(btn.dataset.stock);
        renderCatalogPanel();
      });
    });
  }

  /** Patch fields onto the live MENU tree (not only FLAT copies) */
  function patchMenuItemLocal(itemId, fields) {
    let found = null;
    Object.values(MENU || {}).forEach((section) => {
      Object.values(section.subcategories || {}).forEach((sub) => {
        (sub.items || []).forEach((item) => {
          if (item.id === itemId) {
            Object.assign(item, fields);
            found = item;
          }
        });
      });
    });
    if (found) rebuildFlat();
    return found;
  }

  async function updateMenuItemFields(itemId, fields) {
    // Always apply locally first so UI updates even if network is slow
    patchMenuItemLocal(itemId, fields);
    const data = window.KitchenStore
      ? await KitchenStore.menuItem({ action: "update", itemId, ...fields }, ADMIN_CODE)
      : await (
          await fetch("/api/menu/item", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: ADMIN_CODE, action: "update", itemId, ...fields }),
          })
        ).then(async (res) => {
          const d = await res.json();
          if (!res.ok) throw new Error(d.error || "fail");
          return d;
        });
    if (data.menu) applyMenuData(data.menu);
    else patchMenuItemLocal(itemId, fields);
    return data;
  }

  async function toggleItemNew(itemId) {
    if (!state.isAdmin) return;
    const item = FLAT.find((x) => x.id === itemId);
    if (!item) return;
    const next = !isNewItem(item);
    try {
      await updateMenuItemFields(itemId, { isNew: next });
      renderAll();
      renderCatalogPanel();
      toast(next ? t("catalogMarkedNew") : t("catalogUnmarkedNew"));
      updateSyncBadge();
    } catch {
      toast(t("catalogNeedServer"));
    }
  }

  async function toggleItemWeekly(itemId) {
    if (!state.isAdmin) return;
    const item = FLAT.find((x) => x.id === itemId);
    if (!item) return;
    const next = !isWeeklySpecial(item);
    const payload = { isWeeklySpecial: next };
    if (next) {
      // Always confirm units when turning ON so the counter is never empty/0 by mistake
      const current = weeklyQtyOf(item) > 0 ? String(weeklyQtyOf(item)) : "10";
      const raw = prompt(t("catalogWeeklyQtyPrompt"), current);
      if (raw === null) return; // cancelled — do not enable
      const n = parseInt(raw, 10);
      if (Number.isNaN(n) || n < 0) {
        toast(t("catalogBadWeeklyQty"));
        return;
      }
      payload.weeklyQty = n;
    }
    try {
      await updateMenuItemFields(itemId, payload);
      renderAll();
      renderCatalogPanel();
      if (next) {
        toast(
          t("catalogMarkedWeekly") +
            " · " +
            t("catalogWeeklyQtySaved").replace("{n}", String(payload.weeklyQty))
        );
      } else {
        toast(t("catalogUnmarkedWeekly"));
      }
      updateSyncBadge();
    } catch (err) {
      console.warn("toggleItemWeekly", err);
      // Local fields already applied — still refresh UI
      renderAll();
      renderCatalogPanel();
      toast(t("catalogNeedServer"));
    }
  }

  async function editWeeklyQty(itemId) {
    if (!state.isAdmin) return;
    const item = FLAT.find((x) => x.id === itemId);
    if (!item) return;
    if (!isWeeklySpecial(item)) {
      toast(t("catalogWeeklyOffHint"));
      return;
    }
    const raw = prompt(t("catalogWeeklyQtyPrompt"), String(weeklyQtyOf(item)));
    if (raw === null) return;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n) || n < 0) {
      toast(t("catalogBadWeeklyQty"));
      return;
    }
    try {
      await updateMenuItemFields(itemId, { weeklyQty: n, isWeeklySpecial: true });
      renderAll();
      renderCatalogPanel();
      toast(t("catalogWeeklyQtySaved").replace("{n}", String(n)));
      updateSyncBadge();
    } catch {
      toast(t("catalogNeedServer"));
    }
  }

  async function deleteMenuItem(itemId) {
    if (!state.isAdmin) return;
    const item = FLAT.find((x) => x.id === itemId);
    const label = item ? nameFor(item) : itemId;
    if (!confirm(`${t("catalogConfirmDelete")}\n${label}`)) return;
    try {
      const data = window.KitchenStore
        ? await KitchenStore.menuItem({ action: "delete", itemId }, ADMIN_CODE)
        : await (
            await fetch("/api/menu/item", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code: ADMIN_CODE, action: "delete", itemId }),
            })
          ).then(async (res) => {
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || "fail");
            return d;
          });
      if (data.menu) applyMenuData(data.menu);
      state.outOfStock.delete(String(itemId));
      state.cart = state.cart.filter((l) => l.id !== itemId);
      saveCart();
      renderAll();
      renderCatalogPanel();
      toast(t("catalogDeleted"));
      updateSyncBadge();
    } catch {
      toast(t("catalogNeedServer"));
    }
  }

  async function editItemPrice(itemId) {
    if (!state.isAdmin) return;
    const item = FLAT.find((x) => x.id === itemId);
    if (!item) return;
    const raw = prompt(t("catalogEditPricePrompt"), String(item.price));
    if (raw === null) return;
    const price = parseInt(raw, 10);
    if (Number.isNaN(price) || price < 0) {
      toast(t("catalogBadPrice"));
      return;
    }
    try {
      const data = window.KitchenStore
        ? await KitchenStore.menuItem(
            { action: "update", itemId, price },
            ADMIN_CODE
          )
        : await (
            await fetch("/api/menu/item", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                code: ADMIN_CODE,
                action: "update",
                itemId,
                price,
              }),
            })
          ).then(async (res) => {
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || "fail");
            return d;
          });
      if (data.menu) applyMenuData(data.menu);
      renderAll();
      renderCatalogPanel();
      toast(t("catalogUpdated"));
      updateSyncBadge();
    } catch {
      toast(t("catalogNeedServer"));
    }
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /** Resize large photos so cloud sync stays small */
  function compressImageFile(file, maxSide = 1000, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;
          const scale = Math.min(1, maxSide / Math.max(width, height));
          width = Math.round(width * scale);
          height = Math.round(height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch (e) {
          URL.revokeObjectURL(url);
          reject(e);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("img"));
      };
      img.src = url;
    });
  }

  async function uploadItemImage(itemId, file) {
    if (!state.isAdmin) return;
    if (!file || !file.type.startsWith("image/")) {
      toast(t("catalogBadImage"));
      return;
    }
    const mode = window.KitchenStore?.mode || "none";
    // GitHub / JSONBin cannot store real photo files (size limits) — use drop folder
    if (mode !== "local") {
      const drop = `assets/products/${itemId}.jpg`;
      const msg = (t("catalogUseFolder") || "").replace("{file}", drop);
      toast(msg);
      console.info(
        `[Kitchen] Replace photo on GitHub Pages:\n` +
          `1) Save image as: ${drop}\n` +
          `2) Commit & push (GitHub Desktop)\n` +
          `3) Hard-refresh the live site\n` +
          `Full list: assets/products/README.txt`
      );
      return;
    }
    try {
      toast(t("catalogUploading"));
      let dataUrl;
      try {
        dataUrl = await compressImageFile(file);
      } catch {
        dataUrl = await readFileAsDataURL(file);
      }
      const data = window.KitchenStore
        ? await KitchenStore.menuImage(
            { itemId, filename: file.name, data: dataUrl },
            ADMIN_CODE
          )
        : await (
            await fetch("/api/menu/image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                code: ADMIN_CODE,
                itemId,
                filename: file.name,
                data: dataUrl,
              }),
            })
          ).then(async (res) => {
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || "fail");
            return d;
          });
      if (data.menu) applyMenuData(data.menu);
      state.cart = state.cart.map((l) =>
        l.id === itemId && data.img ? { ...l, img: data.img } : l
      );
      saveCart();
      renderAll();
      renderCatalogPanel();
      toast(t("catalogPhotoSaved"));
      updateSyncBadge();
    } catch (err) {
      console.warn(err);
      toast(
        (t("catalogUseFolder") || "").replace(
          "{file}",
          `assets/products/${itemId}.jpg`
        )
      );
    }
  }

  async function addMenuItemFromForm() {
    if (!state.isAdmin) return;
    const combo = $("#catalogSection")?.value || "";
    const [section, subKey] = combo.split("::");
    const name = ($("#catalogName")?.value || "").trim();
    const nameEn = ($("#catalogNameEn")?.value || "").trim() || name;
    const nameJa = ($("#catalogNameJa")?.value || "").trim() || name;
    const price = parseInt($("#catalogPrice")?.value || "", 10);
    const notes = ($("#catalogNotes")?.value || "").trim();
    if (!section || !subKey) {
      toast(t("catalogPickSection"));
      return;
    }
    if (!name) {
      toast(t("catalogNameRequired"));
      return;
    }
    if (Number.isNaN(price) || price < 0) {
      toast(t("catalogBadPrice"));
      return;
    }
    try {
      const payload = {
        action: "add",
        section,
        subKey,
        name,
        name_en: nameEn,
        name_ja: nameJa,
        price,
        notes,
        flags: [],
      };
      const data = window.KitchenStore
        ? await KitchenStore.menuItem(payload, ADMIN_CODE)
        : await (
            await fetch("/api/menu/item", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code: ADMIN_CODE, ...payload }),
            })
          ).then(async (res) => {
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || "fail");
            return d;
          });
      if (data.menu) applyMenuData(data.menu);
      if ($("#catalogName")) $("#catalogName").value = "";
      if ($("#catalogNameEn")) $("#catalogNameEn").value = "";
      if ($("#catalogNameJa")) $("#catalogNameJa").value = "";
      if ($("#catalogPrice")) $("#catalogPrice").value = "";
      if ($("#catalogNotes")) $("#catalogNotes").value = "";
      renderAll();
      renderCatalogPanel();
      toast(t("catalogAdded"));
      updateSyncBadge();
      if (data.item?.id) {
        const fileInput = $("#catalogNewPhoto");
        const file = fileInput?.files && fileInput.files[0];
        if (file) {
          await uploadItemImage(data.item.id, file);
          if (fileInput) fileInput.value = "";
        }
      }
    } catch {
      toast(t("catalogNeedServer"));
    }
  }

  function openAdminModal() {
    if (state.isAdmin) {
      // already in — just show bar / re-render
      setAdminUI();
      renderAll();
      toast(t("adminActive"));
      return;
    }
    const err = $("#adminCodeError");
    const input = $("#adminCodeInput");
    if (err) err.classList.add("is-hidden");
    if (input) {
      input.value = "";
      setTimeout(() => input.focus(), 100);
    }
    openModal("adminModal");
  }

  function closeAdminModal() {
    closeModal("adminModal");
  }

  function adminLogin() {
    const input = $("#adminCodeInput");
    const code = (input?.value || "").trim();
    const err = $("#adminCodeError");
    if (code !== ADMIN_CODE) {
      err?.classList.remove("is-hidden");
      input?.classList.add("is-invalid");
      toast(t("adminCodeError"));
      return;
    }
    state.isAdmin = true;
    sessionStorage.setItem(ADMIN_KEY, "1");
    err?.classList.add("is-hidden");
    closeAdminModal();
    setAdminUI();
    renderAll();
    toast(t("adminWelcome"));
  }

  function adminLogout() {
    state.isAdmin = false;
    sessionStorage.removeItem(ADMIN_KEY);
    setAdminUI();
    renderAll();
    toast(t("adminLoggedOut"));
  }

  /* Search */
  function runSearch(q) {
    const section = $("#resultsSection");
    const grid = $("#resultsGrid");
    if (!q.trim()) {
      section.classList.add("is-hidden");
      return;
    }
    const query = q.trim().toLowerCase();
    const hits = FLAT.filter((item) => {
      const sub = subLabelFor(item.subKey, item.subLabel);
      // Search across all language names + notes
      const names = Object.values(window.KITCHEN_ITEM_NAMES || {})
        .map((tbl) => tbl[item.id] || "")
        .join(" ");
      const hay = `${item.name} ${names} ${sub} ${noteFor(item)}`.toLowerCase();
      return hay.includes(query);
    }).map((item) => ({
      ...item,
      name: nameFor(item),
      subLabel: subLabelFor(item.subKey, item.subLabel),
    }));
    section.classList.remove("is-hidden");
    grid.innerHTML = hits.length
      ? hits.map(cardHTML).join("")
      : `<p class="empty">${t("noResults")}</p>`;
    bindAdds(grid);
  }

  /* Customize */
  function chips(field, label, options, { multi = false, hint = "" } = {}) {
    return `
      <div class="field">
        <span>${label}</span>
        ${hint ? `<small class="field-hint">${hint}</small>` : ""}
        <div class="chips" data-field="${field}" data-mode="${multi ? "multi" : "single"}">
          ${options
            .map((o) => {
              const disabled = !!o.disabled;
              return `<button type="button" class="chip${disabled ? " is-disabled" : ""}" data-value="${escapeHtml(
                o.k
              )}" aria-checked="false"${disabled ? " disabled aria-disabled=\"true\"" : ""}>${escapeHtml(o.v)}${
                disabled ? ` · ${escapeHtml(t("outOfStock"))}` : ""
              }</button>`;
            })
            .join("")}
        </div>
      </div>`;
  }

  /** Main style: one only (Natural = no sauce; CFA styles include +$20) */
  function bonelessStyleOptions() {
    return [
      { v: t("flavorNatural"), k: "natural" },
      { v: t("flavorBuffalo"), k: "buffalo" },
      { v: t("flavorBbq"), k: "bbq" },
      { v: t("flavorCfaOriginal"), k: "cfa_original" },
      { v: t("flavorCfaBbq"), k: "cfa_bbq" },
    ];
  }

  /** Extra sauces only (no Natural — that means no sauce). Labels without +$20. */
  function bonelessExtraSauceOptions() {
    return [
      { v: t("flavorBuffalo"), k: "buffalo" },
      { v: t("flavorBbq"), k: "bbq" },
      { v: t("flavorCfaOriginalPlain"), k: "cfa_original" },
      { v: t("flavorCfaBbqPlain"), k: "cfa_bbq" },
    ];
  }

  function bonelessStyleLabel(key) {
    const map = {
      natural: t("flavorNatural"),
      buffalo: t("flavorBuffalo"),
      bbq: t("flavorBbq"),
      cfa_original: t("flavorCfaOriginalPlain"),
      cfa_bbq: t("flavorCfaBbqPlain"),
    };
    return map[key] || key;
  }

  function selectedAll(field) {
    return $$(`.chips[data-field="${field}"] .chip.is-selected`).map((c) => c.dataset.value);
  }

  /** Placeholder text for item notes by drink/food category */
  function notesPlaceholderFor(item) {
    const flags = item.flags || [];
    const section = item.sectionId || "";
    if (flags.includes("coffee")) return t("itemNotesPlaceholderCoffee");
    // Soft drinks, juices, bar drinks, etc.
    if (section === "drinks" || section === "bar" || flags.includes("soda") || flags.includes("boing") || flags.includes("waterType")) {
      return t("itemNotesPlaceholderDrink");
    }
    // Food (and anything else) — keep current food-style message
    return t("itemNotesPlaceholder");
  }

  function openCustomize(item) {
    if (isItemUnavailable(item)) {
      toast(t("outOfStock"));
      return;
    }
    state.pendingItem = { ...item, flags: item.flags || [] };
    const flags = item.flags || [];
    let fields = "";

    if (flags.includes("beer")) {
      const brandOpts = beerBrandDefs().map((b) => ({
        k: b.k,
        v: nameFor(b.stockId, b.k),
        disabled: isOut(b.stockId),
      }));
      fields += chips("beerBrand", t("beerBrand"), brandOpts, {
        hint: t("beerPickBrand"),
      });
      fields += chips("beerPrep", t("beerPrep"), [
        { v: t("beerPrepNone"), k: "none" },
        { v: t("beerMichelada"), k: "michelada" },
        { v: t("beerLimonSal"), k: "limon_sal" },
      ]);
    }

    if (flags.includes("spirits")) {
      fields += chips(
        "spiritChoice",
        t("spiritChoice"),
        spiritOptionDefs().map((o) => ({
          k: o.k,
          v: t(o.labelKey),
          disabled: isOut(o.stockId),
        })),
        { hint: t("spiritPick") }
      );
    }

    if (flags.includes("fineSpirits")) {
      fields += chips(
        "fineSpiritChoice",
        t("fineSpiritChoice"),
        fineSpiritOptionDefs().map((o) => ({
          k: o.k,
          v: t(o.labelKey),
          disabled: isOut(o.stockId),
        })),
        { hint: t("spiritPick") }
      );
    }

    if (flags.includes("martini")) {
      fields += chips("martini", t("martiniStyle"), [
        { v: t("dry"), k: "dry" },
        { v: t("dirty"), k: "dirty" },
      ]);
    }
    if (flags.includes("burger")) {
      fields += chips("burger", t("burgerType"), [
        { v: t("beef"), k: "beef" },
        { v: t("chicken"), k: "chicken" },
      ]);
      fields += `<div class="field">
        <span>${t("burgerAddons")}</span>
        <small class="field-hint">${t("burgerBaconHint")}</small>
        <button type="button" class="chip chip--extra" id="burgerBaconToggle">${t("burgerBacon")}</button>
      </div>`;
      fields += chips("burgerSauce", t("burgerSauce"), [
        { v: t("burgerSauceNone"), k: "none" },
        { v: t("burgerSauceBuffalo"), k: "buffalo" },
        { v: t("burgerSauceCfa"), k: "cfa_original" },
      ], { hint: t("burgerSauceHint") });
    }
    if (flags.includes("boneless")) {
      // ONE style only (includes Chick-fil-A as styles, not stackable with others)
      fields += chips("flavor", t("bonelessStyle"), bonelessStyleOptions(), {
        hint: t("bonelessPickOne"),
      });
      // Optional extra sauces only (no Natural). Each +$20. Multi-select OK.
      fields += chips("extraSauce", t("extraSauce"), bonelessExtraSauceOptions(), {
        multi: true,
        hint: t("extraSauceHint"),
      });
    }
    if (flags.includes("side")) {
      fields += chips("side", t("side"), [
        { v: t("sideSalad"), k: "salad" },
        { v: t("sideFries"), k: "fries" },
      ]);
    }
    if (flags.includes("dressing")) {
      fields += chips("dressing", t("dressing"), [
        { v: "Aceite de oliva", k: "Aceite de oliva" },
        { v: "Aderezo ranch", k: "Aderezo ranch" },
        { v: "Limon y soya", k: "Limon y soya" },
        { v: "Mostaza y soya", k: "Mostaza y soya" },
      ]);
    }
    if (flags.includes("extraChicken")) {
      fields += `<div class="field">
        <span>${t("extraChicken")}</span>
        <small class="field-hint">${t("extraChickenHint")}</small>
        <button type="button" class="chip chip--extra" id="extraChickenToggle">${t("extraChickenOption")}</button>
      </div>`;
    }
    if (flags.includes("waffle")) {
      fields += chips("topping", t("topping"), [
        { v: "Nutella", k: "Nutella" },
        { v: "Miel", k: "Miel" },
        { v: "Nieve de frutos rojos", k: "Nieve de frutos rojos" },
      ]);
    }
    if (flags.includes("coffee")) {
      fields += chips("milk", t("milkAlt"), [
        { v: t("milkNone"), k: "none" },
        { v: t("milkWhole"), k: "whole" },
        { v: t("milkLactose"), k: "lactose" },
        { v: t("milkOat"), k: "oat" },
        { v: t("milkAlmond"), k: "almond" },
      ]);
    }
    if (flags.includes("soda")) {
      fields += chips(
        "soda",
        t("sodaType"),
        sodaOptionDefs().map((o) => ({
          k: o.k,
          v: t(o.labelKey),
          disabled: isOut(o.stockId),
        })),
        { hint: t("sodaPickType") }
      );
    }
    if (flags.includes("boing")) {
      fields += chips(
        "boing",
        t("boingFlavor"),
        boingOptionDefs().map((o) => ({
          k: o.k,
          v: t(o.labelKey),
          disabled: isOut(o.stockId),
        })),
        { hint: t("boingPickFlavor") }
      );
    }
    if (flags.includes("tacos")) {
      fields += chips(
        "tacoType",
        t("tacoType"),
        tacoOptionDefs().map((o) => ({
          k: o.k,
          v: t(o.labelKey),
          disabled: isOut(o.stockId),
        })),
        { hint: t("tacoPickType") }
      );
    }
    if (flags.includes("waterType")) {
      fields += chips("waterType", t("waterType"), [
        { v: t("waterStill"), k: "still" },
        { v: t("waterSparkling"), k: "sparkling" },
      ]);
    }

    const notesPlaceholder = notesPlaceholderFor(item);
    const body = $("#customizeBody");
    body.classList.add("modal__panel--customize");
    const weeklyBanner = isWeeklySpecial(item)
      ? `<div class="modal__weekly-banner" role="status">${escapeHtml(
          t("badgeWeeklyAvailable")
        )} <strong>${weeklyQtyRemaining(item)}</strong></div>`
      : "";
    body.innerHTML = `
      <button type="button" class="icon-btn modal__close" data-close-modal aria-label="Close">✕</button>
      <div class="modal__scroll">
        <img ${productImgAttrs(item, "modal__img")} alt="" />
        <h3 class="modal__title">${escapeHtml(nameFor(item))}</h3>
        ${weeklyBanner}
        <p class="modal__price modal__price--inline" id="customizePriceLabel">${fmt(item.price)}</p>
        ${fields}
        <div class="field">
          <span>${t("itemNotes")}</span>
          <textarea
            id="itemNotes"
            class="notes-input"
            rows="2"
            maxlength="160"
            placeholder="${escapeHtml(notesPlaceholder)}"
          ></textarea>
          <small class="field-hint">${t("itemNotesHint")}</small>
        </div>
        <div class="field field--qty">
          <span>${t("qty")}</span>
          <div class="qty-row">
            <button type="button" class="qty-btn" data-cq="-">−</button>
            <input type="number" id="customizeQty" min="1" max="99" value="1" />
            <button type="button" class="qty-btn" data-cq="+">+</button>
          </div>
        </div>
      </div>
      <div class="modal__footer-bar">
        <div class="modal__footer-price" id="customizePrice">${fmt(item.price)}</div>
        <button type="button" class="btn btn--primary btn--full" id="confirmAdd">${t("add")}</button>
      </div>
    `;

    // Single-select groups: radio. Multi groups (extra sauce): toggle independently.
    $$(".chips", body).forEach((g) => {
      const multi = g.dataset.mode === "multi";
      g.setAttribute("role", multi ? "group" : "radiogroup");
      if (!multi) {
        // Prefer first available (not disabled) chip — e.g. skip OOS beer brands
        const first = $$(".chip", g).find((c) => !c.disabled && !c.classList.contains("is-disabled"));
        if (first) {
          first.classList.add("is-selected");
          first.setAttribute("aria-checked", "true");
        }
      }
    });

    $$(".chips .chip", body).forEach((chip) => {
      chip.addEventListener("click", () => {
        if (chip.disabled || chip.classList.contains("is-disabled")) return;
        const group = chip.closest(".chips");
        if (!group) return;
        const multi = group.dataset.mode === "multi";
        if (multi) {
          chip.classList.toggle("is-selected");
          chip.setAttribute("aria-checked", chip.classList.contains("is-selected") ? "true" : "false");
        } else {
          $$(".chip", group).forEach((c) => {
            c.classList.remove("is-selected");
            c.setAttribute("aria-checked", "false");
          });
          chip.classList.add("is-selected");
          chip.setAttribute("aria-checked", "true");
        }
        refreshPrice();
      });
    });

    $("#burgerBaconToggle")?.addEventListener("click", (e) => {
      e.currentTarget.classList.toggle("is-selected");
      refreshPrice();
    });

    $("#extraChickenToggle")?.addEventListener("click", (e) => {
      e.currentTarget.classList.toggle("is-selected");
      refreshPrice();
    });

    $$("[data-cq]", body).forEach((b) => {
      b.addEventListener("click", () => {
        const input = $("#customizeQty");
        let v = parseInt(input.value, 10) || 1;
        v = b.dataset.cq === "+" ? v + 1 : v - 1;
        input.value = Math.min(99, Math.max(1, v));
      });
    });

    $("[data-close-modal]", body)?.addEventListener("click", () => closeModal("customizeModal"));
    $("#confirmAdd").addEventListener("click", confirmAdd);
    openModal("customizeModal");
    refreshPrice();
  }

  function selected(field) {
    return $(`.chips[data-field="${field}"] .chip.is-selected`)?.dataset.value || null;
  }

  function computeExtras() {
    let extra = 0;
    const parts = [];
    const item = state.pendingItem;
    if (!item) return { extra, parts };
    const f = item.flags || [];

    if (f.includes("martini")) {
      const v = selected("martini");
      if (v === "dry") parts.push(t("dry"));
      if (v === "dirty") parts.push(t("dirty"));
    }
    if (f.includes("burger")) {
      const v = selected("burger");
      if (v === "beef") parts.push(t("beef"));
      if (v === "chicken") parts.push(t("chicken"));
      if ($("#burgerBaconToggle")?.classList.contains("is-selected")) {
        extra += 20;
        parts.push(t("burgerBaconShort"));
      }
      const sauce = selected("burgerSauce");
      if (sauce === "buffalo") {
        extra += 20;
        parts.push(t("burgerSauceBuffaloShort"));
      } else if (sauce === "cfa_original") {
        extra += 20;
        parts.push(t("burgerSauceCfaShort"));
      }
    }
    if (f.includes("boneless")) {
      const fl = selected("flavor");
      // Exactly one main style
      if (fl) {
        parts.push(bonelessStyleLabel(fl));
        if (fl === "cfa_original" || fl === "cfa_bbq") extra += 20;
      }
      // Extra sauce portions (+$20 each)
      selectedAll("extraSauce").forEach((key) => {
        extra += 20;
        parts.push(`${t("extraSauceShort")}: ${bonelessStyleLabel(key)}`);
      });
    }
    if (f.includes("side")) {
      const v = selected("side");
      if (v === "salad") parts.push(t("sideSalad"));
      if (v === "fries") parts.push(t("sideFries"));
    }
    if (f.includes("dressing")) {
      const v = selected("dressing");
      if (v) parts.push(v);
    }
    if (f.includes("extraChicken")) {
      if ($("#extraChickenToggle")?.classList.contains("is-selected")) {
        extra += 60;
        parts.push(t("extraChickenShort"));
      }
    }
    if (f.includes("waffle")) {
      const v = selected("topping");
      if (v) parts.push(v);
    }
    if (f.includes("coffee")) {
      const v = selected("milk");
      if (v === "whole") {
        parts.push(t("milkWholeShort"));
      } else if (v === "lactose") {
        parts.push(t("milkLactoseShort"));
      } else if (v === "oat") {
        extra += 18;
        parts.push(t("milkOatShort"));
      } else if (v === "almond") {
        extra += 18;
        parts.push(t("milkAlmondShort"));
      }
      // "none" = no milk — no line needed
    }
    if (f.includes("soda")) {
      const v = selected("soda");
      const sodaMap = {
        coke: t("sodaCoke"),
        coke_zero: t("sodaCokeZero"),
        coke_light: t("sodaCokeLight"),
        sprite_zero: t("sodaSpriteZero"),
      };
      if (v && sodaMap[v]) parts.push(sodaMap[v]);
    }
    if (f.includes("boing")) {
      const v = selected("boing");
      const boingMap = {
        grape: t("boingGrape"),
        mango: t("boingMango"),
        strawberry: t("boingStrawberry"),
        guava: t("boingGuava"),
      };
      if (v && boingMap[v]) parts.push(boingMap[v]);
    }
    if (f.includes("tacos")) {
      const v = selected("tacoType");
      if (v) parts.push(variantOptionLabel("tacos", v));
    }
    if (f.includes("waterType")) {
      const v = selected("waterType");
      if (v === "still") parts.push(t("waterStill"));
      if (v === "sparkling") parts.push(t("waterSparkling"));
    }
    if (f.includes("beer")) {
      const brand = selected("beerBrand");
      if (brand) parts.push(beerBrandLabel(brand));
      const prep = selected("beerPrep");
      if (prep === "michelada") {
        extra += 20;
        parts.push(t("beerMicheladaShort"));
      } else if (prep === "limon_sal") {
        extra += 15;
        parts.push(t("beerLimonSalShort"));
      }
    }
    if (f.includes("spirits")) {
      const v = selected("spiritChoice");
      if (v) parts.push(variantOptionLabel("spirits", v));
    }
    if (f.includes("fineSpirits")) {
      const v = selected("fineSpiritChoice");
      if (v) parts.push(variantOptionLabel("fineSpirits", v));
    }
    return { extra, parts };
  }

  function refreshPrice() {
    const item = state.pendingItem;
    if (!item) return;
    const { extra } = computeExtras();
    const priceText = fmt(item.price + extra);
    const el = $("#customizePrice");
    if (el) el.textContent = priceText;
    const label = $("#customizePriceLabel");
    if (label) label.textContent = priceText;
  }

  function confirmAdd() {
    const item = state.pendingItem;
    if (!item) return;
    const flags = item.flags || [];
    if (flags.includes("beer")) {
      const brand = selected("beerBrand");
      if (!brand) {
        toast(t("beerNeedBrand"));
        return;
      }
      const stockId = beerBrandStockId(brand);
      if (stockId && isOut(stockId)) {
        toast(t("outOfStock"));
        return;
      }
    }
    if (flags.includes("spirits")) {
      const v = selected("spiritChoice");
      if (!v) {
        toast(t("spiritNeedChoice"));
        return;
      }
      const stockId = variantOptionStockId("spirits", v);
      if (stockId && isOut(stockId)) {
        toast(t("outOfStock"));
        return;
      }
    }
    if (flags.includes("fineSpirits")) {
      const v = selected("fineSpiritChoice");
      if (!v) {
        toast(t("spiritNeedChoice"));
        return;
      }
      const stockId = variantOptionStockId("fineSpirits", v);
      if (stockId && isOut(stockId)) {
        toast(t("outOfStock"));
        return;
      }
    }
    if (flags.includes("soda")) {
      const v = selected("soda");
      if (!v) {
        toast(t("sodaNeedType"));
        return;
      }
      const stockId = variantOptionStockId("soda", v);
      if (stockId && isOut(stockId)) {
        toast(t("outOfStock"));
        return;
      }
    }
    if (flags.includes("boing")) {
      const v = selected("boing");
      if (!v) {
        toast(t("boingNeedFlavor"));
        return;
      }
      const stockId = variantOptionStockId("boing", v);
      if (stockId && isOut(stockId)) {
        toast(t("outOfStock"));
        return;
      }
    }
    if (flags.includes("tacos")) {
      const v = selected("tacoType");
      if (!v) {
        toast(t("tacoNeedType"));
        return;
      }
      const stockId = variantOptionStockId("tacos", v);
      if (stockId && isOut(stockId)) {
        toast(t("outOfStock"));
        return;
      }
    }
    const { extra, parts } = computeExtras();
    let qty = Math.min(99, Math.max(1, parseInt($("#customizeQty")?.value, 10) || 1));
    if (isWeeklySpecial(item)) {
      const left = weeklyQtyRemaining(item);
      if (left <= 0) {
        toast(t("weeklySoldOut"));
        return;
      }
      if (qty > left) {
        qty = left;
        toast(t("weeklyLimitedQty").replace("{n}", String(left)));
      }
    }
    const notes = ($("#itemNotes")?.value || "").trim().slice(0, 160);
    const dineInOnly = isDineInOnly(item);
    state.cart.push({
      uid: `${item.id}-${Date.now()}`,
      id: item.id,
      name: nameFor(item),
      // Store menu image URL so cart shows the real photo (not a missing local path)
      img: productImgSrc(item),
      unitPrice: item.price + extra,
      qty,
      customizations: parts.join(" · "),
      notes,
      dineInOnly,
    });
    saveCart();
    closeModal("customizeModal");
    toast(`${t("added")}: ${nameFor(item)}`);
  }

  /* Cart */
  function renderCart() {
    const host = $("#cartLines");
    if (!host) return;

    if (!state.cart.length) {
      host.innerHTML = `<p class="empty">${t("cartEmpty")}</p>`;
    } else {
      host.innerHTML = state.cart
        .map(
          (line) => `
        <div class="cart-line" data-uid="${line.uid}">
          <img alt="" ${productImgAttrs({
            id: line.id,
            img: line.img || FLAT.find((x) => x.id === line.id)?.img || "",
          })} />
          <div class="cart-line__content">
            <div class="cart-line__top">
              <div class="cart-line__name">${escapeHtml(nameFor(line.id, line.name))}</div>
              <div class="cart-line__price">${fmt(line.unitPrice * line.qty)}</div>
            </div>
            ${
              line.customizations
                ? `<div class="cart-line__meta">${escapeHtml(line.customizations)}</div>`
                : ""
            }
            ${
              line.notes
                ? `<div class="cart-line__notes"><span>${t("itemNotesShort")}:</span> ${escapeHtml(line.notes)}</div>`
                : ""
            }
            <div class="cart-line__ctrls">
              <button type="button" class="qty-btn" data-qty="-">−</button>
              <span class="cart-line__qty">${line.qty}</span>
              <button type="button" class="qty-btn" data-qty="+">+</button>
              <button type="button" class="cart-line__rm" data-remove>${t("remove")}</button>
            </div>
          </div>
        </div>`
        )
        .join("");

      $$(".cart-line", host).forEach((row) => {
        const uid = row.dataset.uid;
        $$("[data-qty]", row).forEach((b) => {
          b.addEventListener("click", () => {
            const line = state.cart.find((l) => l.uid === uid);
            if (!line) return;
            line.qty += b.dataset.qty === "+" ? 1 : -1;
            if (line.qty <= 0) state.cart = state.cart.filter((l) => l.uid !== uid);
            saveCart();
          });
        });
        $("[data-remove]", row)?.addEventListener("click", () => {
          state.cart = state.cart.filter((l) => l.uid !== uid);
          saveCart();
        });
      });
    }

    $("#cartSubtotal").textContent = fmt(subtotal());
  }

  function updateOrderMini() {
    const host = $("#orderSummaryMini");
    if (!host) return;
    if (!state.cart.length) {
      host.innerHTML = `<p class="empty">${t("cartEmpty")}</p>`;
      return;
    }
    const lines = state.cart
      .slice(0, 4)
      .map(
        (l) =>
          `<div class="line"><span>${escapeHtml(nameFor(l.id, l.name))} ×${l.qty}${
            l.notes ? `<br><small style="color:var(--muted)">${escapeHtml(l.notes)}</small>` : ""
          }</span><span style="white-space:nowrap;text-align:right">${fmt(
            l.unitPrice * l.qty
          )}</span></div>`
      )
      .join("");
    const more =
      state.cart.length > 4
        ? `<p class="empty" style="padding:.4rem 0;text-align:left">+${state.cart.length - 4}</p>`
        : "";
    host.innerHTML =
      lines +
      more +
      `<div class="line" style="border:none;margin-top:.4rem"><strong>${t(
        "subtotal"
      )}</strong><strong style="color:var(--accent)">${fmt(subtotal())}</strong></div>`;
  }

  function updateBadges() {
    const count = state.cart.reduce((s, l) => s + l.qty, 0);
    $("#cartCount").textContent = String(count);
    $("#fabTotal").textContent = fmt(subtotal());
    $("#fabCart").classList.toggle("has-items", count > 0);
    updateHoursUI();
  }

  const AMENITIES = [
    { id: "grill_terrace", icon: "🔥" },
    { id: "tasting_room", icon: "🍷" },
    { id: "reading_room", icon: "📚" },
    { id: "kids_room", icon: "🧸" },
    { id: "coworking", icon: "💻" },
    { id: "pool", icon: "🏊" },
    { id: "hot_tub", icon: "♨️" },
  ];

  function amenityLabel(id) {
    const key = `amenity_${id}`;
    const tr = t(key);
    return tr !== key ? tr : id;
  }

  function setOrderType(type) {
    if (!["dinein", "apartment", "amenity"].includes(type)) return;
    state.orderType = type;
    sessionStorage.setItem("kitchen-order-type", type);
    if (type !== "amenity") {
      state.amenity = null;
      sessionStorage.removeItem("kitchen-amenity");
    }
    if (type !== "apartment") {
      setApartmentError(false);
    }
    updateOrderTypeUI();
  }

  function setAmenity(id) {
    state.amenity = id;
    sessionStorage.setItem("kitchen-amenity", id);
    updateOrderTypeUI();
  }

  function renderAmenityGrid() {
    const grid = $("#amenityGrid");
    if (!grid) return;
    grid.innerHTML = AMENITIES.map(
      (a) => `
      <button type="button" class="amenity-chip${state.amenity === a.id ? " is-selected" : ""}" data-amenity="${a.id}">
        <span class="amenity-chip__ico" aria-hidden="true">${a.icon}</span>
        <span class="amenity-chip__label">${escapeHtml(amenityLabel(a.id))}</span>
      </button>`
    ).join("");
    $$("[data-amenity]", grid).forEach((btn) => {
      btn.addEventListener("click", () => {
        setAmenity(btn.dataset.amenity);
        $("#amenityError")?.classList.add("is-hidden");
      });
    });
  }

  function updateOrderTypeUI() {
    const type = state.orderType;
    $$("[data-order-type]").forEach((btn) => {
      btn.classList.toggle("is-selected", btn.dataset.orderType === type);
    });

    const aptField = $("#apartmentField");
    const amenityField = $("#amenityField");
    const isApartment = type === "apartment";
    const isAmenity = type === "amenity";

    if (aptField) aptField.classList.toggle("is-hidden", !isApartment);
    if (amenityField) amenityField.classList.toggle("is-hidden", !isAmenity);

    if (isAmenity) renderAmenityGrid();

    // Only show stored apartment when apartment delivery is active
    const input = $("#apartmentInput");
    if (input) {
      if (isApartment) {
        input.value = state.apartment || "";
        input.removeAttribute("readonly");
      } else {
        // clear visible field so it doesn't look pre-filled when switching away
        input.value = "";
      }
    }

    if (!isApartment) setApartmentError(false);
    $("#orderTypeError")?.classList.add("is-hidden");
    if (!isAmenity) $("#amenityError")?.classList.add("is-hidden");

    // When amenity list expands, keep options + Send button reachable
    if (isAmenity || isApartment) {
      requestAnimationFrame(() => {
        const target = isAmenity ? amenityField : aptField;
        const panel = $(".drawer__panel");
        if (target && panel) {
          target.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      });
    }
  }

  function openCart() {
    $("#cartDrawer").classList.add("is-open");
    $("#cartDrawer").setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    setApartmentError(false);
    updateOrderTypeUI();
    updateHoursUI();
  }

  function closeCart() {
    $("#cartDrawer").classList.remove("is-open");
    $("#cartDrawer").setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function openModal(id) {
    $(`#${id}`).classList.add("is-open");
    $(`#${id}`).setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal(id) {
    $(`#${id}`)?.classList.remove("is-open");
    $(`#${id}`)?.setAttribute("aria-hidden", "true");
    if (id === "customizeModal") {
      $("#customizeBody")?.classList.remove("modal__panel--customize");
    }
    if (!$(".drawer.is-open") && !$(".modal.is-open")) {
      document.body.style.overflow = "";
    }
  }

  // Poll stock + hours so guests see admin updates without refresh
  let stockPoll = null;
  function startStockPoll() {
    if (stockPoll) return;
    stockPoll = setInterval(async () => {
      if (document.hidden) return;
      const before = [...state.outOfStock].sort().join(",");
      const menuSig = (list) =>
        list
          .map(
            (x) =>
              `${x.id}|${x.img || ""}|${x.price}|${x.isNew ? 1 : 0}|${x.isWeeklySpecial ? 1 : 0}|${x.weeklyQty || 0}`
          )
          .join(";");
      const menuBefore = menuSig(FLAT);
      if (window.KitchenStore?.mode === "jsonbin") {
        try {
          await KitchenStore.refresh();
        } catch {
          /* keep cache */
        }
      }
      await Promise.all([fetchMenu(), fetchStock(), fetchHours()]);
      const after = [...state.outOfStock].sort().join(",");
      const menuAfter = menuSig(FLAT);
      if (before !== after || menuBefore !== menuAfter) {
        renderAll();
        const q = $("#searchInput")?.value;
        if (q) runSearch(q);
        if (state.isAdmin && $("#catalogModal")?.classList.contains("is-open")) {
          renderCatalogPanel();
        }
      }
      // always refresh open/closed (clock may cross cutoff)
      updateHoursUI();
    }, 8000);
  }

  /* Apartment + WhatsApp */
  function getApartment() {
    const input = $("#apartmentInput");
    // Only read the live input when apartment delivery is selected
    const value = (input?.value || "").trim();
    state.apartment = value;
    if (value) sessionStorage.setItem("kitchen-apt", value);
    else sessionStorage.removeItem("kitchen-apt");
    return value;
  }

  function setApartmentError(show) {
    const err = $("#apartmentError");
    const field = $("#apartmentField");
    const input = $("#apartmentInput");
    if (err) err.classList.toggle("is-hidden", !show);
    if (field) field.classList.toggle("is-invalid", !!show);
    if (input && show) {
      input.setAttribute("aria-invalid", "true");
      input.focus({ preventScroll: false });
      input.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } else if (input) {
      input.removeAttribute("aria-invalid");
    }
  }

  function buildWhatsAppMessage({ orderType, apartment, amenity }) {
    const lines = [];
    lines.push("🍽️ *The Kitchen at 22*");
    lines.push(t("waOrderTitle"));
    if (orderType === "dinein") {
      lines.push(`📍 *${t("waService")}:* ${t("orderTypeDineIn")}`);
    } else if (orderType === "apartment") {
      lines.push(`🏠 *${t("waService")}:* ${t("orderTypeApartment")}`);
      if (apartment) lines.push(`🏠 *${t("waApt")}:* ${apartment}`);
    } else if (orderType === "amenity") {
      lines.push(`🏊 *${t("waService")}:* ${t("orderTypeAmenity")}`);
      if (amenity) lines.push(`📌 *${t("waAmenity")}:* ${amenityLabel(amenity)}`);
    }
    lines.push("————————————");
    state.cart.forEach((line, i) => {
      const nm = nameFor(line.id, line.name);
      // No prices in WhatsApp (items or total)
      lines.push(`${i + 1}. ${nm} ×${line.qty}`);
      if (line.customizations) lines.push(`   · ${line.customizations}`);
      if (line.notes) lines.push(`   📝 ${t("itemNotesShort")}: ${line.notes}`);
      const it = FLAT.find((x) => x.id === line.id);
      if (line.dineInOnly || isDineInOnly(it)) {
        lines.push(`   ⚠️ ${t("dineInOnlyShort")}`);
      }
    });
    lines.push("————————————");
    lines.push("");
    lines.push(t("waThanks"));
    return lines.join("\n");
  }

  function sendWhatsApp() {
    const status = getOrderStatus();
    if (!status.open) {
      updateHoursUI();
      toast(closedMessage(status));
      return;
    }
    if (!state.cart.length) {
      toast(t("cartEmpty"));
      return;
    }
    if (!["dinein", "apartment", "amenity"].includes(state.orderType)) {
      $("#orderTypeError")?.classList.remove("is-hidden");
      toast(t("orderTypeError"));
      return;
    }
    // Dine-in-only items cannot go with apartment / amenity delivery
    if (state.orderType === "apartment" || state.orderType === "amenity") {
      const blocked = state.cart.some((line) => {
        if (line.dineInOnly) return true;
        const it = FLAT.find((x) => x.id === line.id);
        return isDineInOnly(it);
      });
      if (blocked) {
        toast(t("dineInOnlyBlock"));
        return;
      }
    }
    let apartment = "";
    if (state.orderType === "apartment") {
      apartment = getApartment();
      if (!apartment) {
        setApartmentError(true);
        toast(t("aptRequired"));
        return;
      }
    }
    if (state.orderType === "amenity") {
      if (!state.amenity || !AMENITIES.some((a) => a.id === state.amenity)) {
        $("#amenityError")?.classList.remove("is-hidden");
        toast(t("amenityError"));
        return;
      }
    }
    setApartmentError(false);
    $("#orderTypeError")?.classList.add("is-hidden");
    $("#amenityError")?.classList.add("is-hidden");
    const text = encodeURIComponent(
      buildWhatsAppMessage({
        orderType: state.orderType,
        apartment,
        amenity: state.amenity,
      })
    );
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = url;
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    toast(t("waOpened"));
  }

  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-show"), 2400);
  }

  /* Motion + scroll chrome */
  function initChrome() {
    setTimeout(() => $("#loader")?.classList.add("is-done"), 900);

    const header = $("#header");
    const progress = $("#scrollProgress");

    const onScroll = () => {
      const y = window.scrollY || 0;
      header?.classList.toggle("is-scrolled", y > 24);
      if (progress) {
        const doc = document.documentElement;
        const max = doc.scrollHeight - doc.clientHeight;
        progress.style.width = max > 0 ? `${(y / max) * 100}%` : "0%";
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    if (window.gsap && window.ScrollTrigger) {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.registerPlugin(ScrollTrigger);
      gsap.from(".hero__content > *", {
        y: 28,
        opacity: 0,
        duration: 0.75,
        stagger: 0.08,
        ease: "power3.out",
        delay: 0.45,
        clearProps: "transform,opacity",
      });
      // Fade only — translateY on staggered cards breaks equal-height grid rows
      // (looks "disaligned" until a re-render, e.g. language change).
      ["#specialsGrid", "#drinksGrid", "#barGrid", "#foodGrid"].forEach((sel) => {
        ScrollTrigger.batch(sel + " .menu-card", {
          start: "top 94%",
          onEnter: (batch) => {
            gsap.fromTo(
              batch,
              { autoAlpha: 0 },
              {
                autoAlpha: 1,
                duration: 0.4,
                stagger: 0.03,
                ease: "power2.out",
                overwrite: "auto",
                clearProps: "opacity,visibility,transform",
                onComplete: () => {
                  gsap.set(batch, { clearProps: "all" });
                },
              }
            );
          },
          once: true,
        });
      });
      // After webfonts settle, refresh triggers so batch positions match final layout
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
          try {
            ScrollTrigger.refresh();
          } catch (_) {}
        });
      }
    }
  }

  function bindEvents() {
    $$(".lang__btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.lang = btn.dataset.lang;
        localStorage.setItem("kitchen-lang", state.lang);
        applyI18n();
      });
    });

    $("#cartOpen")?.addEventListener("click", openCart);
    $("#fabCart")?.addEventListener("click", openCart);
    $("#openCartFromOrder")?.addEventListener("click", openCart);
    $$("[data-close-cart]").forEach((el) => el.addEventListener("click", closeCart));
    document.addEventListener("click", (e) => {
      if (e.target.matches("[data-close-modal]") || e.target.closest("[data-close-modal]")) {
        closeModal("customizeModal");
      }
      if (e.target.matches("[data-close-admin]") || e.target.closest("[data-close-admin]")) {
        closeAdminModal();
      }
    });

    $("#clearCart")?.addEventListener("click", () => {
      state.cart = [];
      saveCart();
    });
    $("#sendWhatsApp")?.addEventListener("click", sendWhatsApp);

    $$("[data-order-type]").forEach((btn) => {
      btn.addEventListener("click", () => setOrderType(btn.dataset.orderType));
    });

    $("#adminBtn")?.addEventListener("click", openAdminModal);
    $("#adminLoginSubmit")?.addEventListener("click", adminLogin);
    $("#adminLogout")?.addEventListener("click", adminLogout);
    $("#adminHoursBtn")?.addEventListener("click", openHoursModal);
    $("#adminCatalogBtn")?.addEventListener("click", openCatalogModal);
    $("#catalogAddBtn")?.addEventListener("click", addMenuItemFromForm);
    $("#catalogFilter")?.addEventListener("input", () => {
      if (state.isAdmin) renderCatalogPanel();
    });
    document.addEventListener("click", (e) => {
      if (e.target.matches("[data-close-catalog]") || e.target.closest("[data-close-catalog]")) {
        closeCatalogModal();
      }
    });
    $("#hoursSave")?.addEventListener("click", saveHoursFromForm);
    $("#hoursForceClosed")?.addEventListener("change", () => {
      if ($("#hoursForceClosed")?.checked && $("#hoursForceOpen")) {
        $("#hoursForceOpen").checked = false;
      }
    });
    $("#hoursForceOpen")?.addEventListener("change", () => {
      if ($("#hoursForceOpen")?.checked && $("#hoursForceClosed")) {
        $("#hoursForceClosed").checked = false;
      }
    });
    document.addEventListener("click", (e) => {
      if (e.target.matches("[data-close-hours]") || e.target.closest("[data-close-hours]")) {
        closeHoursModal();
      }
    });
    $("#adminCodeInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        adminLogin();
      }
    });

    const aptInput = $("#apartmentInput");
    if (aptInput) {
      aptInput.addEventListener("input", () => {
        if (state.orderType === "apartment") {
          getApartment();
          if (aptInput.value.trim()) setApartmentError(false);
        }
      });
      aptInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          sendWhatsApp();
        }
      });
    }

    let st;
    $("#searchInput")?.addEventListener("input", (e) => {
      clearTimeout(st);
      st = setTimeout(() => runSearch(e.target.value), 150);
    });

    const burger = $("#menuToggle");
    burger?.addEventListener("click", () => {
      const open = $("#nav").classList.toggle("is-open");
      burger.classList.toggle("is-open", open);
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });

    $$(".nav a").forEach((a) => {
      a.addEventListener("click", () => {
        $("#nav")?.classList.remove("is-open");
        burger?.classList.remove("is-open");
      });
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeCart();
        closeModal("customizeModal");
        closeAdminModal();
        closeHoursModal();
        closeCatalogModal();
      }
    });

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const id = en.target.id;
          $$(".nav__link").forEach((a) => {
            a.classList.toggle("is-active", a.getAttribute("href") === `#${id}`);
          });
          $$(".menu-switcher__btn").forEach((a) => {
            a.classList.toggle("is-active", a.dataset.section === id);
          });
        });
      },
      { rootMargin: "-40% 0px -45% 0px" }
    );
    ["specials", "drinks", "bar", "food", "order"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });

    // Sticky switcher becomes solid after leaving hero
    const switcher = $("#menuSwitcher");
    const onSwitchScroll = () => {
      if (!switcher) return;
      switcher.classList.toggle("is-visible", (window.scrollY || 0) > 280);
    };
    window.addEventListener("scroll", onSwitchScroll, { passive: true });
    onSwitchScroll();
  }

  async function init() {
    if (window.KitchenStore) {
      await KitchenStore.init();
    }
    await Promise.all([fetchMenu(), fetchStock(), fetchHours()]);
    // Drop cart lines that are currently out of stock
    if (state.cart.some((l) => isOut(l.id))) {
      state.cart = state.cart.filter((l) => !isOut(l.id));
      sessionStorage.setItem("kitchen-cart", JSON.stringify(state.cart));
    }
    applyI18n();
    setAdminUI();
    updateBadges();
    updateOrderMini();
    // Migrate old session value "togo" → "apartment"
    if (state.orderType === "togo") {
      state.orderType = "apartment";
      sessionStorage.setItem("kitchen-order-type", "apartment");
    }
    updateOrderTypeUI();
    updateHoursUI();
    bindEvents();
    initChrome();
    startStockPoll();
    // Re-check every minute as the clock crosses open/close
    setInterval(updateHoursUI, 60_000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
