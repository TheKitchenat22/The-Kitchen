#!/usr/bin/env python3
"""
The Kitchen at 22 — local server with shared APIs.

Run:
  python server.py
  http://localhost:8765

APIs:
  GET  /api/stock
  POST /api/stock          { outOfStock, code }
  GET  /api/hours
  POST /api/hours          { hours fields, code }
  GET  /api/menu
  POST /api/menu/item      { code, action: add|delete|update, ... }
  POST /api/menu/image     { code, itemId, filename, data: dataURL base64 }
  GET  /api/announcement
  POST /api/announcement   { code, enabled, messageEs, messageEn }
  GET  /api/orders         { ?code= for admin full list }
  POST /api/orders         create order (public) or update status (code required)
  GET  /api/analytics      { ?code= admin list }
  POST /api/analytics      public track, or admin purge with code
"""

from __future__ import annotations

import base64
import json
import os
import re
import time
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
STOCK_FILE = ROOT / "data" / "stock.json"
HOURS_FILE = ROOT / "data" / "hours.json"
MENU_FILE = ROOT / "data" / "menu.json"
ANNOUNCE_FILE = ROOT / "data" / "announcement.json"
ORDERS_FILE = ROOT / "data" / "orders.json"
ANALYTICS_FILE = ROOT / "data" / "analytics.json"
PRODUCTS_DIR = ROOT / "assets" / "products"
ADMIN_CODE = "oCW6x3Kiyx9PwqFd"
PORT = int(os.environ.get("PORT", "8765"))
MAX_ORDERS = 800
MAX_ANALYTICS = 2500

DEFAULT_HOURS = {
    "closedDays": [2],
    "open": "14:00",
    "close": "21:00",
    "deliveryClose": "20:30",
    "forceClosed": False,
    "forceOpen": False,
}

TIME_RE = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")
DATA_URL_RE = re.compile(r"^data:(image/(?:png|jpeg|jpg|webp|gif));base64,(.+)$", re.I | re.S)

SECTION_KEYS = {
    "drinks": list,
    "bar": list,
    "food": list,
}


def read_stock() -> dict:
    try:
        if STOCK_FILE.exists():
            data = json.loads(STOCK_FILE.read_text(encoding="utf-8"))
            ids = data.get("outOfStock", [])
            if isinstance(ids, list):
                return {"outOfStock": [str(x) for x in ids]}
    except (OSError, json.JSONDecodeError):
        pass
    return {"outOfStock": []}


def write_stock(out_of_stock: list) -> dict:
    STOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    clean = sorted({str(x) for x in out_of_stock if x})
    payload = {"outOfStock": clean}
    STOCK_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return payload


def normalize_hours(raw: dict | None) -> dict:
    base = dict(DEFAULT_HOURS)
    if not isinstance(raw, dict):
        return base
    days = raw.get("closedDays", base["closedDays"])
    if isinstance(days, list):
        base["closedDays"] = sorted(
            {int(d) for d in days if str(d).lstrip("-").isdigit() and 0 <= int(d) <= 6}
        )
    for key in ("open", "close", "deliveryClose"):
        val = str(raw.get(key, base[key])).strip()
        if TIME_RE.match(val):
            h, m = val.split(":")
            base[key] = f"{int(h):02d}:{int(m):02d}"
    base["forceClosed"] = bool(raw.get("forceClosed", False))
    base["forceOpen"] = bool(raw.get("forceOpen", False))
    if base["forceClosed"] and base["forceOpen"]:
        base["forceOpen"] = False
    return base


def read_hours() -> dict:
    try:
        if HOURS_FILE.exists():
            return normalize_hours(json.loads(HOURS_FILE.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError):
        pass
    return dict(DEFAULT_HOURS)


def write_hours(raw: dict) -> dict:
    HOURS_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = normalize_hours(raw)
    HOURS_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return payload


def read_menu() -> dict:
    if not MENU_FILE.exists():
        return {}
    try:
        data = json.loads(MENU_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def write_menu(menu: dict) -> dict:
    MENU_FILE.parent.mkdir(parents=True, exist_ok=True)
    MENU_FILE.write_text(json.dumps(menu, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return menu


def find_item(menu: dict, item_id: str):
    for sec_key, section in menu.items():
        subs = section.get("subcategories") or {}
        for sub_key, sub in subs.items():
            for idx, item in enumerate(sub.get("items") or []):
                if str(item.get("id")) == str(item_id):
                    return sec_key, sub_key, idx, item
    return None


def slug_id(name: str, prefix: str = "x") -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:32] or "item"
    return f"{prefix}-{base}-{uuid.uuid4().hex[:6]}"


def ext_from_mime(mime: str) -> str:
    mime = mime.lower()
    if "png" in mime:
        return ".png"
    if "webp" in mime:
        return ".webp"
    if "gif" in mime:
        return ".gif"
    return ".jpg"


def handle_menu_item(data: dict) -> tuple[int, dict]:
    menu = read_menu()
    if not menu:
        return 500, {"error": "menu_missing", "message": "data/menu.json not found. Run seed export."}

    action = str(data.get("action") or "").lower()
    if action == "add":
        section = str(data.get("section") or "")
        sub_key = str(data.get("subKey") or "")
        if section not in menu:
            return 400, {"error": "bad_section"}
        subs = menu[section].setdefault("subcategories", {})
        if sub_key not in subs:
            return 400, {"error": "bad_subcategory"}
        name = str(data.get("name") or "").strip()
        if not name:
            return 400, {"error": "name_required"}
        try:
            price = int(float(data.get("price", 0)))
        except (TypeError, ValueError):
            return 400, {"error": "bad_price"}
        if price < 0:
            return 400, {"error": "bad_price"}

        prefix = {"drinks": "d", "bar": "b", "food": "f"}.get(section, "x")
        item_id = str(data.get("id") or "").strip() or slug_id(name, prefix)
        # ensure unique
        if find_item(menu, item_id):
            item_id = slug_id(name, prefix)

        flags = data.get("flags") or []
        if not isinstance(flags, list):
            flags = []
        item = {
            "id": item_id,
            "name": name,
            "price": price,
            "notes": str(data.get("notes") or ""),
            "notesKey": str(data.get("notesKey") or ""),
            "flags": [str(f) for f in flags],
            "img": str(data.get("img") or ""),
            "name_en": str(data.get("name_en") or name),
            "name_ja": str(data.get("name_ja") or name),
        }
        subs[sub_key].setdefault("items", []).append(item)
        write_menu(menu)
        return 200, {"ok": True, "item": item, "menu": menu}

    if action == "delete":
        item_id = str(data.get("itemId") or data.get("id") or "").strip()
        found = find_item(menu, item_id)
        if not found:
            return 404, {"error": "not_found"}
        sec_key, sub_key, idx, item = found
        menu[sec_key]["subcategories"][sub_key]["items"].pop(idx)
        # clean stock
        stock = read_stock()["outOfStock"]
        if item_id in stock:
            write_stock([x for x in stock if x != item_id])
        write_menu(menu)
        return 200, {"ok": True, "deleted": item_id, "menu": menu}

    if action == "update":
        item_id = str(data.get("itemId") or data.get("id") or "").strip()
        found = find_item(menu, item_id)
        if not found:
            return 404, {"error": "not_found"}
        sec_key, sub_key, idx, item = found
        if "name" in data and str(data["name"]).strip():
            item["name"] = str(data["name"]).strip()
        if "name_en" in data:
            item["name_en"] = str(data["name_en"]).strip()
        if "name_ja" in data:
            item["name_ja"] = str(data["name_ja"]).strip()
        if "price" in data:
            try:
                item["price"] = int(float(data["price"]))
            except (TypeError, ValueError):
                return 400, {"error": "bad_price"}
        if "notes" in data:
            item["notes"] = str(data["notes"])
        if "img" in data and data["img"]:
            item["img"] = str(data["img"])
        if "flags" in data and isinstance(data["flags"], list):
            item["flags"] = [str(f) for f in data["flags"]]
        if "isNew" in data:
            item["isNew"] = bool(data["isNew"])
        if "isWeeklySpecial" in data:
            item["isWeeklySpecial"] = bool(data["isWeeklySpecial"])
        if "weeklyQty" in data:
            try:
                n = int(float(data["weeklyQty"]))
                item["weeklyQty"] = max(0, n)
            except (TypeError, ValueError):
                return 400, {"error": "bad_weekly_qty"}
        if "dineInOnly" in data:
            item["dineInOnly"] = bool(data["dineInOnly"])
        menu[sec_key]["subcategories"][sub_key]["items"][idx] = item
        write_menu(menu)
        return 200, {"ok": True, "item": item, "menu": menu}

    return 400, {"error": "bad_action"}


def default_announcement() -> dict:
    return {
        "enabled": False,
        "messageEs": "",
        "messageEn": "",
        "updatedAt": None,
    }


def normalize_announcement(raw: dict | None) -> dict:
    base = default_announcement()
    if not isinstance(raw, dict):
        return base
    base["enabled"] = bool(raw.get("enabled", False))
    base["messageEs"] = str(raw.get("messageEs") or "")[:2000]
    base["messageEn"] = str(raw.get("messageEn") or "")[:2000]
    base["updatedAt"] = raw.get("updatedAt")
    return base


def read_announcement() -> dict:
    try:
        if ANNOUNCE_FILE.exists():
            return normalize_announcement(json.loads(ANNOUNCE_FILE.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError):
        pass
    return default_announcement()


def write_announcement(raw: dict) -> dict:
    ANNOUNCE_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = normalize_announcement(raw)
    payload["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    ANNOUNCE_FILE.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return payload


def read_orders() -> list:
    try:
        if ORDERS_FILE.exists():
            data = json.loads(ORDERS_FILE.read_text(encoding="utf-8"))
            orders = data.get("orders", data if isinstance(data, list) else [])
            if isinstance(orders, list):
                return orders
    except (OSError, json.JSONDecodeError):
        pass
    return []


def write_orders(orders: list) -> list:
    ORDERS_FILE.parent.mkdir(parents=True, exist_ok=True)
    # Keep newest first, cap history
    clean = orders[:MAX_ORDERS] if isinstance(orders, list) else []
    ORDERS_FILE.write_text(
        json.dumps({"orders": clean}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return clean


def sanitize_order_item(raw) -> dict | None:
    if not isinstance(raw, dict):
        return None
    name = str(raw.get("name") or "").strip()[:200]
    if not name:
        return None
    try:
        qty = int(raw.get("qty") or 1)
    except (TypeError, ValueError):
        qty = 1
    qty = max(1, min(99, qty))
    return {
        "id": str(raw.get("id") or "")[:80],
        "name": name,
        "qty": qty,
        "customizations": str(raw.get("customizations") or "")[:500],
        "notes": str(raw.get("notes") or "")[:500],
        "dineInOnly": bool(raw.get("dineInOnly")),
        "sectionId": str(raw.get("sectionId") or raw.get("section") or "")[:40],
        "subKey": str(raw.get("subKey") or "")[:40],
    }


def create_order(data: dict) -> tuple[int, dict]:
    order_type = str(data.get("orderType") or "").strip()
    if order_type not in ("dinein", "apartment", "amenity"):
        return 400, {"error": "bad_order_type"}
    items_in = data.get("items") or []
    if not isinstance(items_in, list) or not items_in:
        return 400, {"error": "items_required"}
    items = []
    for raw in items_in[:40]:
        it = sanitize_order_item(raw)
        if it:
            items.append(it)
    if not items:
        return 400, {"error": "items_required"}

    apartment = str(data.get("apartment") or "").strip()[:40]
    amenity = str(data.get("amenity") or "").strip()[:80]
    if order_type == "apartment" and not apartment:
        return 400, {"error": "apartment_required"}
    if order_type == "amenity" and not amenity:
        return 400, {"error": "amenity_required"}

    order = {
        "id": uuid.uuid4().hex[:12],
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "status": "open",
        "orderType": order_type,
        "apartment": apartment if order_type == "apartment" else "",
        "amenity": amenity if order_type == "amenity" else "",
        "items": items,
        "source": "whatsapp",
    }
    orders = read_orders()
    orders.insert(0, order)
    write_orders(orders)
    return 200, {"ok": True, "order": order}


def update_order_status(data: dict) -> tuple[int, dict]:
    order_id = str(data.get("orderId") or data.get("id") or "").strip()
    status = str(data.get("status") or "").strip().lower()
    if status not in ("open", "completed", "dismissed"):
        return 400, {"error": "bad_status"}
    orders = read_orders()
    found = None
    for o in orders:
        if str(o.get("id")) == order_id:
            o["status"] = status
            o["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S")
            found = o
            break
    if not found:
        return 404, {"error": "not_found"}
    write_orders(orders)
    return 200, {"ok": True, "order": found}


def delete_orders(data: dict) -> tuple[int, dict]:
    """Delete one order, or all completed/dismissed orders."""
    action = str(data.get("action") or "").lower()
    orders = read_orders()

    if action in ("delete_completed", "purge_completed"):
        before = len(orders)
        kept = [o for o in orders if str(o.get("status") or "open") == "open"]
        write_orders(kept)
        return 200, {
            "ok": True,
            "deleted": before - len(kept),
            "orders": kept,
        }

    order_id = str(data.get("orderId") or data.get("id") or "").strip()
    if not order_id:
        return 400, {"error": "order_id_required"}
    before = len(orders)
    kept = [o for o in orders if str(o.get("id")) != order_id]
    if len(kept) == before:
        return 404, {"error": "not_found"}
    write_orders(kept)
    return 200, {"ok": True, "deleted": 1, "orderId": order_id, "orders": kept}


def client_ip(handler) -> str:
    fwd = handler.headers.get("X-Forwarded-For") or handler.headers.get("X-Real-IP") or ""
    if fwd:
        return fwd.split(",")[0].strip()[:80]
    try:
        return str(handler.client_address[0] or "")[:80]
    except Exception:
        return ""


def read_analytics() -> list:
    try:
        if ANALYTICS_FILE.exists():
            data = json.loads(ANALYTICS_FILE.read_text(encoding="utf-8"))
            ev = data.get("events", data if isinstance(data, list) else [])
            if isinstance(ev, list):
                return ev
    except (OSError, json.JSONDecodeError):
        pass
    return []


def write_analytics(events: list) -> list:
    ANALYTICS_FILE.parent.mkdir(parents=True, exist_ok=True)
    clean = events[-MAX_ANALYTICS:] if isinstance(events, list) else []
    ANALYTICS_FILE.write_text(
        json.dumps({"events": clean}, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return clean


def sanitize_analytics_event(raw: dict, ip: str = "") -> dict | None:
    if not isinstance(raw, dict):
        return None
    kind = str(raw.get("type") or "pageview").lower()[:20]
    if kind not in ("pageview", "click", "section", "order"):
        kind = "pageview"
    ev = {
        "id": uuid.uuid4().hex[:10],
        "t": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "type": kind,
        "path": str(raw.get("path") or "/")[:120],
        "label": str(raw.get("label") or "")[:180],
        "visitor": str(raw.get("visitor") or "")[:40],
        "ip": str(raw.get("ip") or ip or "")[:80],
        "ref": str(raw.get("ref") or "")[:180],
        "lang": str(raw.get("lang") or "")[:12],
        "ua": str(raw.get("ua") or "")[:180],
    }
    return ev


def ingest_analytics(events_in, ip: str) -> tuple[int, dict]:
    if isinstance(events_in, dict):
        events_in = [events_in]
    if not isinstance(events_in, list) or not events_in:
        return 400, {"error": "events_required"}
    store = read_analytics()
    added = 0
    for raw in events_in[:40]:
        ev = sanitize_analytics_event(raw, ip)
        if ev:
            store.append(ev)
            added += 1
    write_analytics(store)
    return 200, {"ok": True, "added": added}


def handle_menu_image(data: dict) -> tuple[int, dict]:
    menu = read_menu()
    item_id = str(data.get("itemId") or data.get("id") or "").strip()
    found = find_item(menu, item_id)
    if not found:
        return 404, {"error": "not_found"}

    raw = str(data.get("data") or "")
    m = DATA_URL_RE.match(raw.strip())
    if not m:
        return 400, {"error": "bad_image", "message": "Expected data:image/...;base64,..."}

    mime, b64 = m.group(1), m.group(2)
    try:
        binary = base64.b64decode(b64, validate=False)
    except Exception:
        return 400, {"error": "bad_base64"}
    if len(binary) > 8 * 1024 * 1024:
        return 400, {"error": "too_large", "message": "Max 8MB"}

    PRODUCTS_DIR.mkdir(parents=True, exist_ok=True)
    safe_id = re.sub(r"[^a-zA-Z0-9_-]", "_", item_id)
    ext = ext_from_mime(mime)
    # cache-bust path
    fname = f"{safe_id}{ext}"
    path = PRODUCTS_DIR / fname
    path.write_bytes(binary)

    rel = f"assets/products/{fname}?v={int(time.time())}"
    sec_key, sub_key, idx, item = found
    item["img"] = rel
    menu[sec_key]["subcategories"][sub_key]["items"][idx] = item
    write_menu(menu)
    return 200, {"ok": True, "img": rel, "item": item, "menu": menu}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")

    def _json(self, code: int, data: dict) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        query = urlparse(self.path).query
        if path == "/api/stock":
            self._json(200, read_stock())
            return
        if path == "/api/hours":
            self._json(200, read_hours())
            return
        if path == "/api/menu":
            menu = read_menu()
            if not menu:
                self._json(404, {"error": "menu_missing"})
                return
            self._json(200, {"menu": menu})
            return
        if path == "/api/announcement":
            self._json(200, read_announcement())
            return
        if path == "/api/orders":
            # Admin list: ?code=...
            qs = parse_qs(query or "")
            code = (qs.get("code") or [""])[0]
            if code != ADMIN_CODE:
                self._json(401, {"error": "unauthorized"})
                return
            self._json(200, {"orders": read_orders()})
            return
        if path == "/api/analytics":
            qs = parse_qs(query or "")
            code = (qs.get("code") or [""])[0]
            if code != ADMIN_CODE:
                self._json(401, {"error": "unauthorized"})
                return
            self._json(200, {"events": read_analytics()})
            return
        return super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        allowed = {
            "/api/stock",
            "/api/hours",
            "/api/menu/item",
            "/api/menu/image",
            "/api/announcement",
            "/api/orders",
            "/api/analytics",
        }
        if path not in allowed:
            self.send_error(404, "Not found")
            return

        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self._json(400, {"error": "invalid_json"})
            return

        # Public: create new kitchen order (no admin code)
        if path == "/api/orders" and str(data.get("action") or "create").lower() == "create":
            code, payload = create_order(data)
            self._json(code, payload)
            return

        # Public: ingest analytics (no admin code)
        if path == "/api/analytics" and str(data.get("action") or "track").lower() in ("track", "create", ""):
            evs = data.get("events") if isinstance(data.get("events"), list) else [data]
            code, payload = ingest_analytics(evs, client_ip(self))
            self._json(code, payload)
            return

        if str(data.get("code", "")) != ADMIN_CODE:
            self._json(401, {"error": "unauthorized"})
            return

        if path == "/api/stock":
            ids = data.get("outOfStock", [])
            if not isinstance(ids, list):
                self._json(400, {"error": "outOfStock must be a list"})
                return
            self._json(200, write_stock(ids))
            return

        if path == "/api/hours":
            hours_payload = data.get("hours") if isinstance(data.get("hours"), dict) else data
            self._json(200, write_hours(hours_payload))
            return

        if path == "/api/menu/item":
            code, payload = handle_menu_item(data)
            self._json(code, payload)
            return

        if path == "/api/menu/image":
            code, payload = handle_menu_image(data)
            self._json(code, payload)
            return

        if path == "/api/announcement":
            self._json(200, write_announcement(data))
            return

        if path == "/api/orders":
            act = str(data.get("action") or "update").lower()
            if act in ("delete", "delete_completed", "purge_completed"):
                code, payload = delete_orders(data)
                self._json(code, payload)
                return
            # Admin: update status
            code, payload = update_order_status(data)
            self._json(code, payload)
            return

        if path == "/api/analytics":
            write_analytics([])
            self._json(200, {"ok": True, "events": []})
            return

    def log_message(self, fmt: str, *args) -> None:
        if args and isinstance(args[0], str) and "/api/" in args[0]:
            super().log_message(fmt, *args)


def main() -> None:
    STOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    PRODUCTS_DIR.mkdir(parents=True, exist_ok=True)
    if not STOCK_FILE.exists():
        write_stock([])
    if not HOURS_FILE.exists():
        write_hours(DEFAULT_HOURS)
    if not ANNOUNCE_FILE.exists():
        write_announcement(default_announcement())
    if not ORDERS_FILE.exists():
        write_orders([])
    if not ANALYTICS_FILE.exists():
        write_analytics([])
    if not MENU_FILE.exists():
        print("WARNING: data/menu.json missing — run: python _export_menu.py")

    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"The Kitchen at 22 → http://localhost:{PORT}")
    print("Admin code set in server.py  |  stock · hours · menu · announcement · orders")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        server.server_close()


if __name__ == "__main__":
    main()
