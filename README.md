# Recipe Keeper (Drive + local password)

A lightweight web app to save recipes.  
- Stores data in **your Google Drive**:
  - `/RecipeKeeper/recipes.json`
  - `/RecipeKeeper/images/`
- Local-only password (per device)
- Categories, search, image upload
- Works on Android + iPhone (mobile-friendly)
- Host anywhere (Netlify/GitHub Pages)

---

## Files
- `index.html` – UI skeleton
- `styles.css` – light/dark styling
- `password.js` – local-only lock (SHA-256 hash in localStorage)
- `drive.js` – Google Drive API helpers
- `app.js` – app logic

---

## Quick Start (Netlify + GitHub)
1. Create a **GitHub repo**. Add these files.
2. Go to **Netlify → Add new site → Import from GitHub** → pick the repo → Deploy.
3. Note your site URL, e.g. `https://your-site.netlify.app`.

### Google OAuth
1. Google Cloud Console → **APIs & Services**:
   - Enable **Google Drive API**
   - Create **OAuth 2.0 Client ID** (type: **Web application**)
   - Create **API key**
2. In OAuth **Authorized JavaScript origins**, add:
   - `https://your-site.netlify.app`
   - If using GitHub Pages too: `https://yourname.github.io` and `https://yourname.github.io/your-repo`
3. Save changes. Copy **CLIENT_ID** and **API_KEY**.

### First Run
1. Open your site URL.
2. The **lock** appears (first load). You can set a device password there or in **Settings**.
3. Paste CLIENT_ID + API_KEY → **Connect** → sign into Google → it will create:
   - `/RecipeKeeper/recipes.json`
   - `/RecipeKeeper/images/`

### Use
- Add recipes, upload images (stored in Drive).
- Search by title/ingredients/notes.
- Filter by category.
- Export/Import JSON backups (local).

### Notes
- Password is **local-only** (per device). Clearing browser data removes it.
- Data is **in Drive**, not on Netlify/GitHub.
- If Drive login fails, recheck OAuth origins exactly match your site URL.
