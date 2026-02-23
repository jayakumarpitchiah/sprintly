# Sprintly

Personal sprint management for engineering teams — Gantt, Tasks, Capacity, Dashboard.

## Deploy to Vercel (5 min)

### Step 1 — Push to GitHub
```bash
# In this folder:
git init
git add .
git commit -m "Initial commit"

# Create a new repo on github.com (call it "sprintly"), then:
git remote add origin https://github.com/YOUR_USERNAME/sprintly.git
git push -u origin main
```

### Step 2 — Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) → Sign up / Log in with GitHub
2. Click **"Add New Project"**
3. Import your `sprintly` repo
4. Vercel auto-detects Vite — click **Deploy**
5. Done — you get a live URL like `sprintly.vercel.app`

### Optional — Custom domain
1. Buy a domain (e.g. `sprintly.app`) on Namecheap / Cloudflare
2. In Vercel → Project Settings → Domains → Add your domain
3. Follow DNS instructions — live in ~5 min

## Local dev
```bash
npm install
npm run dev
```

## Notes
- Data persists in `localStorage` when hosted (same as `window.storage` in Claude)
- Edit mode toggle controls who can modify tasks
- All sprint config (start date, holidays, time off) in Tasks → ⚙ Config
