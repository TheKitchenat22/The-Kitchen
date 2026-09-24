/**
 * The Kitchen at 22 — event quotations ("The Experience")
 * Shared by admin form + printable quote.html
 */
(function () {
  "use strict";

  const STORAGE_KEY = "kitchen-quotes";
  const PRINT_KEY = "kitchen-quote-print";
  const MONTHS = {
    es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
    en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  };

  const PHRASES = [
    ["Cumpleaños", "Birthday"],
    ["Graduación", "Graduation"],
    ["Boda", "Wedding"],
    ["Aniversario", "Anniversary"],
    ["Corporativo", "Corporate"],
    ["Otro", "Other"],
    ["Precio fijo", "Flat fee"],
    ["por persona", "per person"],
    ["por servicio", "per service"],
    ["por cartón", "per case"],
    ["por orden", "per order"],
    ["c/u", "each"],
    ["Cierre parcial", "Partial buyout"],
    ["Cierre total", "Full buyout"],
    ["Horario regular", "Regular hours"],
    ["Horario extendido", "Extended hours"],
    ["Mesero incluido", "Server included"],
    ["Mesero del cliente", "Client's server"],
    ["Extras al final", "Extras at the end"],
    ["Decoración / pastel", "Décor / cake"],
    ["Anticipo", "Deposit"],
    ["Cierre parcial: el restaurante sigue atendiendo a residentes (room-service).", "Partial buyout: the restaurant keeps serving residents (room service)."],
    ["Cierre total del restaurante durante el evento.", "Full restaurant buyout for the event."],
    ["Se realiza en horario regular de operación.", "Held during regular operating hours."],
    ["Incluye horario extendido fuera de la operación regular.", "Includes extended hours outside regular operation."],
    ["Incluye 1 mesero durante el evento.", "Includes 1 server during the event."],
    ["El servicio de mesero(s) corre por cuenta del cliente.", "Server(s) are provided by the client."],
    ["Descorche y cualquier extra se liquidan al término del evento.", "Corkage and any extras are settled at the end of the event."],
    ["Decoración y pastel por cuenta del cliente.", "Décor and cake are provided by the client."],
    ["Se requiere anticipo para apartar la fecha.", "A deposit is required to hold the date."],
    ["Descorche por botella", "Corkage per bottle"],
    ["Incluye hielos, agua mineral y/o refresco. $180 por botella. Total al término del evento.", "Includes ice, sparkling water and/or soda. $180 per bottle. Settled at the end of the event."],
    ["Horas extra de espacio", "Extra venue hours"],
    ["Costo a definir al término del evento.", "Cost to be confirmed at the end of the event."],
    ["Renta de espacio en cierre parcial", "Venue rental, partial buyout"],
    ["Renta de espacio en cierre total", "Venue rental, full buyout"],
    ["Renta de espacio", "Venue rental"],
    ["Parcial $3,000", "Partial $3,000"],
    ["Parcial $3,300", "Partial $3,300"],
    ["Monto custom", "Custom amount"],
    ["Sin renta", "No rental"],
    ["1 semana a partir de la fecha de cotización", "1 week from the quote date"],
    ["2 semanas a partir de la fecha de cotización", "2 weeks from the quote date"],
    ["15 días a partir de la fecha de cotización", "15 days from the quote date"],
    ["30 días a partir de la fecha de cotización", "30 days from the quote date"],
    ["Excluye descorche y cualquier consumo no listado en concepto", "Excludes corkage and any items not listed above"],
    ["Hamburguesas de res acompañadas de papas a la francesa", "Beef burgers with french fries"],
    ["servicios de guacamole en porción regular de menú", "guacamole servings, regular menu portion"],
    ["cartones de 24 cervezas marca Corona de 3/4", "cases of 24 Corona beers, 355 ml"],
    ["Servicio de Mesero durante evento", "Server during the event"],
    ["Mini baguettes surtidos carnes frías", "Assorted cold-cut mini baguettes"],
    ["Servicios de guacamole", "Guacamole servings"],
    ["Cartones Coronita", "Coronita cases"],
    ["Órdenes papas trufadas", "Truffle fries orders"],
    ["Órdenes waffles dulces", "Sweet waffle orders"],
    ["Prensas de café (14 tazas aprox.)", "Coffee presses (about 14 cups)"],
    ["órdenes de tacos callejeros (4 tacos por orden)", "street taco orders (4 tacos each)"],
    ["cartones de 24 cervezas marca Corona de 1/4 (210ml)", "cases of 24 Corona beers, 210 ml"],
    ["por confirmar", "to be confirmed"],
    ["Sin conceptos", "No items"],
    ["Concepto", "Item"],
  ];

  function langOf(q) {
    return q && q.lang === "en" ? "en" : "es";
  }

  function pack(lang) {
    const en = lang === "en";
    return {
      events: en
        ? ["Birthday", "Baby Shower", "Graduation", "Wedding", "Anniversary", "Corporate", "Other"]
        : ["Cumpleaños", "Baby Shower", "Graduación", "Boda", "Aniversario", "Corporativo", "Otro"],
      units: en
        ? [
            { id: "fijo", label: "Flat fee" },
            { id: "persona", label: "per person" },
            { id: "servicio", label: "per service" },
            { id: "carton", label: "per case" },
            { id: "orden", label: "per order" },
            { id: "unidad", label: "each" },
          ]
        : [
            { id: "fijo", label: "Precio fijo" },
            { id: "persona", label: "por persona" },
            { id: "servicio", label: "por servicio" },
            { id: "carton", label: "por cartón" },
            { id: "orden", label: "por orden" },
            { id: "unidad", label: "c/u" },
          ],
      notes: en
        ? [
            { id: "parcial-residents", label: "Partial buyout", text: "Partial buyout: the restaurant keeps serving residents (room service)." },
            { id: "cierre-total", label: "Full buyout", text: "Full restaurant buyout for the event." },
            { id: "horario-regular", label: "Regular hours", text: "Held during regular operating hours." },
            { id: "horario-extra", label: "Extended hours", text: "Includes extended hours outside regular operation." },
            { id: "mesero-incluido", label: "Server included", text: "Includes 1 server during the event." },
            { id: "mesero-cliente", label: "Client's server", text: "Server(s) are provided by the client." },
            { id: "cierre-cuenta", label: "Extras at the end", text: "Corkage and any extras are settled at the end of the event." },
            { id: "deco-pastel", label: "Décor / cake", text: "Décor and cake are provided by the client." },
            { id: "anticipo", label: "Deposit", text: "A deposit is required to hold the date." },
          ]
        : [
            { id: "parcial-residents", label: "Cierre parcial", text: "Cierre parcial: el restaurante sigue atendiendo a residentes (room-service)." },
            { id: "cierre-total", label: "Cierre total", text: "Cierre total del restaurante durante el evento." },
            { id: "horario-regular", label: "Horario regular", text: "Se realiza en horario regular de operación." },
            { id: "horario-extra", label: "Horario extendido", text: "Incluye horario extendido fuera de la operación regular." },
            { id: "mesero-incluido", label: "Mesero incluido", text: "Incluye 1 mesero durante el evento." },
            { id: "mesero-cliente", label: "Mesero del cliente", text: "El servicio de mesero(s) corre por cuenta del cliente." },
            { id: "cierre-cuenta", label: "Extras al final", text: "Descorche y cualquier extra se liquidan al término del evento." },
            { id: "deco-pastel", label: "Decoración / pastel", text: "Decoración y pastel por cuenta del cliente." },
            { id: "anticipo", label: "Anticipo", text: "Se requiere anticipo para apartar la fecha." },
          ],
      variables: en
        ? [
            { id: "descorche", name: "Corkage per bottle", detail: "Includes ice, sparkling water and/or soda. $180 per bottle. Settled at the end of the event.", on: true },
            { id: "horas-extra", name: "Extra venue hours", detail: "Cost to be confirmed at the end of the event.", on: false },
          ]
        : [
            { id: "descorche", name: "Descorche por botella", detail: "Incluye hielos, agua mineral y/o refresco. $180 por botella. Total al término del evento.", on: true },
            { id: "horas-extra", name: "Horas extra de espacio", detail: "Costo a definir al término del evento.", on: false },
          ],
      rents: en
        ? [
            { id: "parcial-3000", amount: 3000, name: "Venue rental, partial buyout", label: "Partial $3,000" },
            { id: "parcial-3300", amount: 3300, name: "Venue rental, partial buyout", label: "Partial $3,300" },
            { id: "total", amount: null, name: "Venue rental, full buyout", label: "Full buyout" },
            { id: "custom", amount: null, name: "Venue rental", label: "Custom amount" },
            { id: "none", amount: 0, name: "", label: "No rental" },
          ]
        : [
            { id: "parcial-3000", amount: 3000, name: "Renta de espacio en cierre parcial", label: "Parcial $3,000" },
            { id: "parcial-3300", amount: 3300, name: "Renta de espacio en cierre parcial", label: "Parcial $3,300" },
            { id: "total", amount: null, name: "Renta de espacio en cierre total", label: "Cierre total" },
            { id: "custom", amount: null, name: "Renta de espacio", label: "Monto custom" },
            { id: "none", amount: 0, name: "", label: "Sin renta" },
          ],
      validity: en
        ? [
            ["1 week from the quote date", "1 week"],
            ["2 weeks from the quote date", "2 weeks"],
            ["15 days from the quote date", "15 days"],
            ["30 days from the quote date", "30 days"],
          ]
        : [
            ["1 semana a partir de la fecha de cotización", "1 semana"],
            ["2 semanas a partir de la fecha de cotización", "2 semanas"],
            ["15 días a partir de la fecha de cotización", "15 días"],
            ["30 días a partir de la fecha de cotización", "30 días"],
          ],
      defaultValidity: en ? "1 week from the quote date" : "1 semana a partir de la fecha de cotización",
      defaultExclude: en
        ? "Excludes corkage and any items not listed above"
        : "Excluye descorche y cualquier consumo no listado en concepto",
      rentFallback: en ? "Venue rental" : "Renta de espacio",
      apt: en ? "Apt " : "Depto ",
      guestsWord: en ? "guests" : "personas",
      tbd: en ? "to be confirmed" : "por confirmar",
      noItems: en ? "No items" : "Sin conceptos",
      itemFallback: en ? "Item" : "Concepto",
      timeJoin: en ? " to " : " a ",
      totalWord: en ? "total" : "total",
      sheet: en
        ? {
            quoteNo: "Quote No.",
            date: "Date",
            valid: "Valid",
            general: "Event details",
            event: "Event",
            name: "Name",
            apt: "Apt",
            time: "Time",
            guests: "Guests",
            note: "Note",
            items: "Items",
            vars: "-Variables-",
            cost: "Preliminary cost",
            print: "Print / Save PDF",
            back: "Back to admin",
          }
        : {
            quoteNo: "Cotización No.",
            date: "Fecha",
            valid: "Vigencia",
            general: "Datos generales",
            event: "Evento",
            name: "Nombre",
            apt: "Depto",
            time: "Horario",
            guests: "Invitados",
            note: "Nota",
            items: "Concepto",
            vars: "-Variables-",
            cost: "Costo preliminar",
            print: "Imprimir / Guardar PDF",
            back: "Volver al admin",
          },
    };
  }

  function translateText(text, toLang) {
    const src = String(text || "");
    if (!src.trim()) return src;
    const map = {};
    PHRASES.forEach(([es, en]) => {
      if (!es || !en || es === en) return;
      map[toLang === "en" ? es : en] = toLang === "en" ? en : es;
    });
    if (map[src]) return map[src];
    let out = src;
    Object.keys(map)
      .sort((a, b) => b.length - a.length)
      .forEach((k) => {
        if (out.includes(k)) out = out.split(k).join(map[k]);
      });
    return out;
  }

  function applyLanguage(quote, lang) {
    const q = cloneQuote(quote || emptyQuote());
    const to = lang === "en" ? "en" : "es";
    const p = pack(to);
    q.lang = to;
    q.eventType = translateText(q.eventType, to);
    if (!p.events.includes(q.eventType)) q.eventType = p.events[0];
    q.validity = translateText(q.validity, to) || p.defaultValidity;
    q.excludeText = translateText(q.excludeText, to) || p.defaultExclude;
    q.note = translateText(q.note, to);
    if (q.rent) {
      q.rent.name = translateText(q.rent.name, to);
      if (q.rent.kind && q.rent.kind !== "custom") {
        const hit = p.rents.find((r) => r.id === q.rent.kind);
        if (hit) q.rent.name = hit.name;
      }
    }
    (q.items || []).forEach((it) => {
      it.name = translateText(it.name, to);
    });
    (q.variables || []).forEach((v) => {
      const preset = p.variables.find((x) => x.id === v.id);
      if (preset) {
        v.name = preset.name;
        v.detail = preset.detail;
      } else {
        v.name = translateText(v.name, to);
        v.detail = translateText(v.detail, to);
      }
    });
    return q;
  }

  const EVENT_TYPES = pack("es").events;
  const UNIT_OPTIONS = pack("es").units;
  const NOTE_PRESETS = pack("es").notes;
  const VARIABLE_PRESETS = pack("es").variables;
  const RENT_PRESETS = pack("es").rents;

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

  function formatDateEs(iso, withDeYear, lang) {
    const p = String(iso || "").split("-").map(Number);
    if (p.length !== 3 || !p[0]) return "";
    const [, m, d] = p;
    const months = MONTHS[lang === "en" ? "en" : "es"];
    const month = months[(m || 1) - 1] || "";
    if (lang === "en") return `${month} ${d}, ${p[0]}`;
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
    const name = String(r.name || "").trim() || pack(langOf(quote)).rentFallback;
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
    if (apt) parts.push(pack(langOf(quote)).apt + apt);
    return parts.join(" · ") || "—";
  }

  function unitWord(unit, lang) {
    const found = pack(lang).units.find((u) => u.id === unit);
    return found ? found.label : "";
  }

  function itemTitle(item, lang) {
    const name = String(item.name || "").trim() || pack(lang).itemFallback;
    if (item.unit === "fijo") return name;
    const qty = Number(item.qty);
    if (!Number.isFinite(qty) || qty <= 0) return name;
    const n = Number.isInteger(qty) ? String(qty) : String(qty);
    if (/^\d/.test(name)) return name;
    return `${n} ${name}`;
  }

  function itemPriceNote(item, lang) {
    if (item.unit === "fijo") return "";
    const p = pack(lang);
    const word = unitWord(item.unit, lang);
    const total = itemTotal(item);
    if (!word) return `${money(item.unitPrice)}. ${money(total)} ${p.totalWord}.`;
    return `${money(item.unitPrice)} ${word}. ${money(total)} ${p.totalWord}.`;
  }

  function emptyQuote() {
    const iso = toIsoDate(new Date());
    return {
      id: "q-" + Date.now().toString(36),
      number: quoteNumberFromDate(iso),
      quoteDate: iso,
      lang: "es",
      validity: pack("es").defaultValidity,
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
      excludeText: pack("es").defaultExclude,
      updatedAt: new Date().toISOString(),
    };
  }

  function cloneQuote(src) {
    return JSON.parse(JSON.stringify(src || emptyQuote()));
  }

  function normalizeQuote(raw) {
    const q = cloneQuote(raw || emptyQuote());
    if (q.lang !== "en") q.lang = "es";
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
        q.excludeText = pack(langOf(q)).defaultExclude;
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
    const lang = langOf(q);
    const p = pack(lang);
    const s = p.sheet;
    const horario =
      q.timeFrom || q.timeTo
        ? `${formatTime12(q.timeFrom)}${p.timeJoin}${formatTime12(q.timeTo)}`
        : "—";
    const host = String(q.hostName || q.eventName || "").trim();
    const apt = String(q.apartment || "").trim();
    const items = quoteItemsForPrint(q)
      .map((it) => {
        const note = itemPriceNote(it, lang);
        return `<li class="sheet-item">
          <div class="sheet-item__row">
            <span class="sheet-item__name">${escapeHtml(itemTitle(it, lang))}</span>
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
      ? `<p class="sheet-kicker">${escapeHtml(s.vars)}</p><ul class="sheet-vars">${vars}</ul>`
      : "";
    return `
      <h1 class="sheet-brand">THE EXPERIENCE</h1>
      <p class="sheet-meta">
        ${escapeHtml(s.quoteNo)} ${escapeHtml(q.number || "—")}<br />
        ${escapeHtml(s.date)}: ${escapeHtml(formatDateEs(q.quoteDate, true, lang) || "—")}<br />
        ${escapeHtml(s.valid)}: ${escapeHtml(q.validity || p.defaultValidity)}
      </p>
      <h2 class="sheet-h">${escapeHtml(s.general)}</h2>
      <p class="sheet-block">
        ${escapeHtml(s.event)}: ${escapeHtml(q.eventType || "—")}<br />
        ${escapeHtml(s.name)}: ${escapeHtml(host || "—")}<br />
        ${escapeHtml(s.apt)}: ${escapeHtml(apt || "—")}<br />
        ${escapeHtml(s.date)}: ${escapeHtml(formatDateEs(q.eventDate, false, lang) || p.tbd)}<br />
        ${escapeHtml(s.time)}: ${escapeHtml(horario)}<br />
        ${escapeHtml(s.guests)}: ${escapeHtml(String(q.guests || "—"))} ${escapeHtml(p.guestsWord)}<br />
        ${escapeHtml(s.note)}: ${escapeHtml(q.note || "—")}
      </p>
      <h2 class="sheet-h">${escapeHtml(s.items)}</h2>
      <ul class="sheet-items">${items || `<li class='sheet-item'>${escapeHtml(p.noItems)}</li>`}</ul>
      ${varsBlock}
      <h2 class="sheet-h">${escapeHtml(s.cost)}</h2>
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
    pack,
    langOf,
    applyLanguage,
    translateText,
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
