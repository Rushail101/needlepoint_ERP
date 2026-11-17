# Needle Point ERP — operations

Photo-first production ERP for Needle Point: orders, garments, work logs, fabric, job work, team and brand portal. It shares a Supabase project with the accounts app (`accounts_erp` schema). See that repo's `MERGE_GUIDE.md`.

## 1. Database

In the Supabase **SQL Editor**, run these in order. Every file is safe to run again.

1. `supabase/schema.sql` (fresh project only), then `migration_002` … `migration_006` if they haven't been run yet.
2. `supabase/migration_007_schema_catchup.sql`
3. `supabase/migration_008_production_upgrades.sql`
4. Set the admin PIN: `select public.ops_bootstrap_admin('your-pin');`
   - This replaces `VITE_ADMIN_PIN`.
   - You can change it later in **Settings**.
5. *(Optional, recommended once everything works)* `supabase/migration_009_lockdown.sql`
   - This locks every table to signed-in sessions (see "Security" below).
   - `migration_009_undo.sql` reverses it.

Storage: keep a **public** bucket named `photos`.

## 2. App environment

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Remove `VITE_ADMIN_PIN`, `VITE_TELEGRAM_BOT_TOKEN` and `VITE_TELEGRAM_CHAT_ID` from Netlify/Vercel. Anything starting with `VITE_` ships to every visitor's browser.

## 3. Telegram alerts and the evening digest (optional)

```
supabase secrets set TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... DIGEST_SECRET=<long random text>
supabase functions deploy notify
supabase functions deploy daily-digest --no-verify-jwt
```

Then enable `pg_cron` and `pg_net` (Database → Extensions). Fill in your project ref and `DIGEST_SECRET` in `supabase/daily_digest_schedule.sql` and run it. Each evening at 8 pm IST you get a summary on Telegram: pieces made today, late orders, overdue job work and samples waiting.

Use **Settings → Send test message** to check that alerts work.

## 4. Run / deploy

`npm install && npm run dev` locally. On Netlify/Vercel, use build `npm run build` with output `dist`.

## Security

- **Logins are checked in the database.** PINs and portal passwords are stored as bcrypt hashes. They are never sent to the browser and never shown on screen.
- **Each login gets a session token,** and the app sends it with every request.
- **Repeated wrong guesses are blocked:** 20 per network per 15 minutes.
- **With 009 applied, tables are locked to roles:**
  - Visitors with no login see nothing.
  - Floor managers and workers see production but not the access list or the accounts data.
  - Brand clients see only their own orders and invoices.
  - The accounts app needs to be signed in with Supabase Auth (email) to keep working.
