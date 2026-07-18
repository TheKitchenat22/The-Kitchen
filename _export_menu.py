"""Export KITCHEN_MENU from menu-data.js into data/menu.json (one-time seed)."""
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parent
js = (root / "js" / "menu-data.js").read_text(encoding="utf-8")

# Extract the object assigned to window.KITCHEN_MENU
m = re.search(r"window\.KITCHEN_MENU\s*=\s*(\{);", js)
if not m:
    # broader
    m = re.search(r"window\.KITCHEN_MENU\s*=\s*(\{)", js)
if not m:
    raise SystemExit("Could not find KITCHEN_MENU")

start = m.start(1)
# brace match
depth = 0
end = None
for i, ch in enumerate(js[start:], start):
    if ch == "{":
        depth += 1
    elif ch == "}":
        depth -= 1
        if depth == 0:
            end = i + 1
            break
if end is None:
    raise SystemExit("Unbalanced braces")

obj_js = js[start:end]
# Convert JS object to JSON-ish
s = obj_js
# quote unquoted keys
s = re.sub(r"(\s)([A-Za-z_][A-Za-z0-9_]*)\s*:", r'\1"\2":', s)
# true/false already fine; trailing commas
s = re.sub(r",\s*}", "}", s)
s = re.sub(r",\s*]", "]", s)

data = json.loads(s)
out = root / "data" / "menu.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("Wrote", out, "sections", list(data.keys()))
