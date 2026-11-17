# Moving the operations app into your invoice project

The operations app moves into the Supabase project that already holds your accounts app (and your other projects). It gets its own schema, `ops`, and its own photo bucket, `ops-photos`. Nothing in `public`, `accounts_erp` or any other schema is touched. Once this works, the old operations project can be deleted.

About 20–30 minutes. "Shared project" below means your invoice project.

## 1. Create the `ops` schema

In the **shared project → SQL Editor**, open `supabase/ops_install.sql`, paste it in and run it.

Then go to **Project Settings → API → Exposed schemas** and add `ops`. Keep everything that's already listed (`public`, `accounts_erp`, your other schemas).

## 2. Bring your data across (skip if you want to start fresh)

You need Node 18 or newer on your computer. No `npm install` is needed. From the app folder, run:

```
OLD_URL=https://<old-ref>.supabase.co  OLD_SERVICE_KEY=<old service_role key> \
NEW_URL=https://<shared-ref>.supabase.co  NEW_SERVICE_KEY=<shared service_role key> \
node supabase/move/move-data.mjs
```

The service_role keys are in **Project Settings → API**. They are secret, so don't paste them anywhere else.

The script:
- copies every table into `ops`;
- copies every photo (logos, garments, work-log photos, team photos) into `ops-photos` and rewrites the links;
- keeps the stage dates.

It never changes the old project, and it's safe to run again. Any photo it can't copy is listed and keeps its old link.

**Do this before step 4.** The script stops if the accounts link is already set up, so brands don't get turned into parties twice.

## 3. Finish the logins

In the shared project's SQL editor:

1. Run `supabase/ops_install.sql` **once more**. This turns old plain-text PINs and portal passwords into secure hashes, so everyone's existing PIN keeps working.
2. If the script said the admin PIN didn't carry over, set it: `select ops.ops_bootstrap_admin('your-pin');`

## 4. Link to the accounts app

Run `accounts_app/sql/integration/001_link_operations.sql` (in the InvoiceAppV2 folder) in the shared project's SQL editor.

## 5. Point both apps at the shared project and deploy

- **Operations app (Netlify/Vercel env):**
  - Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the shared project's values.
  - Delete `VITE_ADMIN_PIN`, `VITE_TELEGRAM_BOT_TOKEN` and `VITE_TELEGRAM_CHAT_ID`.
  - Redeploy.
- **Accounts app:** env unchanged (it's already on this project). Deploy the new version.

## 6. Match brands with your parties

Go to **Accounts → Production Orders**. One-time setup: pick **Needle Point** and click **Link brands & staff**.

- **Linked straight away:** brands with the same GSTIN as a client, or the same name once "Pvt Ltd", punctuation and so on are ignored.
- **The rest open in Brand links:**
  - ★ suggested matches, which you can accept one by one or all at once;
  - a dropdown to pick any client;
  - **+ New party** for a brand you've never billed.
- **The "Clients not in operations" tab** can turn an existing client into a brand.

You can come back any time via **Parties → 🔗 Brand links**. In the operations app, Brands shows each brand's linked party.

## 7. Telegram alerts (optional)

Using the Supabase CLI, linked to the shared project (`supabase link --project-ref <shared-ref>`):

```
supabase secrets set NP_TELEGRAM_BOT_TOKEN=... NP_TELEGRAM_CHAT_ID=... NP_DIGEST_SECRET=<long random text>
supabase functions deploy ops-notify
supabase functions deploy ops-daily-digest --no-verify-jwt
```

The functions and secrets are prefixed (`ops-`, `NP_`) so they can't clash with your other projects. Then:
1. Enable `pg_cron` and `pg_net` under Database → Extensions.
2. Fill in your project ref and the digest secret in `supabase/daily_digest_schedule.sql`, and run it.
3. Check with **Settings → Send test message** in the operations app.

## 8. Check, then retire the old project

Before deleting the old project, check these in the operations app:
- you can log in with the admin PIN and a staff PIN;
- the brand portal works;
- garment photos show.

Old links (if any failed to copy) stop working once the old project is paused or deleted.

## 9. Lock it down (recommended, once everything works)

The accounts app must sign in with your **email** (Supabase Auth), not the username/password fallback.

Open `supabase/ops_lockdown.sql`, put your email on the marked line and run it. Then:

| Who | What they get |
|---|---|
| No login / anon key alone | nothing |
| Admin PIN | everything |
| Floor manager / worker | production data, but not logins, settings or accounts |
| Brand client | only their own orders and invoices |
| You (your email, in the accounts app) | everything |
| Users from your other projects in the same Supabase project | nothing from `ops` or `accounts_erp` |

If you already set your own rules on `accounts_erp` (`rls_single_user.sql`), they're kept. If you entered the wrong email, nothing changes and you get a message saying so. `ops_lockdown_undo.sql` reopens the ops tables, but keeps the accounts tables locked to you.

## Free-plan limits

Everything in the project shares 500 MB of database and 1 GB of file storage. The ops data is small. Photos are the big item, and the app shrinks them to about 200–400 KB before upload. The project stays awake as long as any of its apps is used each week.
