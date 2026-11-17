# Operations ERP — what changed

## Before you deploy

Follow **MOVE_GUIDE.md**. In short:
1. Run `ops_install.sql` in your invoice project and expose the `ops` schema.
2. Copy your data with `move/move-data.mjs`, then run the install again.
3. Run the accounts link SQL, point the app at the invoice project and deploy.
4. Match brands to parties.

Existing staff PINs and brand portal passwords keep working: they're converted to secure hashes.

## Moved into the shared project

- **Own schema and storage.** Everything lives in the `ops` schema and the `ops-photos` bucket. Nothing in `public` or your other schemas is touched, so the app can share your invoice project.
- **Function names can't clash.** The functions are now `ops-notify` and `ops-daily-digest`, and their secrets start with `NP_`.
- **Brands ↔ accounts parties:**
  - Each brand shows which client it's billed as.
  - A new brand can start from an existing Accounts client: details filled in, already linked.
  - Accounts has a Brand links screen with suggested matches.
- **The lockdown lets in only your own email,** not any signed-in user. That matters because users from your other projects share the same sign-in system.
- **Fixed:** the evening digest's work list failed because of an ambiguous team-member link.

## Faster record keeping (automation)

- **Work Log**
  - Quicker to fill in:
    - The garment list has search, recently used garments come first, and each garment shows a delivery badge.
    - Whoever is logged in is picked as the person automatically.
    - Size chips; +10 / +25 / +50 / "Rest N" quantity buttons.
    - "Save & log more" keeps you on the same garment.
  - **Stage moves by itself:**
    - Printing or stitching logged → that stage.
    - All pieces stitched → QC.
    - All pieces packed → Packed.
  - **QC rejections:** rejected count, reason, and who was responsible.
  - **Works offline:** entries (with photos) are saved on the phone and sent when the signal returns.
  - Photos are compressed before upload.
- **Every stage change is recorded with who changed it and when.** Each garment shows a timeline with days spent in each stage. The dashboard shows average days per stage.
- **Delivery dates:** on every order, defaulting to today plus the lead time set in Settings, and editable for a whole PO at once. Orders are flagged Late / At risk / Due soon automatically.
- **Evening Telegram digest at 8 pm:** pieces made, late orders, overdue job work, samples waiting.
- **Piece-rate pay:**
  - Mark an employee "per piece" and set rates in Settings.
  - Their pay is worked out from logged work, both in their summary and in Accounts → Payroll.

## New features

- **Home dashboard:**
  - Quick actions.
  - Needs-attention list, where each line opens the matching filtered list.
  - Due soon, pipeline, today's activity, QC rejections by maker.
- **Orders:** filter chips (In production / Late / At risk / Due this week / No delivery date), sorted by delivery date.
- **Garment page tabs:**
  - Progress: size-by-size ordered → stitched → QC passed → rejected → packed → dispatched, plus the stage timeline.
  - Sizes, Photos, Samples (approve / revise / reject), Work, Materials, Job Work.
- **Fabric & trims:** stock in, issue to an order, return. Shows live stock, usage per order and fabric used per piece.
- **Job work:** send pieces to outside vendors, receive them back (with rejects), see overdue batches, send a one-tap WhatsApp follow-up.
- **Settings (admin):** sample fee and GST, default lead time, piece rates, change admin PIN, Telegram test.
- **Phone layout:** bottom tab bar with a "More" sheet; toasts replace popup alerts.

## Security and bugs fixed

- **Admin PIN and Telegram token were in the public website code.** They are now checked or kept on the server.
- **PINs and portal passwords were stored in plain text and shown on screen.** They are now hashed, never shown, and set only through the server. Wrong guesses are throttled.
- **Floor-manager and worker logins had no permissions** because the role names didn't match. Fixed.
- **Anyone named "Admin" got admin rights.** Removed.
- **Pages were reachable by typing the URL even without permission.** Every route now checks the role.
- **Saves and deletes failed silently in many places.** Errors now show.
- **The Escape key closed every open dialog at once.** Now it closes only the top one.
- **The QR job card relied on an outside QR website.** It is now generated in the app.

## Notes

- `src/pages/Products.jsx` and `src/components/Layout.jsx` are no longer used; they can be deleted.
- The two Edge Functions compile but couldn't be run here (no Deno). Use **Settings → Send test message** after deploying.
- Old `schema.sql` and `migration_00x` files are replaced by `ops_install.sql`; they're in the patch/original repo if ever needed.
