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
    await jsonbinPut(next);
    return next;
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
      menu[found.sec].subcategories[found.sub].items[found.idx] = item;
      return;
    }
    throw new Error("bad_action");
  }

  window.KitchenStore = Store;
})();
