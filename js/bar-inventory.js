/**
 * Bar inventory — bottled / canned drinks only (no prep food).
 * Morning count + tickets sold today → remaining % and 20% alerts.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "kitchen-bar-inventory";
  const ALERT_LOG_KEY = "kitchen-bar-alerts-sent";
  const THRESHOLD = 0.2;
  const ML_PER_OZ = 29.5735;
  const servPerBot = (pourOz, bottleMl = 750) => bottleMl / (pourOz * ML_PER_OZ);

  const RECIPES = {
    "b-aperol": [
      { id: "b-ing-prosecco", qty: 1 },
      { id: "b-ing-aperol", qty: 1 },
    ],
    "b-st-germain": [
      { id: "b-ing-prosecco", qty: 1 },
      { id: "b-ing-cointreau", qty: 1 },
      { id: "d-soda-ginger-ale", qty: 1 },
    ],
  };

  const GROUPS = [
    {
      id: "spritz",
      label: "Spritz · botellas 750 ml",
      note: "Aperol Spritz: 2 oz prosecco + 1 oz Aperol. St Germain Spritz: 2 oz prosecco + 1 oz Cointreau + Ginger Ale 350 ml.",
      unit: "serv",
      skus: [
        {
          id: "b-ing-prosecco",
          name: "Prosecco",
          aliases: ["prosecco"],
          inputUnit: "botellas",
          pourOz: 2,
          servingsPerBottle: servPerBot(2),
        },
        {
          id: "b-ing-aperol",
          name: "Aperol",
          aliases: ["aperol"],
          inputUnit: "botellas",
          pourOz: 1,
          servingsPerBottle: servPerBot(1),
        },
        {
          id: "b-ing-cointreau",
          name: "Cointreau",
          aliases: ["cointreau", "controy"],
          inputUnit: "botellas",
          pourOz: 1,
          servingsPerBottle: servPerBot(1),
        },
      ],
    },
    {
      id: "beer",
      label: "Cerveza",
      unit: "pzas",
      skus: [
        { id: "b-beer-corona", name: "Corona", aliases: ["corona"] },
        { id: "b-beer-pacifico", name: "Pacífico", aliases: ["pacifico", "pacífico"] },
        { id: "b-beer-negra-modelo", name: "Negra Modelo", aliases: ["negra modelo", "negra_modelo"] },
        { id: "b-beer-modelo", name: "Modelo", aliases: ["modelo especial", "modelo"] },
        { id: "b-beer-victoria", name: "Victoria", aliases: ["victoria"] },
        { id: "b-beer-amstel", name: "Amstel Ultra", aliases: ["amstel"] },
        { id: "b-beer-heineken", name: "Heineken", aliases: ["heineken"] },
      ],
    },
    {
      id: "soda",
      label: "Refresco",
      unit: "pzas",
      skus: [
        { id: "d-soda-coke", name: "Coke Regular", aliases: ["coke regular", "coca", "coke"] },
        { id: "d-soda-coke-zero", name: "Coke Zero", aliases: ["coke zero", "coca zero"] },
        { id: "d-soda-coke-light", name: "Coke Light", aliases: ["coke light", "coca light"] },
        { id: "d-soda-sprite", name: "Sprite", aliases: ["sprite regular", "sprite"] },
        { id: "d-soda-sprite-zero", name: "Sprite Zero", aliases: ["sprite zero"] },
        { id: "d-soda-ginger-ale", name: "Ginger Ale (350 ml)", aliases: ["ginger ale", "ginger"] },
      ],
    },
    {
      id: "boing",
      label: "Boing",
      unit: "pzas",
      skus: [
        { id: "d-boing-grape", name: "Boing Uva", aliases: ["uva", "grape"] },
        { id: "d-boing-mango", name: "Boing Mango", aliases: ["mango"] },
        { id: "d-boing-strawberry", name: "Boing Fresa", aliases: ["fresa", "strawberry"] },
        { id: "d-boing-guava", name: "Boing Guayaba", aliases: ["guayaba", "guava"] },
      ],
    },
    {
      id: "wine",
      label: "Vino (copas)",
      unit: "copas",
      skus: [
        { id: "b-tinto-v", name: "Tinto", aliases: [] },
        { id: "b-blanco", name: "Blanco", aliases: [] },
        { id: "b-rosado", name: "Rosado", aliases: ["rosé", "rose"] },
      ],
    },
    {
      id: "spirits",
      label: "Spirits (botellas 750 ml)",
      unit: "serv",
      skus: [
        { id: "b-spirit-cognac", name: "Cognac (Martell)", aliases: ["cognac", "martell"], pourOz: 1.5, servingsPerBottle: servPerBot(1.5) },
        { id: "b-spirit-gin-bombay", name: "Gin (Bombay)", aliases: ["bombay", "gin (bombay)"], pourOz: 1.5, servingsPerBottle: servPerBot(1.5) },
        { id: "b-spirit-mezcal", name: "Mezcal (400 Conejos)", aliases: ["mezcal", "conejos"], pourOz: 1.5, servingsPerBottle: servPerBot(1.5) },
        { id: "b-spirit-rum", name: "Ron (Matusalem)", aliases: ["matusalem", "ron"], pourOz: 1.5, servingsPerBottle: servPerBot(1.5) },
      ],
    },
    {
      id: "fine",
      label: "Fine spirits (botellas 750 ml)",
      unit: "serv",
      skus: [
        { id: "b-fine-tequila", name: "Tequila (Don Julio 70)", aliases: ["don julio", "tequila"], pourOz: 1.5, servingsPerBottle: servPerBot(1.5) },
        { id: "b-fine-vodka", name: "Vodka (Haku)", aliases: ["haku", "vodka"], pourOz: 1.5, servingsPerBottle: servPerBot(1.5) },
        { id: "b-fine-whiskey", name: "Whiskey (Woodford)", aliases: ["woodford", "whiskey"], pourOz: 1.5, servingsPerBottle: servPerBot(1.5) },
        { id: "b-fine-gin-monkey", name: "Gin (Monkey 47)", aliases: ["monkey 47", "monkey"], pourOz: 1.5, servingsPerBottle: servPerBot(1.5) },
      ],
    },
    {
      id: "other",
      label: "Otras botellas",
      unit: "pzas",
      skus: [
        { id: "d-agua", name: "Agua mineral", aliases: [] },
        { id: "d-rusa", name: "Rusa mineral", aliases: [] },
        { id: "d-jugo", name: "Jugo verde", aliases: [] },
        { id: "d-xipi-kombucha", name: "XI-PI Kombucha", aliases: ["kombucha", "xi-pi"] },
      ],
    },
  ];

  const PRODUCT_TO_GROUP = {
    "b-cerveza": "beer",
    "d-refresco": "soda",
    "d-boing": "boing",
    "b-spirits": "spirits",
    "b-fine-spirits": "fine",
  };

  function todayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function allSkus() {
    return GROUPS.flatMap((g) => g.skus.map((s) => ({ ...s, group: g.id, unit: g.unit, groupLabel: g.label })));
  }

  function emptyDay(date) {
    const starts = {};
    const openPct = {};
    allSkus().forEach((s) => {
      starts[s.id] = 0;
      openPct[s.id] = 100;
    });
    return { date, starts, openPct, alertsSent: {}, threshold: THRESHOLD, updatedAt: new Date().toISOString() };
  }

  function equivToBottlesAndPct(eq) {
    const e = Math.max(0, Number(eq) || 0);
    if (e <= 0) return { bottles: 0, openPct: 0 };
    const full = Math.floor(e + 1e-6);
    const frac = Math.max(0, e - full);
    if (frac < 0.02) return { bottles: full, openPct: full ? 100 : 0 };
    return { bottles: full + 1, openPct: Math.round(frac * 100) };
  }

  function applyCarried(next, carried, fromOnHand) {
    allSkus().forEach((s) => {
      const v = carried[s.id];
      if (v == null) return;
      if (fromOnHand && s.servingsPerBottle) {
        const conv = equivToBottlesAndPct(v);
        next.starts[s.id] = conv.bottles;
        next.openPct[s.id] = conv.openPct;
      } else {
        next.starts[s.id] = v;
      }
    });
  }

  function startsAreEmpty(starts) {
    if (!starts || typeof starts !== "object") return true;
    return Object.values(starts).every((v) => !(Number(v) > 0));
  }

  function normalizeInv(raw) {
    const date = todayKey();
    if (!raw || typeof raw !== "object") return emptyDay(date);
    let inv = raw;
    if (inv.date !== date) {
      const next = emptyDay(date);
      if (inv.onHand && !startsAreEmpty(inv.onHand)) {
        applyCarried(next, inv.onHand, true);
      } else {
        applyCarried(next, inv.starts || {}, false);
        next.openPct = { ...next.openPct, ...(inv.openPct || {}) };
      }
      next.yesterday = { date: inv.date, starts: inv.starts || {}, openPct: inv.openPct || {} };
      next.threshold = inv.threshold || THRESHOLD;
      inv = next;
    }
    if (!inv.starts) inv.starts = emptyDay(date).starts;
    if (!inv.openPct) inv.openPct = emptyDay(date).openPct;
    if (startsAreEmpty(inv.starts) && inv.yesterday && !startsAreEmpty(inv.yesterday.starts)) {
      inv.starts = { ...emptyDay(date).starts, ...inv.yesterday.starts };
      inv.openPct = { ...emptyDay(date).openPct, ...(inv.yesterday.openPct || {}) };
    }
    if (!inv.alertsSent) inv.alertsSent = {};
    if (!inv.threshold) inv.threshold = THRESHOLD;
    inv.date = date;
    return inv;
  }

  function loadRaw() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return raw && typeof raw === "object" ? raw : null;
    } catch {
      return null;
    }
  }

  function load() {
    return normalizeInv(loadRaw());
  }

  let persistTimer = null;
  let adminCode = "";

  function save(state, opts) {
    const cloud = !opts || opts.cloud !== false;
    state.updatedAt = new Date().toISOString();
    state.date = todayKey();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (cloud) scheduleCloud(state);
  }

  function scheduleCloud(state) {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      pushCloud(state);
    }, 700);
  }

  async function pushCloud(state) {
    try {
      if (window.KitchenStore && KitchenStore.setBarInventory) {
        await KitchenStore.setBarInventory(state, adminCode);
      }
    } catch (_) {}
  }

  function pickBest(local, cloud) {
    if (!cloud) return local;
    if (!local) return cloud;
    const localHas = !startsAreEmpty(local.starts);
    const cloudHas = !startsAreEmpty(cloud.starts);
    let picked;
    if (localHas && !cloudHas) picked = local;
    else if (cloudHas && !localHas) picked = cloud;
    else {
      const lt = Date.parse(local.updatedAt || 0) || 0;
      const ct = Date.parse(cloud.updatedAt || 0) || 0;
      picked = ct > lt ? cloud : local;
    }
    picked.alertsSent = {
      ...(cloud.alertsSent || {}),
      ...(local.alertsSent || {}),
      ...(picked.alertsSent || {}),
    };
    return picked;
  }

  async function hydrate(code) {
    adminCode = code || adminCode || "";
    const local = normalizeInv(loadRaw());
    let cloud = null;
    try {
      if (window.KitchenStore && KitchenStore.getBarInventory) {
        cloud = await KitchenStore.getBarInventory(adminCode);
      }
    } catch (_) {}
    if (cloud && typeof cloud === "object") cloud = normalizeInv(cloud);
    const picked = pickBest(local, cloud);
    save(picked, { cloud: true });
    alertsReady = true;
    return picked;
  }

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function skuFromLine(line) {
    const id = String(line.id || "");
    if (allSkus().some((s) => s.id === id)) return id;
    const groupId = PRODUCT_TO_GROUP[id];
    if (!groupId) return null;
    const group = GROUPS.find((g) => g.id === groupId);
    const hay = norm(`${line.customizations || ""} ${line.name || ""} ${line.notes || ""}`);
    const ranked = group.skus
      .map((s) => {
        const names = [s.name, ...(s.aliases || [])].map(norm).filter(Boolean);
        const hit = names.some((n) => n && hay.includes(n));
        const len = hit ? Math.max(...names.filter((n) => hay.includes(n)).map((n) => n.length)) : 0;
        return { id: s.id, hit, len };
      })
      .filter((x) => x.hit)
      .sort((a, b) => b.len - a.len);
    return ranked[0]?.id || null;
  }

  function isToday(iso) {
    const d = new Date(String(iso || "").includes("T") ? iso : String(iso || "").replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return false;
    return (
      d.getFullYear() === new Date().getFullYear() &&
      d.getMonth() === new Date().getMonth() &&
      d.getDate() === new Date().getDate()
    );
  }

  function soldToday(orders) {
    const sold = {};
    allSkus().forEach((s) => {
      sold[s.id] = 0;
    });
    (orders || []).forEach((o) => {
      if (String(o.status || "open") === "dismissed") return;
      if (!isToday(o.createdAt)) return;
      (o.items || []).forEach((line) => {
        let qty = parseInt(line.qty, 10);
        if (!Number.isFinite(qty) || qty < 1) qty = 1;
        const recipe = RECIPES[String(line.id || "")];
        if (recipe) {
          recipe.forEach((ing) => {
            sold[ing.id] = (sold[ing.id] || 0) + qty * (ing.qty || 1);
          });
          return;
        }
        const sku = skuFromLine(line);
        if (!sku) return;
        sold[sku] = (sold[sku] || 0) + qty;
      });
    });
    return sold;
  }

  function rows(orders, inv) {
    const sold = soldToday(orders);
    const th = Number(inv.threshold) > 0 ? Number(inv.threshold) : THRESHOLD;
    return GROUPS.map((g) => ({
      ...g,
      rows: g.skus.map((s) => {
        const start = Math.max(0, parseFloat(inv.starts[s.id]) || 0);
        let openPct = Number(inv.openPct && inv.openPct[s.id]);
        if (!Number.isFinite(openPct)) openPct = start > 0 ? 100 : 0;
        openPct = Math.max(0, Math.min(100, openPct));
        const used = sold[s.id] || 0;
        const perBot = Number(s.servingsPerBottle) || 0;
        let startServ = start;
        let startEquiv = start;
        let left = Math.max(0, start - used);
        let leftBottles = null;
        let leftFull = null;
        let leftOpenPct = null;
        if (perBot > 0) {
          startEquiv = start <= 0 ? 0 : start - 1 + openPct / 100;
          startServ = startEquiv * perBot;
          left = Math.max(0, startServ - used);
          leftBottles = left / perBot;
          leftFull = Math.floor(leftBottles + 1e-6);
          leftOpenPct = Math.round(Math.max(0, leftBottles - leftFull) * 100);
        }
        const pct = startServ > 0 ? left / startServ : null;
        const tracked = startServ > 0.05;
        const low = tracked && pct <= th;
        const empty = tracked && left < 1;
        return {
          ...s,
          unit: g.unit,
          start,
          openPct,
          used,
          left,
          leftBottles,
          leftFull,
          leftOpenPct,
          startServ,
          pct,
          tracked,
          low,
          empty,
        };
      }),
    }));
  }

  function loadAlertLog() {
    try {
      const raw = JSON.parse(localStorage.getItem(ALERT_LOG_KEY) || "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch {
      return {};
    }
  }

  function pruneAlertLog(log) {
    const today = todayKey();
    const next = {};
    Object.keys(log || {}).forEach((k) => {
      if (String(k).startsWith(today + ":")) next[k] = log[k];
    });
    return next;
  }

  function alertLogKey(id) {
    return `${todayKey()}:${id}`;
  }

  function alreadyAlerted(inv, id) {
    const sent = inv && inv.alertsSent && inv.alertsSent[id];
    if (sent && (isToday(sent) || String(sent).slice(0, 10) === todayKey())) return true;
    const log = loadAlertLog();
    return !!log[alertLogKey(id)];
  }

  function markAlerted(inv, id) {
    if (!inv.alertsSent) inv.alertsSent = {};
    inv.alertsSent[id] = new Date().toISOString();
    const log = pruneAlertLog(loadAlertLog());
    log[alertLogKey(id)] = inv.alertsSent[id];
    try {
      localStorage.setItem(ALERT_LOG_KEY, JSON.stringify(log));
    } catch (_) {}
  }

  let alertsReady = false;

  function fireLowAlerts(list, invIn) {
    if (!alertsReady) return 0;
    const inv = invIn || load();
    if (!inv.alertsSent) inv.alertsSent = {};
    const lows = list.flatMap((g) => g.rows.filter((r) => r.low && r.tracked));
    lows.forEach((r) => {
      if (alreadyAlerted(inv, r.id)) return;
      const pct = Math.round((r.pct || 0) * 100);
      const msg = r.empty
        ? `${r.name}: 0 servicios (agotado). ${r.servingsPerBottle ? r.start + " bot. · " : ""}vendidos ${r.used}.`
        : r.servingsPerBottle
          ? `${r.name}: ${r.left.toFixed(1)} serv (${r.leftBottles.toFixed(2)} bot.) · ${pct}% · inicio ${r.start} bot. 750ml.`
          : `${r.name}: ${r.left} ${r.unit} · ${pct}% restante (inicio ${r.start}, vendidos ${r.used}).`;
      if (window.KitchenStore && KitchenStore.notifyAlert) {
        KitchenStore.notifyAlert("The Kitchen · bar bajo", msg, "warning,beer");
      }
      markAlerted(inv, r.id);
    });
    save(inv);
    return lows.length;
  }

  function oosDelta(list) {
    const add = [];
    const remove = [];
    list.forEach((g) => {
      g.rows.forEach((r) => {
        if (!r.tracked) return;
        if (r.empty) add.push(r.id);
        else remove.push(r.id);
      });
    });
    return { add, remove };
  }

  function snapshotOnHand(list, inv) {
    const cur = inv || load();
    if (!cur.alertsSent) cur.alertsSent = {};
    const onHand = { ...(cur.onHand || {}) };
    list.forEach((g) => {
      g.rows.forEach((r) => {
        onHand[r.id] = r.servingsPerBottle ? r.leftBottles : r.left;
      });
    });
    cur.onHand = onHand;
    save(cur);
  }

  function emitOos(list) {
    const delta = oosDelta(list);
    if (!delta.add.length && !delta.remove.length) return;
    if (typeof window.BarInventory?.onOosChange === "function") {
      window.BarInventory.onOosChange(delta);
    }
  }

  function render(orders) {
    const root = document.getElementById("barInvRoot");
    if (!root) return;
    const inv = load();
    const list = rows(orders, inv);
    const tracked = list.flatMap((g) => g.rows.filter((r) => r.tracked));
    const lowN = tracked.filter((r) => r.low).length;
    const emptyN = tracked.filter((r) => r.empty).length;
    fireLowAlerts(list, inv);
    emitOos(list);
    snapshotOnHand(list, inv);

    const summary = `<div class="bar-inv-summary">
      <span>Hoy <strong>${inv.date}</strong></span>
      <span>Con conteo <strong>${tracked.length}</strong></span>
      <span class="${lowN ? "is-low" : ""}">≤20% <strong>${lowN}</strong></span>
      <span class="${emptyN ? "is-empty" : ""}">Agotados <strong>${emptyN}</strong></span>
    </div>`;

    root.innerHTML =
      summary +
      list
        .map((g) => {
          const body = g.rows
            .map((r) => {
              const pctLabel = r.tracked ? `${Math.round(r.pct * 100)}%` : "—";
              const barW = r.tracked ? Math.round(Math.max(0, Math.min(100, r.pct * 100))) : 0;
              const cls = r.empty ? "is-empty" : r.low ? "is-low" : r.tracked ? "" : "is-off";
              const startLabel = r.servingsPerBottle ? "Botellas 750ml" : "Inicio";
              const leftLabel = r.servingsPerBottle
                ? `${r.left.toFixed(1)} serv · ${r.leftFull} bot + ${r.leftOpenPct}%`
                : `${r.left} ${g.unit}`;
              const extra = r.servingsPerBottle
                ? `<div class="bar-inv-row__note">${r.servingsPerBottle.toFixed(1)} servicios / botella (${r.pourOz} oz)</div>`
                : "";
              const pctInput = r.servingsPerBottle
                ? `<label class="bar-inv-row__start">
                    <span>% botella abierta</span>
                    <input type="number" min="0" max="100" step="1" value="${Math.round(r.openPct)}" data-bar-openpct="${escapeHtml(r.id)}" />
                  </label>`
                : "";
              return `<div class="bar-inv-row ${cls}${r.servingsPerBottle ? " is-bottle" : ""}" data-sku="${escapeHtml(r.id)}">
                <div class="bar-inv-row__name">${escapeHtml(r.name)}${r.empty ? ` <span class="bar-inv-oos">Agotado</span>` : ""}${extra}</div>
                <label class="bar-inv-row__start">
                  <span>${escapeHtml(startLabel)}</span>
                  <input type="number" min="0" step="1" value="${r.start}" data-bar-start="${escapeHtml(r.id)}" />
                </label>
                ${pctInput}
                <div class="bar-inv-row__stat">Vend. <strong>${r.used}</strong></div>
                <div class="bar-inv-row__stat">Quedan <strong>${escapeHtml(leftLabel)}</strong></div>
                <div class="bar-inv-row__bar" title="${pctLabel}">
                  <div class="bar-inv-row__fill" style="width:${barW}%"></div>
                  <span>${pctLabel}</span>
                </div>
              </div>`;
            })
            .join("");
          return `<section class="bar-inv-group">
            <h3>${escapeHtml(g.label)}</h3>
            ${g.note ? `<p class="bar-inv-group__note">${escapeHtml(g.note)}</p>` : ""}
            ${body}
          </section>`;
        })
        .join("");

    root.querySelectorAll("[data-bar-start]").forEach((input) => {
      input.addEventListener("change", () => {
        const id = input.dataset.barStart;
        const cur = load();
        if (!cur.openPct) cur.openPct = {};
        cur.starts[id] = Math.max(0, parseFloat(input.value) || 0);
        if (cur.starts[id] === 0) delete cur.alertsSent[id];
        save(cur);
        render(orders);
      });
    });
    root.querySelectorAll("[data-bar-openpct]").forEach((input) => {
      input.addEventListener("change", () => {
        const id = input.dataset.barOpenpct;
        const cur = load();
        if (!cur.openPct) cur.openPct = {};
        let p = parseFloat(input.value);
        if (!Number.isFinite(p)) p = 100;
        cur.openPct[id] = Math.max(0, Math.min(100, p));
        save(cur);
        render(orders);
      });
    });
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function copyYesterdayStarts() {
    const inv = load();
    const y = inv.yesterday;
    if (!y || !y.starts) return false;
    Object.keys(y.starts).forEach((id) => {
      inv.starts[id] = Math.max(0, parseFloat(y.starts[id]) || 0);
    });
    inv.alertsSent = {};
    save(inv);
    return true;
  }

  function pingLows(orders) {
    const inv = load();
    inv.alertsSent = {};
    try {
      localStorage.removeItem(ALERT_LOG_KEY);
    } catch (_) {}
    save(inv);
    alertsReady = true;
    const fresh = load();
    const list = rows(orders, fresh);
    return fireLowAlerts(list, fresh);
  }

  window.BarInventory = {
    render,
    tick(orders) {
      const inv = load();
      const list = rows(orders, inv);
      fireLowAlerts(list, inv);
      emitOos(list);
      snapshotOnHand(list, inv);
      const root = document.getElementById("barInvRoot");
      if (root && !root.closest(".admin-panel")?.hidden) render(orders);
    },
    copyYesterdayStarts,
    pingLows,
    load,
    hydrate,
  };
})();
