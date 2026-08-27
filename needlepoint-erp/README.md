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
VITE_APP_PIN=1234   # optional, protects the app with a shared PIN
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
- Add the same environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_PIN`) in the site's environment settings.
- Deploy.

**Render**: Create a new Static Site, same build command/output dir, same env vars.

## What's in v1

- **Brands** — name, logo, contact
- **Garments** — photo, brand, status, style code, full photo gallery, size × quantity breakdown
- **Team** — employees with photo + role
- **Work Log** — guided flow: tap the garment photo → tap the person → tap the work type (Screen Printing / Embroidery / Sampling / Sample Change / Stitching / Other) → optional quantity, photo, notes
- **Sample Versions** — per garment, a running v1/v2/v3... history of sample rounds with photo + what changed + approval status

## Natural next additions (not built yet, easy to bolt on later)

- Per-employee daily/weekly work summary (for payroll or productivity review)
- Low-stock / pending-quantity alerts
- Export a garment's full history (photos, sizes, work log, samples) as a PDF for the brand
- Real per-user login instead of the shared PIN, if you want individual accountability on who logged what
