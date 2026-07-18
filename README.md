# The Kitchen at 22 — Digital Menu

Design language inspired by [Action Black](https://www.actionblack.mx/): dark cinematic UI, Bebas Neue display type, lime accent, high contrast, noise grain.

## Run (recommended — shared stock for everyone)

```bash
cd the-kitchen-at-22
python server.py
```

Or double-click **START.bat**. Open **http://localhost:8765**

`server.py` serves the site **and** saves out-of-stock items to `data/stock.json` so all visitors see the same status.

## Admin

1. Footer → **Admin**
2. Code: **`1254`**
3. **Stock:** on each product, tap **Agotado** / **Disponible**
4. **Menu / Photos:** admin bar → **Menú / Fotos**
   - Add products (name ES/EN/JA, price, section)
   - Delete products
   - **Cambiar foto** → upload a product photo (saved under `assets/products/`)
   - Edit price
5. **Hours:** admin bar → **Horarios**
6. Saved for everyone when using `server.py`:
   - `data/menu.json` (catalog)
   - `data/stock.json`
   - `data/hours.json`
   - `assets/products/*` (photos)
7. **Salir admin** ends the session (data stays)

If `data/menu.json` is missing, run: `python _export_menu.py`

### Default order hours

- Open every day **except Tuesday**
- Venue: **2:00 PM – 9:00 PM**
- WhatsApp / delivery orders until **8:30 PM** (device local time)
- Outside that window the send button is grayed out

## Your logo & restaurant photo

1. Copy your files into the `assets/` folder with these exact names:

| File | Use | Tips |
|------|-----|------|
| `assets/logo.png` | Header logo | PNG with transparent background works best |
| `assets/restaurant.jpg` | Big hero image at the top | Wide photo (~1600×1000 or larger) |

2. Refresh **http://localhost:8765**

If a file is missing, the site falls back to the text “22” logo and a stock photo.

Other formats work if you rename them (e.g. `logo.webp` → update `src` in `index.html`).

## Features

- Dark Action Black–style layout
- ES / EN / JA · cart · apartment · WhatsApp
- Admin stock + order hours

## WhatsApp number

Edit `js/app.js`:

```js
const WHATSAPP_NUMBER = "523329149245";
```
