/**
 * Bar inventory — bottled / canned drinks only (no prep food).
 * Morning count + tickets sold today → remaining % and 20% alerts.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "kitchen-bar-inventory";
  const THRESHOLD = 0.2;

  const GROUPS = [
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
        { id: "d-soda-sprite-zero", name: "Sprite Zero", aliases: ["sprite zero", "sprite"] },
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
      label: "Spirits (servicios)",
      unit: "serv",
      skus: [
        { id: "b-spirit-cognac", name: "Cognac (Martell)", aliases: ["cognac", "martell"] },
        { id: "b-spirit-gin-bombay", name: "Gin (Bombay)", aliases: ["bombay", "gin (bombay)"] },
        { id: "b-spirit-mezcal", name: "Mezcal (400 Conejos)", aliases: ["mezcal", "conejos"] },
        { id: "b-spirit-rum", name: "Ron (Matusalem)", aliases: ["matusalem", "ron"] },
      ],
    },
    {
      id: "fine",
      label: "Fine spirits (servicios)",
      unit: "serv",
      skus: [
        { id: "b-fine-tequila", name: "Tequila (Don Julio 70)", aliases: ["don julio", "tequila"] },
        { id: "b-fine-vodka", name: "Vodka (Haku)", aliases: ["haku", "vodka"] },
        { id: "b-fine-whiskey", name: "Whiskey (Woodford)", aliases: ["woodford", "whiskey"] },
        { id: "b-fine-gin-monkey", name: "Gin (Monkey 47)", aliases: ["monkey 47", "monkey"] },
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
    allSkus().forEach((s) => {
      starts[s.id] = 0;
    });
    return { date, starts, alertsSent: {}, threshold: THRESHOLD };
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!raw || typeof raw !== "object") return emptyDay(todayKey());
      const date = todayKey();
      if (raw.date !== date) {
        const next = emptyDay(date);
        if (raw.starts && raw.date) {
          next.yesterday = { date: raw.date, starts: raw.starts, leftover: raw.leftover || null };
        }
        return next;
      }
      if (!raw.starts) raw.starts = emptyDay(date).starts;
      if (!raw.alertsSent) raw.alertsSent = {};
      if (!raw.threshold) raw.threshold = THRESHOLD;
      return raw;
    } catch {
      return emptyDay(todayKey());
    }
  }

  function save(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
        const sku = skuFromLine(line);
        if (!sku) return;
        let qty = parseInt(line.qty, 10);
        if (!Number.isFinite(qty) || qty < 1) qty = 1;
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
        const start = Math.max(0, parseInt(inv.starts[s.id], 10) || 0);
        const used = sold[s.id] || 0;
        const left = Math.max(0, start - used);
        const pct = start > 0 ? left / start : null;
        const tracked = start > 0;
        const low = tracked && pct <= th;
        const empty = tracked && left <= 0;
        return {
          ...s,
          unit: g.unit,
          start,
          used,
          left,
          pct,
          tracked,
          low,
          empty,
        };
      }),
    }));
  }

  function fireLowAlerts(list) {
    const inv = load();
    const lows = list.flatMap((g) => g.rows.filter((r) => r.low && r.tracked));
    lows.forEach((r) => {
      if (inv.alertsSent[r.id]) return;
      const pct = Math.round((r.pct || 0) * 100);
      const msg = r.empty
        ? `${r.name}: 0 ${r.unit} (agotado). Inicio ${r.start}, vendidos ${r.used}.`
        : `${r.name}: ${r.left} ${r.unit} · ${pct}% restante (inicio ${r.start}, vendidos ${r.used}).`;
      if (window.KitchenStore && KitchenStore.notifyAlert) {
        KitchenStore.notifyAlert("The Kitchen · bar bajo", msg, "warning,beer");
      }
      inv.alertsSent[r.id] = new Date().toISOString();
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
    fireLowAlerts(list);
    emitOos(list);

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
              return `<div class="bar-inv-row ${cls}" data-sku="${escapeHtml(r.id)}">
                <div class="bar-inv-row__name">${escapeHtml(r.name)}${r.empty ? ` <span class="bar-inv-oos">Agotado</span>` : ""}</div>
                <label class="bar-inv-row__start">
                  <span>Inicio</span>
                  <input type="number" min="0" step="1" value="${r.start}" data-bar-start="${escapeHtml(r.id)}" />
                </label>
                <div class="bar-inv-row__stat">Vend. <strong>${r.used}</strong></div>
                <div class="bar-inv-row__stat">Quedan <strong>${r.left}</strong> ${escapeHtml(g.unit)}</div>
                <div class="bar-inv-row__bar" title="${pctLabel}">
                  <div class="bar-inv-row__fill" style="width:${barW}%"></div>
                  <span>${pctLabel}</span>
                </div>
              </div>`;
            })
            .join("");
          return `<section class="bar-inv-group">
            <h3>${escapeHtml(g.label)}</h3>
            ${body}
          </section>`;
        })
        .join("");

    root.querySelectorAll("[data-bar-start]").forEach((input) => {
      input.addEventListener("change", () => {
        const id = input.dataset.barStart;
        const cur = load();
        cur.starts[id] = Math.max(0, parseInt(input.value, 10) || 0);
        if (cur.starts[id] === 0) delete cur.alertsSent[id];
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
      inv.starts[id] = Math.max(0, parseInt(y.starts[id], 10) || 0);
    });
    inv.alertsSent = {};
    save(inv);
    return true;
  }

  function pingLows(orders) {
    const inv = load();
    inv.alertsSent = {};
    save(inv);
    const list = rows(orders, load());
    return fireLowAlerts(list);
  }

  window.BarInventory = {
    render,
    tick(orders) {
      const inv = load();
      const list = rows(orders, inv);
      fireLowAlerts(list);
      emitOos(list);
      const root = document.getElementById("barInvRoot");
      if (root && !root.closest(".admin-panel")?.hidden) render(orders);
    },
    copyYesterdayStarts,
    pingLows,
    load,
  };
})();
