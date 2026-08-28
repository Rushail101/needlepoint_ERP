# Needle Point ERP

Simple, photo-first ERP for garment production: brands, garments (with photos + size/qty), team, and daily work logging (screen printing, embroidery, sampling, sample changes).

## 1. Set up Supabase (free tier is enough to start)

1. Go to supabase.com → New project.
2. Once created, go to **SQL Editor** → paste the contents of `supabase/schema.sql` → Run.
3. Go to **Storage** → New bucket → name it exactly `photos` → toggle **Public bucket ON**.
4. Go to **Project Settings → API** → copy the **Project URL** and **anon public key**.

## 2. Configure the app

Copy `.env.example` to `.env` and fill in:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_ADMIN_PIN=1234   # your admin PIN(s), comma-separated for multiple admins
```

## 3. Run locally

```
npm install
npm run dev
```

## 4. Deploy

**Netlify / Vercel** (either works the same way):
- Push this folder to a GitHub repo.
- Import the repo in Netlify or Vercel.
- Build command: `npm run build`, Output directory: `dist`.
- Add the same environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ADMIN_PIN`) in the site's environment settings.
- Deploy.

**Render**: Create a new Static Site, same build command/output dir, same env vars.

## What's in v1

- **Home dashboard** — garment counts by status/stage, today's activity, samples pending 7+ days
- **Brands** — name, logo, contact
- **Garments** — photo, brand, status, production stage, style code, full photo gallery, size × quantity breakdown, search
- **Team** — employees with photo + role, and a per-person work summary (entries, total pieces, by type, filterable by week/month/all-time)
- **Work Log** — guided flow: tap the garment photo → tap the person → tap the work type (Screen Printing / Embroidery / Sampling / Sample Change / Stitching / Other) → optional quantity, photo, notes
- **Sample Versions** — per garment, a running v1/v2/v3... history of sample rounds with photo + what changed + approval status
- **QR codes** — each garment has one that opens straight into Work Log with that garment pre-selected
- **PDF export** — one-click summary of a garment's photos, sizes, work history, and sample versions
- **Roles** — Admin (everything, incl. managing who has access), Floor Manager (logs/edits work, updates stage, view-only elsewhere), Worker (views Garments and Brands only). The admin's own PIN is set via env var; floor manager and worker PINs are created and managed by the admin from the Access tab — no redeploy needed to add someone.

## Natural next additions (not built yet, easy to bolt on later)

- Low-stock / pending-quantity alerts on the dashboard
- Auto-select the logged-in floor manager as the "person" in Work Log instead of picking from a list each time
- A stronger security model if this ever needs to survive a determined bad actor rather than just keep honest people on the right screens (current PIN system is a convenience gate, not hardened auth — see note in README below)
