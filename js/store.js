/**
 * Shared persistence for The Kitchen at 22
 *
 * Priority:
 *  1) Local/python API (server.py) when available
 *  2) JSONBin cloud (GitHub Pages / any static host)
 *  3) localStorage only (this browser — not shared)
 */
(function () {
  "use strict";

  const cfg = window.KITCHEN_CONFIG || {};
  const jsonbin = cfg.jsonbin || {};
  const API_BASE = (cfg.apiBase || "").replace(/\/$/, "");

  let mode = "none"; // "local" | "jsonbin" | "none"
  let cloudCache = null;
  let cloudEtag = null;

  function apiUrl(path) {
    return `${API_BASE}${path}`;
  }

  function hasJsonbin() {
    return !!(jsonbin.binId && jsonbin.masterKey);
  }

  async function probeLocal() {
    try {
      const res = await fetch(apiUrl("/api/hours"), { cache: "no-store" });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function jsonbinGet() {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${jsonbin.binId}/latest`, {
      method: "GET",
      headers: {
        "X-Master-Key": jsonbin.masterKey,
        "X-Bin-Meta": "false",
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error("jsonbin_get_" + res.status);
    cloudEtag = res.headers.get("ETag") || res.headers.get("X-Etag") || cloudEtag;
    const data = await res.json();
    // v3 with X-Bin-Meta false returns the record directly; with meta it's { record }
    cloudCache = data && data.record ? data.record : data;
    return cloudCache;
  }

  async function jsonbinPut(state) {
    const headers = {
      "Content-Type": "application/json",
      "X-Master-Key": jsonbin.masterKey,
    };
    if (cloudEtag) headers["If-Match"] = cloudEtag;
    const res = await fetch(`https://api.jsonbin.io/v3/b/${jsonbin.binId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(state),
    });
    if (!res.ok) {
      // retry once without etag if conflict
      if (res.status === 409 || res.status === 412) {
        const res2 = await fetch(`https://api.jsonbin.io/v3/b/${jsonbin.binId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Master-Key": jsonbin.masterKey,
          },
          body: JSON.stringify(state),
        });
        if (!res2.ok) throw new Error("jsonbin_put_" + res2.status);
        cloudEtag = res2.headers.get("ETag") || cloudEtag;
        cloudCache = state;
        return state;
      }
      throw new Error("jsonbin_put_" + res.status);
    }
    cloudEtag = res.headers.get("ETag") || cloudEtag;
    cloudCache = state;
    return state;
  }

  async function ensureCloud() {
    if (cloudCache) return cloudCache;
    return jsonbinGet();
  }

  async function patchCloud(mutator) {
    const current = await ensureCloud();
    const next = mutator(JSON.parse(JSON.stringify(current || {})));
    // defaults
    if (!next.stock) next.stock = { outOfStock: [] };
    if (!next.hours) next.hours = {};
    if (!next.menu) next.menu = {};
    if (!next.announcement) {
      next.announcement = {
        enabled: false,
        messageEs: "",
        messageEn: "",
        updatedAt: null,
      };
    }
    if (!Array.isArray(next.orders)) next.orders = [];
    if (!Array.isArray(next.analytics)) next.analytics = [];
    await jsonbinPut(next);
    return next;
  }

  const MAX_ORDERS = 800;
  const MAX_ANALYTICS = 2500;

  function normalizeAnnouncement(raw) {
    const a = raw && typeof raw === "object" ? raw : {};
    return {
      enabled: !!a.enabled,
      messageEs: String(a.messageEs || "").slice(0, 2000),
      messageEn: String(a.messageEn || "").slice(0, 2000),
      updatedAt: a.updatedAt || null,
    };
  }

  function sanitizeOrderItem(raw) {
    if (!raw || typeof raw !== "object") return null;
    const name = String(raw.name || "").trim().slice(0, 200);
    if (!name) return null;
    let qty = parseInt(raw.qty, 10);
    if (!Number.isFinite(qty)) qty = 1;
    qty = Math.max(1, Math.min(99, qty));
    return {
      id: String(raw.id || "").slice(0, 80),
      name,
      qty,
      customizations: String(raw.customizations || "").slice(0, 500),
      notes: String(raw.notes || "").slice(0, 500),
      dineInOnly: !!raw.dineInOnly,
      sectionId: String(raw.sectionId || raw.section || "").slice(0, 40),
      subKey: String(raw.subKey || "").slice(0, 40),
    };
  }

  function makeOrderId() {
    return (
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 8)
    ).slice(0, 16);
  }

  const Store = {
    get mode() {
      return mode;
    },
    isShared() {
      return mode === "local" || mode === "jsonbin";
    },
    label() {
      if (mode === "local") return "local-server";
      if (mode === "jsonbin") return "cloud-jsonbin";
      return "this-device-only";
    },

    async init() {
      if (await probeLocal()) {
        mode = "local";
        return mode;
      }
      if (hasJsonbin()) {
        try {
          await jsonbinGet();
          mode = "jsonbin";
          return mode;
        } catch (e) {
          console.warn("JSONBin init failed", e);
          mode = "none";
          return mode;
        }
      }
      mode = "none";
      return mode;
    },

    async getStock() {
      if (mode === "local") {
        const res = await fetch(apiUrl("/api/stock"), { cache: "no-store" });
        if (!res.ok) throw new Error("stock");
        return res.json();
      }
      if (mode === "jsonbin") {
        const s = await ensureCloud();
        return s.stock || { outOfStock: [] };
      }
      // localStorage fallback
      try {
        const arr = JSON.parse(localStorage.getItem("kitchen-out-of-stock") || "[]");
        return { outOfStock: Array.isArray(arr) ? arr : [] };
      } catch {
        return { outOfStock: [] };
      }
    },

    async setStock(outOfStock, adminCode) {
      if (mode === "local") {
        const res = await fetch(apiUrl("/api/stock"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outOfStock, code: adminCode }),
        });
        if (!res.ok) throw new Error("stock_save");
        return res.json();
      }
      if (mode === "jsonbin") {
        const next = await patchCloud((s) => {
          s.stock = { outOfStock: [...outOfStock] };
          return s;
        });
        return next.stock;
      }
      localStorage.setItem("kitchen-out-of-stock", JSON.stringify(outOfStock));
      return { outOfStock, _localOnly: true };
    },

    async getHours() {
      if (mode === "local") {
        const res = await fetch(apiUrl("/api/hours"), { cache: "no-store" });
        if (!res.ok) throw new Error("hours");
        return res.json();
      }
      if (mode === "jsonbin") {
        const s = await ensureCloud();
        return s.hours || {};
      }
      try {
        return JSON.parse(localStorage.getItem("kitchen-hours") || "null") || {};
      } catch {
        return {};
      }
    },

    async setHours(hours, adminCode) {
      if (mode === "local") {
        const res = await fetch(apiUrl("/api/hours"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...hours, code: adminCode }),
        });
        if (!res.ok) throw new Error("hours_save");
        return res.json();
      }
      if (mode === "jsonbin") {
        const next = await patchCloud((s) => {
          s.hours = { ...hours };
          return s;
        });
        return next.hours;
      }
      localStorage.setItem("kitchen-hours", JSON.stringify(hours));
      return { ...hours, _localOnly: true };
    },

    async getMenu() {
      if (mode === "local") {
        const res = await fetch(apiUrl("/api/menu"), { cache: "no-store" });
        if (!res.ok) throw new Error("menu");
        const data = await res.json();
        return data.menu;
      }
      if (mode === "jsonbin") {
        const s = await ensureCloud();
        return s.menu || null;
      }
      return null;
    },

    async menuItem(payload, adminCode) {
      if (mode === "local") {
        const res = await fetch(apiUrl("/api/menu/item"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, code: adminCode }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "menu_item");
        return data;
      }
      if (mode === "jsonbin") {
        const next = await patchCloud((s) => {
          if (!s.menu) throw new Error("no_menu");
          applyMenuMutation(s.menu, payload);
          return s;
        });
        return { ok: true, menu: next.menu };
      }
      throw new Error("need_shared_store");
    },

    async menuImage(payload, adminCode) {
      // compress is done by caller; payload.data is data URL
      if (mode === "local") {
        const res = await fetch(apiUrl("/api/menu/image"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, code: adminCode }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "menu_image");
        return data;
      }
      if (mode === "jsonbin") {
        // Store data URL directly on the item (works on static hosts)
        const next = await patchCloud((s) => {
          if (!s.menu) throw new Error("no_menu");
          const found = findItem(s.menu, payload.itemId);
          if (!found) throw new Error("not_found");
          const { sec, sub, idx, item } = found;
          item.img = payload.data; // data URL
          s.menu[sec].subcategories[sub].items[idx] = item;
          return s;
        });
        const found = findItem(next.menu, payload.itemId);
        return { ok: true, img: found.item.img, item: found.item, menu: next.menu };
      }
      throw new Error("need_shared_store");
    },

    /** Force refresh cloud cache (for polling) */
    async refresh() {
      if (mode === "jsonbin") {
        cloudCache = null;
        return jsonbinGet();
      }
      return null;
    },

    async getAnnouncement() {
      if (mode === "local") {
        const res = await fetch(apiUrl("/api/announcement"), { cache: "no-store" });
        if (!res.ok) throw new Error("announcement");
        return normalizeAnnouncement(await res.json());
      }
      if (mode === "jsonbin") {
        const s = await ensureCloud();
        return normalizeAnnouncement(s.announcement);
      }
      try {
        return normalizeAnnouncement(
          JSON.parse(localStorage.getItem("kitchen-announcement") || "null")
        );
      } catch {
        return normalizeAnnouncement(null);
      }
    },

    async setAnnouncement(announcement, adminCode) {
      const payload = normalizeAnnouncement(announcement);
      payload.updatedAt = new Date().toISOString();
      if (mode === "local") {
        const res = await fetch(apiUrl("/api/announcement"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, code: adminCode }),
        });
        if (!res.ok) throw new Error("announcement_save");
        return normalizeAnnouncement(await res.json());
      }
      if (mode === "jsonbin") {
        const next = await patchCloud((s) => {
          s.announcement = payload;
          return s;
        });
        return normalizeAnnouncement(next.announcement);
      }
      localStorage.setItem("kitchen-announcement", JSON.stringify(payload));
      return { ...payload, _localOnly: true };
    },

    /**
     * Register order when customer opens WhatsApp (no prices).
     * Public — does not require admin code.
     */
    async createOrder(orderPayload) {
      const orderType = String(orderPayload.orderType || "");
      if (!["dinein", "apartment", "amenity"].includes(orderType)) {
        throw new Error("bad_order_type");
      }
      const items = (orderPayload.items || [])
        .map(sanitizeOrderItem)
        .filter(Boolean)
        .slice(0, 40);
      if (!items.length) throw new Error("items_required");

      const body = {
        action: "create",
        orderType,
        apartment: String(orderPayload.apartment || "").slice(0, 40),
        amenity: String(orderPayload.amenity || "").slice(0, 80),
        items,
        source: "whatsapp",
      };

      if (mode === "local") {
        const res = await fetch(apiUrl("/api/orders"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "order_create");
        return data.order;
      }

      if (mode === "jsonbin") {
        const order = {
          id: makeOrderId(),
          createdAt: new Date().toISOString(),
          status: "open",
          orderType,
          apartment: orderType === "apartment" ? body.apartment : "",
          amenity: orderType === "amenity" ? body.amenity : "",
          items,
          source: "whatsapp",
        };
        const next = await patchCloud((s) => {
          const list = Array.isArray(s.orders) ? s.orders : [];
          list.unshift(order);
          s.orders = list.slice(0, MAX_ORDERS);
          return s;
        });
        return order;
      }

      // device-only fallback
      const order = {
        id: makeOrderId(),
        createdAt: new Date().toISOString(),
        status: "open",
        orderType,
        apartment: orderType === "apartment" ? body.apartment : "",
        amenity: orderType === "amenity" ? body.amenity : "",
        items,
        source: "whatsapp",
      };
      try {
        const list = JSON.parse(localStorage.getItem("kitchen-orders") || "[]");
        const arr = Array.isArray(list) ? list : [];
        arr.unshift(order);
        localStorage.setItem("kitchen-orders", JSON.stringify(arr.slice(0, MAX_ORDERS)));
      } catch (_) {}
      return order;
    },

    async getOrders(adminCode) {
      if (mode === "local") {
        const res = await fetch(
          apiUrl(`/api/orders?code=${encodeURIComponent(adminCode || "")}`),
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error("orders");
        const data = await res.json();
        return Array.isArray(data.orders) ? data.orders : [];
      }
      if (mode === "jsonbin") {
        cloudCache = null;
        const s = await jsonbinGet();
        return Array.isArray(s.orders) ? s.orders : [];
      }
      try {
        const list = JSON.parse(localStorage.getItem("kitchen-orders") || "[]");
        return Array.isArray(list) ? list : [];
      } catch {
        return [];
      }
    },

    async setOrderStatus(orderId, status, adminCode) {
      const st = String(status || "").toLowerCase();
      if (!["open", "completed", "dismissed"].includes(st)) {
        throw new Error("bad_status");
      }
      if (mode === "local") {
        const res = await fetch(apiUrl("/api/orders"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            orderId,
            status: st,
            code: adminCode,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "order_update");
        return data.order;
      }
      if (mode === "jsonbin") {
        let updated = null;
        await patchCloud((s) => {
          const list = Array.isArray(s.orders) ? s.orders : [];
          list.forEach((o) => {
            if (String(o.id) === String(orderId)) {
              o.status = st;
              o.updatedAt = new Date().toISOString();
              updated = o;
            }
          });
          s.orders = list;
          return s;
        });
        if (!updated) throw new Error("not_found");
        return updated;
      }
      try {
        const list = JSON.parse(localStorage.getItem("kitchen-orders") || "[]");
        const arr = Array.isArray(list) ? list : [];
        let updated = null;
        arr.forEach((o) => {
          if (String(o.id) === String(orderId)) {
            o.status = st;
            o.updatedAt = new Date().toISOString();
            updated = o;
          }
        });
        localStorage.setItem("kitchen-orders", JSON.stringify(arr));
        if (!updated) throw new Error("not_found");
        return updated;
      } catch (e) {
        throw e;
      }
    },

    async trackAnalytics(events) {
      const list = (Array.isArray(events) ? events : [events])
        .filter(Boolean)
        .slice(0, 40)
        .map((e) => ({
          type: String(e.type || "pageview").slice(0, 20),
          path: String(e.path || "/").slice(0, 120),
          label: String(e.label || "").slice(0, 180),
          visitor: String(e.visitor || "").slice(0, 40),
          ip: String(e.ip || "").slice(0, 80),
          ref: String(e.ref || "").slice(0, 180),
          lang: String(e.lang || "").slice(0, 12),
          ua: String(e.ua || "").slice(0, 180),
          t: e.t || new Date().toISOString(),
        }));
      if (!list.length) return { ok: true, added: 0 };

      if (mode === "local") {
        const res = await fetch(apiUrl("/api/analytics"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "track", events: list }),
        });
        if (!res.ok) throw new Error("analytics_track");
        return res.json();
      }
      if (mode === "jsonbin") {
        await patchCloud((s) => {
          const cur = Array.isArray(s.analytics) ? s.analytics : [];
          list.forEach((ev) => {
            cur.push({
              id: makeOrderId().slice(0, 10),
              ...ev,
            });
          });
          s.analytics = cur.slice(-MAX_ANALYTICS);
          return s;
        });
        return { ok: true, added: list.length };
      }
      try {
        const cur = JSON.parse(localStorage.getItem("kitchen-analytics") || "[]");
        const arr = Array.isArray(cur) ? cur : [];
        list.forEach((ev) => arr.push({ id: makeOrderId().slice(0, 10), ...ev }));
        localStorage.setItem("kitchen-analytics", JSON.stringify(arr.slice(-MAX_ANALYTICS)));
      } catch (_) {}
      return { ok: true, added: list.length };
    },

    async getAnalytics(adminCode) {
      if (mode === "local") {
        const res = await fetch(
          apiUrl(`/api/analytics?code=${encodeURIComponent(adminCode || "")}`),
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error("analytics");
        const data = await res.json();
        return Array.isArray(data.events) ? data.events : [];
      }
      if (mode === "jsonbin") {
        cloudCache = null;
        const s = await jsonbinGet();
        return Array.isArray(s.analytics) ? s.analytics : [];
      }
      try {
        const cur = JSON.parse(localStorage.getItem("kitchen-analytics") || "[]");
        return Array.isArray(cur) ? cur : [];
      } catch {
        return [];
      }
    },

    async clearAnalytics(adminCode) {
      if (mode === "local") {
        const res = await fetch(apiUrl("/api/analytics"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "purge", code: adminCode }),
        });
        if (!res.ok) throw new Error("analytics_clear");
        return res.json();
      }
      if (mode === "jsonbin") {
        await patchCloud((s) => {
          s.analytics = [];
          return s;
        });
        return { ok: true, events: [] };
      }
      localStorage.removeItem("kitchen-analytics");
      return { ok: true, events: [] };
    },

    /** Delete one order or all completed/dismissed tickets from storage */
    async deleteOrders(payload, adminCode) {
      const action = String(payload?.action || "delete").toLowerCase();
      if (mode === "local") {
        const res = await fetch(apiUrl("/api/orders"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            orderId: payload?.orderId || payload?.id || "",
            code: adminCode,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "order_delete");
        return data;
      }
      if (mode === "jsonbin") {
        let deleted = 0;
        let resultOrders = [];
        await patchCloud((s) => {
          let list = Array.isArray(s.orders) ? s.orders : [];
          if (action === "delete_completed" || action === "purge_completed") {
            const before = list.length;
            list = list.filter((o) => String(o.status || "open") === "open");
            deleted = before - list.length;
          } else {
            const id = String(payload?.orderId || payload?.id || "");
            const before = list.length;
            list = list.filter((o) => String(o.id) !== id);
            deleted = before - list.length;
            if (!deleted) throw new Error("not_found");
          }
          s.orders = list;
          resultOrders = list;
          return s;
        });
        return { ok: true, deleted, orders: resultOrders };
      }
      try {
        let list = JSON.parse(localStorage.getItem("kitchen-orders") || "[]");
        if (!Array.isArray(list)) list = [];
        let deleted = 0;
        if (action === "delete_completed" || action === "purge_completed") {
          const before = list.length;
          list = list.filter((o) => String(o.status || "open") === "open");
          deleted = before - list.length;
        } else {
          const id = String(payload?.orderId || payload?.id || "");
          const before = list.length;
          list = list.filter((o) => String(o.id) !== id);
          deleted = before - list.length;
          if (!deleted) throw new Error("not_found");
        }
        localStorage.setItem("kitchen-orders", JSON.stringify(list));
        return { ok: true, deleted, orders: list };
      } catch (e) {
        throw e;
      }
    },
  };

  function findItem(menu, itemId) {
    for (const [sec, section] of Object.entries(menu || {})) {
      for (const [sub, subcat] of Object.entries(section.subcategories || {})) {
        const items = subcat.items || [];
        for (let idx = 0; idx < items.length; idx++) {
          if (String(items[idx].id) === String(itemId)) {
            return { sec, sub, idx, item: items[idx] };
          }
        }
      }
    }
    return null;
  }

  function slugId(name, prefix) {
    const base = String(name || "item")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "item";
    return `${prefix}-${base}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function applyMenuMutation(menu, payload) {
    const action = String(payload.action || "").toLowerCase();
    if (action === "add") {
      const section = payload.section;
      const subKey = payload.subKey;
      if (!menu[section]?.subcategories?.[subKey]) throw new Error("bad_section");
      const prefix = { drinks: "d", bar: "b", food: "f" }[section] || "x";
      let id = String(payload.id || "").trim() || slugId(payload.name, prefix);
      if (findItem(menu, id)) id = slugId(payload.name, prefix);
      const item = {
        id,
        name: String(payload.name || "").trim(),
        price: parseInt(payload.price, 10) || 0,
        notes: String(payload.notes || ""),
        notesKey: String(payload.notesKey || ""),
        flags: Array.isArray(payload.flags) ? payload.flags.map(String) : [],
        img: String(payload.img || ""),
        name_en: String(payload.name_en || payload.name || ""),
        name_ja: String(payload.name_ja || payload.name || ""),
        isNew: !!payload.isNew,
        isWeeklySpecial: !!payload.isWeeklySpecial,
        weeklyQty: parseInt(payload.weeklyQty, 10) || 0,
        dineInOnly: !!payload.dineInOnly,
      };
      menu[section].subcategories[subKey].items.push(item);
      return;
    }
    if (action === "delete") {
      const itemId = String(payload.itemId || payload.id || "");
      const found = findItem(menu, itemId);
      if (!found) throw new Error("not_found");
      menu[found.sec].subcategories[found.sub].items.splice(found.idx, 1);
      return;
    }
    if (action === "update") {
      const itemId = String(payload.itemId || payload.id || "");
      const found = findItem(menu, itemId);
      if (!found) throw new Error("not_found");
      const item = found.item;
      if (payload.name) item.name = String(payload.name).trim();
      if (payload.name_en != null) item.name_en = String(payload.name_en);
      if (payload.name_ja != null) item.name_ja = String(payload.name_ja);
      if (payload.price != null) item.price = parseInt(payload.price, 10);
      if (payload.notes != null) item.notes = String(payload.notes);
      if (payload.img) item.img = String(payload.img);
      if (Array.isArray(payload.flags)) item.flags = payload.flags.map(String);
      if (payload.isNew != null) item.isNew = !!payload.isNew;
      if (payload.isWeeklySpecial != null) item.isWeeklySpecial = !!payload.isWeeklySpecial;
      if (payload.weeklyQty != null) {
        const n = parseInt(payload.weeklyQty, 10);
        item.weeklyQty = Number.isFinite(n) && n >= 0 ? n : 0;
      }
      if (payload.dineInOnly != null) item.dineInOnly = !!payload.dineInOnly;
      menu[found.sec].subcategories[found.sub].items[found.idx] = item;
      return;
    }
    throw new Error("bad_action");
  }

  window.KitchenStore = Store;
})();
