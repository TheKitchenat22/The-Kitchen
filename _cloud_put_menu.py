"""
PUT data/menu.json to JSONBin without wiping live hide / specials / weekly qty.

Every deploy must use this (not a raw menu replace). It:
  1. GETs the live bin
  2. Copies isHidden, isWeeklySpecial, weeklyQty from live items (or menuOps)
  3. PUTs the new menu + menuOps, keeping orders / stock / hours / bar

Usage:  python _cloud_put_menu.py
"""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)
OPS = ("isHidden", "isWeeklySpecial", "weeklyQty")


def read_jsonbin_config() -> tuple[str, str]:
    text = (ROOT / "js" / "config.js").read_text(encoding="utf-8")
    bin_id = re.search(r'binId:\s*"([^"]+)"', text)
    key = re.search(r'masterKey:\s*"([^"]+)"', text)
    if not bin_id or not key:
        raise SystemExit("Could not read jsonbin binId/masterKey from js/config.js")
    return bin_id.group(1), key.group(1)


def walk_items(menu: dict):
    for section in (menu or {}).values():
        if not isinstance(section, dict):
            continue
        for sub in (section.get("subcategories") or {}).values():
            if not isinstance(sub, dict):
                continue
            for item in sub.get("items") or []:
                if isinstance(item, dict) and item.get("id"):
                    yield item


def capture_ops(menu: dict) -> dict:
    ops = {}
    for item in walk_items(menu):
        ops[str(item["id"])] = {
            "isHidden": bool(item.get("isHidden")),
            "isWeeklySpecial": bool(item.get("isWeeklySpecial")),
            "weeklyQty": int(item.get("weeklyQty") or 0),
        }
    return ops


def apply_ops(menu: dict, ops: dict) -> None:
    if not ops:
        return
    for item in walk_items(menu):
        o = ops.get(str(item.get("id")))
        if not o:
            continue
        if "isHidden" in o:
            item["isHidden"] = bool(o["isHidden"])
        if "isWeeklySpecial" in o:
            item["isWeeklySpecial"] = bool(o["isWeeklySpecial"])
        if "weeklyQty" in o:
            try:
                n = int(o["weeklyQty"])
            except (TypeError, ValueError):
                n = 0
            item["weeklyQty"] = max(0, n)


def request(method: str, url: str, headers: dict, body: bytes | None = None):
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            raw = res.read()
            etag = res.headers.get("ETag") or res.headers.get("X-Etag")
            return json.loads(raw.decode("utf-8")), etag, res.status
    except urllib.error.HTTPError as e:
        raise SystemExit(f"JSONBin {method} failed: {e.code} {e.read()[:400]!r}") from e


def main() -> None:
    bin_id, key = read_jsonbin_config()
    menu_path = ROOT / "data" / "menu.json"
    new_menu = json.loads(menu_path.read_text(encoding="utf-8"))

    base = f"https://api.jsonbin.io/v3/b/{bin_id}"
    headers = {
        "X-Master-Key": key,
        "X-Bin-Meta": "false",
        "User-Agent": UA,
    }
    live, etag, _ = request("GET", f"{base}/latest", headers)
    if isinstance(live, dict) and "record" in live:
        live = live["record"]
    if not isinstance(live, dict):
        raise SystemExit("Unexpected JSONBin payload")

    live_ops = live.get("menuOps") if isinstance(live.get("menuOps"), dict) else {}
    if not live_ops:
        live_ops = capture_ops(live.get("menu") or {})

    apply_ops(new_menu, live_ops)
    live["menu"] = new_menu
    live["menuOps"] = live_ops

    put_headers = {
        **headers,
        "Content-Type": "application/json",
    }
    if etag:
        put_headers["If-Match"] = etag
    body = json.dumps(live, ensure_ascii=False).encode("utf-8")
    _, _, status = request("PUT", base, put_headers, body)
    hidden = sum(1 for it in walk_items(new_menu) if it.get("isHidden"))
    weekly = sum(1 for it in walk_items(new_menu) if it.get("isWeeklySpecial"))
    print(f"JSONBin menu PUT {status} · hidden={hidden} · weekly specials={weekly}")


if __name__ == "__main__":
    main()
