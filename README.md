# 🕌 Awqat al-Salat — Prayer Times Web App

Beautiful prayer times app with **Hanafi & Jafari** fiqh support, Ramadan Sehr/Iftar panel, live clock, and side-by-side comparison.

```
awqat/
├── backend/           ← Node.js/Express API  → deploy to Vercel (free, no card)
│   ├── server.js
│   └── package.json
├── index.html         ← Static HTML/CSS/JS   → deploy to GitHub Pages (free)
├── vercel.json        ← Vercel config (already included)
└── README.md
```

---

## 🚀 Deployment Guide

### Step 1 — Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/awqat.git
git push -u origin main
```

### Step 2 — Deploy Backend to Vercel (free, no card needed)
1. Go to vercel.com → Sign Up → Continue with GitHub
2. Click "Add New Project"
3. Import your `awqat` repo
4. Leave all settings as default (vercel.json handles everything)
5. Click "Deploy"
6. Copy your URL e.g. https://awqat-abc123.vercel.app

### Step 3 — Update API URL in frontend
Open index.html, find:
  : 'https://awqat-api.onrender.com';
Replace with your Vercel URL, commit and push.

### Step 4 — Enable GitHub Pages
GitHub repo → Settings → Pages → Branch: main, Folder: /root → Save
Your app: https://YOUR_USERNAME.github.io/awqat

---

## Running Locally
```bash
cd backend && npm install && npm run dev
# Then open frontend/index.html in browser
```
