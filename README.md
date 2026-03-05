# 🕌 Awqat al-Salat — Prayer Times Web App

Beautiful prayer times app with **Hanafi & Jafari** fiqh support, Ramadan Sehr/Iftar panel, live clock, and side-by-side comparison.

```
awqat/
├── backend/        ← Node.js/Express API  → deploy to Render (free)
│   ├── server.js
│   └── package.json
├── frontend/       ← Static HTML/CSS/JS   → deploy to GitHub Pages (free)
│   └── index.html
└── README.md
```

---

## 🚀 Deployment (GitHub Pages + Render)

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/awqat.git
git push -u origin main
```

### Step 2 — Deploy Backend to Render

1. Go to [render.com](https://render.com) → sign up free
2. New → **Web Service** → connect your GitHub repo
3. Set these:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node
4. Click **Deploy** — Render gives you a URL like `https://awqat-api.onrender.com`

### Step 3 — Update frontend API URL

Open `frontend/index.html`, find this line (~line 7 of the script):

```js
: 'https://awqat-api.onrender.com';  // ← update this after deploying backend
```

Replace with your actual Render URL, then commit and push.

### Step 4 — Enable GitHub Pages

1. GitHub repo → **Settings** → **Pages**
2. Source: **Deploy from a branch** → branch: `main`, folder: `/frontend`
3. Save — your app is live at `https://YOUR_USERNAME.github.io/awqat`

---

## 🖥️ Running Locally

```bash
# Backend
cd backend
npm install
npm run dev        # runs on http://localhost:3001

# Frontend — just open in browser
open frontend/index.html
# or serve with:
npx serve frontend
```

---

## ✨ Features

- 🌍 **40+ cities** pre-loaded with search + manual entry for any city worldwide
- 🕌 **Hanafi & Jafari** prayer times side by side
- 🌙 **Ramadan mode** — auto-detected from Hijri calendar, shows Sehr (Imsak) & Iftar (Maghrib) for both fiqhs
- ⏱️ Live clock + countdown to next prayer
- 📅 Hijri date display
- 📊 Fiqh comparison table with time difference
- Tab between Hanafi / Jafari / Both views on prayer cards
- Responsive — works on mobile, tablet, desktop

---

## 🔧 API Reference

### `GET /api/times?city=Islamabad&country=PK`

Returns prayer times for both fiqhs:

```json
{
  "city": "Islamabad",
  "country": "PK",
  "date": { "gregorian": {...}, "hijri": { "isRamadan": true, ... } },
  "hanafi": { "fajr": "05:12", "dhuhr": "12:18", "asr": "16:04", ... },
  "jafari": { "fajr": "05:08", "dhuhr": "12:18", "asr": "15:34", ... }
}
```

### `GET /api/cities`

Returns list of all pre-loaded cities.

---

## 📐 Fiqh Calculation Details

| | Hanafi | Jafari |
|---|---|---|
| **Method** | 1 (Univ. of Islamic Sciences, Karachi) | 7 (Institute of Geophysics, Tehran) |
| **Asr** | Later (shadow = 2x object) | Earlier (shadow = 1x object) |
| **Maghrib** | At sunset | ~15 min after sunset |
| **Sehr** | Imsak time | Imsak time (Jafari calc) |
| **Iftar** | Maghrib | Maghrib (Jafari calc) |
