/**
 * The Kitchen at 22 — event quotations ("The Experience")
 * Shared by admin form + printable quote.html
 */
(function () {
  "use strict";

  const STORAGE_KEY = "kitchen-quotes";
  const PRINT_KEY = "kitchen-quote-print";
  const MONTHS = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];

  const EVENT_TYPES = [
    "Cumpleaños",
    "Baby Shower",
    "Graduación",
    "Boda",
    "Aniversario",
    "Corporativo",
    "Otro",
  ];

  const UNIT_OPTIONS = [
    { id: "fijo", label: "Precio fijo" },
    { id: "persona", label: "por persona" },
    { id: "servicio", label: "por servicio" },
    { id: "carton", label: "por cartón" },
    { id: "orden", label: "por orden" },
    { id: "unidad", label: "c/u" },
  ];

  const NOTE_PRESETS = [
    {
      id: "parcial-residents",
      label: "Cierre parcial",
      text: "Cierre parcial: el restaurante sigue atendiendo a residentes (room-service).",
    },
    {
      id: "cierre-total",
      label: "Cierre total",
      text: "Cierre total del restaurante durante el evento.",
    },
    {
      id: "horario-regular",
      label: "Horario regular",
      text: "Se realiza en horario regular de operación.",
    },
    {
      id: "horario-extra",
      label: "Horario extendido",
      text: "Incluye horario extendido fuera de la operación regular.",
    },
    {
      id: "mesero-incluido",
      label: "Mesero incluido",
      text: "Incluye 1 mesero durante el evento.",
    },
    {
      id: "mesero-cliente",
      label: "Mesero del cliente",
      text: "El servicio de mesero(s) corre por cuenta del cliente.",
    },
    {
      id: "cierre-cuenta",
      label: "Extras al final",
      text: "Descorche y cualquier extra se liquidan al término del evento.",
    },
    {
      id: "deco-pastel",
      label: "Decoración / pastel",
      text: "Decoración y pastel por cuenta del cliente.",
    },
    {
      id: "anticipo",
      label: "Anticipo",
      text: "Se requiere anticipo para apartar la fecha.",
    },
  ];

  const VARIABLE_PRESETS = [
    {
      id: "descorche",
      name: "Descorche por botella",
      detail: "Incluye hielos, agua mineral y/o refresco. $180 por botella. Total al término del evento.",
      on: true,
    },
    {
      id: "horas-extra",
      name: "Horas extra de espacio",
      detail: "Costo a definir al término del evento.",
      on: false,
    },
  ];

  const RENT_PRESETS = [
    {
      id: "parcial-3000",
      amount: 3000,
      name: "Renta de espacio en cierre parcial",
      label: "Parcial $3,000",
    },
    {
      id: "parcial-3300",
      amount: 3300,
      name: "Renta de espacio en cierre parcial",
      label: "Parcial $3,300",
    },
    {
      id: "total",
      amount: null,
      name: "Renta de espacio en cierre total",
      label: "Cierre total",
    },
    {
      id: "custom",
      amount: null,
      name: "Renta de espacio",
      label: "Monto custom",
    },
    {
      id: "none",
      amount: 0,
      name: "",
      label: "Sin renta",
    },
  ];

  function uid() {
    return "l-" + Math.random().toString(36).slice(2, 10);
  }

  function toIsoDate(d) {
    const x = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(x.getTime())) return "";
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const day = String(x.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function quoteNumberFromDate(iso) {
    const p = String(iso || "").split("-");
    if (p.length !== 3) return "";
    return `${p[1]}${p[2]}${p[0]}`;
  }

  function formatDateEs(iso, withDeYear) {
    const p = String(iso || "").split("-").map(Number);
    if (p.length !== 3 || !p[0]) return "";
    const [, m, d] = p;
    const month = MONTHS[(m || 1) - 1] || "";
    if (withDeYear === false) return `${d} de ${month} ${p[0]}`;
    return `${d} de ${month} de ${p[0]}`;
  }

  function formatTime12(hhmm) {
    const s = String(hhmm || "").trim();
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return s;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const suffix = h < 12 ? "am" : "pm";
    h = h % 12;
    if (h === 0) h = 12;
    return min ? `${h}:${String(min).padStart(2, "0")}${suffix}` : `${h}${suffix}`;
  }

  function money(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "$0";
    const rounded = Math.round(v);
    return "$" + rounded.toLocaleString("en-US");
  }

  function itemTotal(item) {
    const qty = Number(item.qty);
    const price = Number(item.unitPrice);
    const q = Number.isFinite(qty) ? qty : 0;
    const p = Number.isFinite(price) ? price : 0;
    if (item.unit === "fijo") return p;
    return q * p;
  }

  function rentLine(quote) {
    const r = quote && quote.rent;
    if (!r || r.kind === "none") return null;
    const amount = Number(r.amount);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const name = String(r.name || "").trim() || "Renta de espacio";
    return { id: "rent", qty: 1, name, unitPrice: amount, unit: "fijo" };
  }

  function quoteItemsForPrint(quote) {
    const rent = rentLine(quote);
    const items = Array.isArray(quote && quote.items) ? quote.items : [];
    return rent ? [rent, ...items] : items;
  }

  function quoteTotal(quote) {
    return quoteItemsForPrint(quote).reduce((sum, it) => sum + itemTotal(it), 0);
  }

  function eventLabel(quote) {
    const parts = [];
    const type = String(quote.eventType || "").trim();
    const host = String(quote.hostName || quote.eventName || "").trim();
    const apt = String(quote.apartment || "").trim();
    if (type) parts.push(type);
    if (host) parts.push(host);
    if (apt) parts.push("Depto " + apt);
    return parts.join(" · ") || "—";
  }

  function unitWord(unit) {
    const found = UNIT_OPTIONS.find((u) => u.id === unit);
    return found ? found.label : "";
  }

  function itemTitle(item) {
    const name = String(item.name || "").trim() || "Concepto";
    if (item.unit === "fijo") return name;
    const qty = Number(item.qty);
    if (!Number.isFinite(qty) || qty <= 0) return name;
    const n = Number.isInteger(qty) ? String(qty) : String(qty);
    if (/^\d/.test(name)) return name;
    return `${n} ${name}`;
  }

  function itemPriceNote(item) {
    if (item.unit === "fijo") return "";
    const word = unitWord(item.unit);
    const total = itemTotal(item);
    if (!word) return `${money(item.unitPrice)}. ${money(total)} total.`;
    if (item.unit === "unidad") return `${money(item.unitPrice)} c/u. ${money(total)} total.`;
    return `${money(item.unitPrice)} ${word}. ${money(total)} total.`;
  }

  function emptyQuote() {
    const iso = toIsoDate(new Date());
    return {
      id: "q-" + Date.now().toString(36),
      number: quoteNumberFromDate(iso),
      quoteDate: iso,
      validity: "1 semana a partir de la fecha de cotización",
      eventType: "Cumpleaños",
      hostName: "",
      apartment: "",
      eventDate: "",
      timeFrom: "19:00",
      timeTo: "01:00",
      guests: 30,
      note: "",
      rent: {
        kind: "parcial-3300",
        name: "Renta de espacio en cierre parcial",
        amount: 3300,
      },
      items: [],
      variables: VARIABLE_PRESETS.map((v) => ({ ...v })),
      excludeText: "Excluye descorche y cualquier consumo no listado en concepto",
      updatedAt: new Date().toISOString(),
    };
  }

  function cloneQuote(src) {
    return JSON.parse(JSON.stringify(src || emptyQuote()));
  }

  function normalizeQuote(raw) {
    const q = cloneQuote(raw || emptyQuote());
    if (!q.hostName) q.hostName = q.eventName || "";
    if (q.apartment == null) q.apartment = "";
    if (!q.rent) {
      const idx = (q.items || []).findIndex((i) => /renta de espacio/i.test(String(i.name || "")));
      if (idx >= 0) {
        const it = q.items.splice(idx, 1)[0];
        q.rent = {
          kind: "custom",
          name: it.name,
          amount: Number(it.unitPrice) || 0,
        };
      } else {
        q.rent = { kind: "parcial-3300", name: "Renta de espacio en cierre parcial", amount: 3300 };
      }
    }
    if (Array.isArray(q.variables)) {
      q.variables = q.variables.filter(
        (v) =>
          !/^extras/i.test(String(v.id || "")) &&
          !/alimento/i.test(String(v.name || "")) &&
          !/carajillo/i.test(String(v.id || "")) &&
          !/carajillo/i.test(String(v.name || ""))
      );
      if (/carajillo/i.test(String(q.excludeText || ""))) {
        q.excludeText = "Excluye descorche y cualquier consumo no listado en concepto";
      }
    }
    return q;
  }

  const TEMPLATES = {
    cumpleanos: () => {
      const q = emptyQuote();
      q.eventType = "Cumpleaños";
      q.guests = 30;
      q.timeFrom = "19:00";
      q.timeTo = "01:00";
      q.rent = {
        kind: "parcial-3000",
        name: "Renta de espacio en cierre parcial",
        amount: 3000,
      };
      q.items = [
        {
          id: uid(),
          qty: 30,
          name: "Hamburguesas de res acompañadas de papas a la francesa",
          unitPrice: 185,
          unit: "persona",
        },
        {
          id: uid(),
          qty: 8,
          name: "servicios de guacamole en porción regular de menú",
          unitPrice: 120,
          unit: "servicio",
        },
        {
          id: uid(),
          qty: 2,
          name: "cartones de 24 cervezas marca Corona de 3/4",
          unitPrice: 700,
          unit: "carton",
        },
      ];
      q.variables = VARIABLE_PRESETS.map((v) => ({
        ...v,
        on: v.id === "descorche",
      }));
      return q;
    },
    babyshower: () => {
      const q = emptyQuote();
      q.eventType = "Baby Shower";
      q.guests = 35;
      q.timeFrom = "16:00";
      q.timeTo = "21:00";
      q.rent = {
        kind: "parcial-3300",
        name: "Renta de espacio en cierre parcial",
        amount: 3300,
      };
      q.items = [
        { id: uid(), qty: 1, name: "Servicio de Mesero durante evento", unitPrice: 700, unit: "fijo" },
        { id: uid(), qty: 50, name: "Mini baguettes surtidos carnes frías", unitPrice: 40, unit: "unidad" },
        { id: uid(), qty: 6, name: "Servicios de guacamole", unitPrice: 120, unit: "servicio" },
        { id: uid(), qty: 2, name: "Cartones Coronita", unitPrice: 700, unit: "carton" },
        { id: uid(), qty: 3, name: "Órdenes papas trufadas", unitPrice: 95, unit: "orden" },
        { id: uid(), qty: 10, name: "Órdenes waffles dulces", unitPrice: 110, unit: "orden" },
        { id: uid(), qty: 2, name: "Prensas de café (14 tazas aprox.)", unitPrice: 410, unit: "unidad" },
      ];
      q.variables = VARIABLE_PRESETS.map((v) => ({
        ...v,
        on: v.id === "descorche",
      }));
      return q;
    },
    graduacion: () => {
      const q = emptyQuote();
      q.eventType = "Graduación";
      q.guests = 40;
      q.timeFrom = "18:00";
      q.timeTo = "23:00";
      q.rent = {
        kind: "parcial-3300",
        name: "Renta de espacio en cierre parcial",
        amount: 3300,
      };
      q.items = [
        {
          id: uid(),
          qty: 40,
          name: "órdenes de tacos callejeros (4 tacos por orden)",
          unitPrice: 130,
          unit: "orden",
        },
        {
          id: uid(),
          qty: 2,
          name: "cartones de 24 cervezas marca Corona de 1/4 (210ml)",
          unitPrice: 700,
          unit: "carton",
        },
        { id: uid(), qty: 1, name: "Servicio de Mesero durante evento", unitPrice: 700, unit: "fijo" },
      ];
      q.variables = VARIABLE_PRESETS.map((v) => ({
        ...v,
        on: v.id === "descorche",
      }));
      return q;
    },
  };

  function loadAll() {
    try {
      const arr = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveAll(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify((list || []).slice(0, 40)));
  }

  function upsert(quote) {
    const q = cloneQuote(quote);
    q.updatedAt = new Date().toISOString();
    const list = loadAll().filter((x) => x.id !== q.id);
    list.unshift(q);
    saveAll(list);
    return q;
  }

  function remove(id) {
    saveAll(loadAll().filter((x) => x.id !== id));
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderPrintHtml(quote) {
    const q = quote || emptyQuote();
    const horario =
      q.timeFrom || q.timeTo
        ? `${formatTime12(q.timeFrom)} a ${formatTime12(q.timeTo)}`
        : "—";
    const host = String(q.hostName || q.eventName || "").trim();
    const apt = String(q.apartment || "").trim();
    const items = quoteItemsForPrint(q)
      .map((it) => {
        const note = itemPriceNote(it);
        return `<li class="sheet-item">
          <div class="sheet-item__row">
            <span class="sheet-item__name">${escapeHtml(itemTitle(it))}</span>
            <span class="sheet-item__amt">${escapeHtml(money(itemTotal(it)))}</span>
          </div>
          ${note ? `<div class="sheet-item__note">${escapeHtml(note)}</div>` : ""}
        </li>`;
      })
      .join("");
    const vars = (q.variables || [])
      .filter((v) => v.on)
      .map((v) => {
        const detail = String(v.detail || "").trim();
        return `<li class="sheet-var">
          <div>${escapeHtml(v.name || "")}</div>
          ${detail ? `<div class="sheet-var__detail">${escapeHtml(detail)}</div>` : ""}
        </li>`;
      })
      .join("");
    const varsBlock = vars
      ? `<p class="sheet-kicker">-Variables-</p><ul class="sheet-vars">${vars}</ul>`
      : "";
    return `
      <h1 class="sheet-brand">THE EXPERIENCE</h1>
      <p class="sheet-meta">
        Cotización No. ${escapeHtml(q.number || "—")}<br />
        Fecha: ${escapeHtml(formatDateEs(q.quoteDate, true) || "—")}<br />
        Vigencia: ${escapeHtml(q.validity || "1 semana a partir de la fecha de cotización")}
      </p>
      <h2 class="sheet-h">Datos generales</h2>
      <p class="sheet-block">
        Evento: ${escapeHtml(q.eventType || "—")}<br />
        Nombre: ${escapeHtml(host || "—")}<br />
        Depto: ${escapeHtml(apt || "—")}<br />
        Fecha: ${escapeHtml(formatDateEs(q.eventDate, false) || "por confirmar")}<br />
        Horario: ${escapeHtml(horario)}<br />
        Invitados: ${escapeHtml(String(q.guests || "—"))} personas<br />
        Nota: ${escapeHtml(q.note || "—")}
      </p>
      <h2 class="sheet-h">Concepto</h2>
      <ul class="sheet-items">${items || "<li class='sheet-item'>Sin conceptos</li>"}</ul>
      ${varsBlock}
      <h2 class="sheet-h">Costo preliminar</h2>
      <p class="sheet-block">${escapeHtml(q.excludeText || "")}:</p>
      <p class="sheet-total">${escapeHtml(money(quoteTotal(q)))}</p>
      <div class="sheet-foot">
        <p class="sheet-wordmark">THE KITCHEN <span>AT 22</span></p>
      </div>
    `;
  }

  window.KitchenQuote = {
    STORAGE_KEY,
    PRINT_KEY,
    EVENT_TYPES,
    UNIT_OPTIONS,
    NOTE_PRESETS,
    VARIABLE_PRESETS,
    RENT_PRESETS,
    TEMPLATES,
    uid,
    toIsoDate,
    quoteNumberFromDate,
    formatDateEs,
    formatTime12,
    money,
    itemTotal,
    rentLine,
    quoteItemsForPrint,
    quoteTotal,
    eventLabel,
    itemTitle,
    itemPriceNote,
    emptyQuote,
    cloneQuote,
    normalizeQuote,
    loadAll,
    upsert,
    remove,
    escapeHtml,
    renderPrintHtml,
  };
})();
