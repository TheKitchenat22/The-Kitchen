/**
 * Copy this file to config.js and fill in your JSONBin keys for GitHub Pages.
 *
 * SETUP (free, ~2 minutes):
 * 1. Go to https://jsonbin.io and create an account
 * 2. Create a new Bin
 * 3. Paste the contents of data/cloud-seed.json as the bin content → Save
 * 4. Copy the Bin ID (from the URL or bin details)
 * 5. Account → API Keys → copy your X-Master-Key
 * 6. Put them below, save as js/config.js, commit & push
 *
 * After that, admin changes (stock, hours, menu, photos) sync for ALL visitors.
 *
 * Security note: the master key is visible in the browser (same as admin code 1254).
 * Anyone who knows both could edit the menu. Fine for a small restaurant site;
 * change the admin code in app.js if you share the site widely.
 */
window.KITCHEN_CONFIG = {
  // Leave empty to use only local python server.py (localhost)
  jsonbin: {
    binId: "",       // e.g. "67f1a2b3c4d5e6f7a8b9c0d1"
    masterKey: "",   // e.g. "$2a$10$...."
  },
  // Optional: full URL if server.py is hosted online
  // apiBase: "https://your-api.example.com",
  apiBase: "",
};
