# Needle Point ERP — operations

Photo-first production ERP for Needle Point: orders, garments, work logs, fabric, job work, team and brand portal.

It runs in the same Supabase project as the accounts app, in its own schema (`ops`) and photo bucket (`ops-photos`), so it can share a project with anything else. **Moving from the old separate project: follow [MOVE_GUIDE.md](MOVE_GUIDE.md).**

## Fresh setup

1. **SQL Editor:** run `supabase/ops_install.sql`. It is safe to re-run and touches only the `ops` schema, plus the `ops-photos` bucket.
2. **Project Settings → API → Exposed schemas:** add `ops`.
3. **Admin PIN:** `select ops.ops_bootstrap_admin('your-pin');`. Change it later in Settings.
4. **Accounts link:** run `accounts_app/sql/integration/001_link_operations.sql` from the accounts app.
5. **App env:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Nothing else: no PINs or tokens in `VITE_` vars, which ship to every browser.
6. **Optional:** Telegram (MOVE_GUIDE §7) and the lockdown (MOVE_GUIDE §9).

Run locally with `npm install && npm run dev`. To deploy, use build `npm run build` with output `dist`.

## Files in `supabase/`

| File | What it is |
|---|---|
| `ops_install.sql` | Every table, login function and photo bucket. Re-run it any time. |
| `ops_lockdown.sql` / `ops_lockdown_undo.sql` | Locks data to signed-in roles; undo reopens the ops tables. |
| `move/move-data.mjs` | Copies data and photos from the old project. |
| `functions/ops-notify`, `functions/ops-daily-digest` | Telegram alerts and the 8 pm summary. |
| `daily_digest_schedule.sql` | Schedules the summary. |

## Security

- **Logins are checked in the database.** PINs and portal passwords are stored as bcrypt hashes; they are never sent to the browser and never shown.
- **Each login gets a session token** that's sent with every request.
- **Wrong guesses are throttled** to 20 per network per 15 minutes.
- **With the lockdown on,** each role sees only its own data (table in MOVE_GUIDE §9).
