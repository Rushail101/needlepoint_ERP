# Moving the operations app into your invoice project

The operations app moves into the Supabase project that already holds your accounts app (and your other projects). It gets its own schema, `ops`, and its own photo bucket, `ops-photos`. Nothing in `public`, `accounts_erp` or any other schema is touched. Once this works, the old operations project can be deleted.

About 20–30 minutes. "Shared project" below means your invoice project.

## 1. Create the `ops` schema

In the **shared project → SQL Editor**, open `supabase/ops_install.sql`, paste it in and run it.

Then go to **Project Settings → API → Exposed schemas** and add `ops`. Keep everything that's already listed (`public`, `accounts_erp`, your other schemas).

## 2. Set the admin PIN

In the SQL editor: `select ops.ops_bootstrap_admin('your-pin');`

## 3. Run the invoice-app SQL

Run `accounts_app/sql/INVOICE_ERP_COMPLETE.sql` (in the InvoiceAppV2 folder) in the shared project's SQL editor. It has every accounts update plus the link with operations, in one file.

## 4. Point the apps at the shared project and deploy

- **Operations app (Netlify/Vercel env):**
  - Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the shared project's values.
  - Delete `VITE_ADMIN_PIN`, `VITE_TELEGRAM_BOT_TOKEN` and `VITE_TELEGRAM_CHAT_ID`.
  - Redeploy.
- **Accounts app:** env unchanged (it's already on this project). Deploy the new version.

## 5. Import your old data (skip if starting fresh)

1. Open the new operations app and log in with the admin PIN.
2. Go to **Settings → Import from old project → Set up import**.
3. Paste the **old** project's URL and **anon public** key. That's the same pair the old app used as `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, also under Project Settings → API in the old project. If the old project is paused, click **Restore** on it first.
4. Press **Import** and keep the tab open until it says Done.

The import:
- copies every brand, order, size, team member, work log, dispatch and sample;
- copies the photos into `ops-photos` and updates their links;
- keeps the stage dates;
- re-sets staff PINs and brand portal passwords securely, so everyone logs in as before.

At the end it lists anything that needs your attention: a photo it couldn't copy, or a PIN that clashes with another one. It never changes the old project, and you can run it again safely.

**Do this before step 6.** The import refuses to run once the accounts setup is done, so brands don't get turned into parties automatically.

*(Alternative for large amounts of data: the command-line script `supabase/move/move-data.mjs`; instructions at the top of that file.)*

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
