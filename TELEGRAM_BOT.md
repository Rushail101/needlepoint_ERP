# Needle Point Telegram bot

Log work, move stages, record dispatches and add orders by chatting with a bot. You don't need order numbers. The bot finds orders by brand and garment name ("cayani tee"), or lists your active orders as buttons, most recently worked-on first.

## Set it up once (about 10 minutes)

You can use the same bot as your Telegram alerts. If you don't have one yet:
1. In Telegram, message **@BotFather** and send `/newbot`.
2. Pick a name.
3. Copy the token.

Then:

1. **SQL editor:** run `ADD_telegram_bot.sql`. It's already included if you set up from the latest `OPERATIONS_COMPLETE.sql` + `INVOICE_ERP_COMPLETE.sql`.
2. **Secrets and deploy**, using the Supabase CLI, linked to your project:
   ```
   supabase secrets set NP_TELEGRAM_BOT_TOKEN=<token> NP_TG_WEBHOOK_SECRET=<any long random text>
   supabase functions deploy ops-telegram-bot --no-verify-jwt
   ```
3. **Connect the bot to the function.** Open this link once in your browser:
   `https://<project-ref>.supabase.co/functions/v1/ops-telegram-bot?setup=<NP_TG_WEBHOOK_SECRET>`
   It should say "✅ Bot connected".
4. **Each person** opens the Needle Point app, taps **📲 Telegram** at the top, then **Open Telegram & connect**. On a phone that's one tap. Workers connect from their own login too.

Use the bot **one-to-one** (open a chat with it). In a group, Telegram only passes it `/commands` unless you turn off its privacy mode with @BotFather.

## What you can type

| Type this | It does |
|---|---|
| `cayani tee 40 stitched` | Logs stitching 40 on Cayani's tee. Asks the size if the garment has sizes |
| `boxy tee stitching m40 l20` | One entry per size |
| `hoodie checked 58, 2 rejected` | QC entry, then asks the reason for the rejects |
| `kite hats sent to embroidery` | Moves the stage |
| `move cayani hoodie to qc` | Moves the stage, and offers to move the whole PO |
| `cayani tee packed` | Stage → Packed |
| `urban jacket dispatched m30 l20` | Records a dispatch, with a warning if more than ordered |
| `new order` | Step-by-step: brand → PO (optional) → garment (from catalog or typed) → sizes `S20 M30 L10` → rate → GST → more garments → delivery date. Then **Create + proforma** |
| `menu` / `cancel` | Start over |

You can also tap **📋 Log work**, **🔁 Change stage**, **🚚 Dispatch** or **➕ New order** and pick everything from buttons.

How it handles your messages:
- **If two orders match** what you typed, it asks with buttons. It never guesses.
- **Logs, dispatches and orders show a summary first** and only save when you tap ✅. If you type something else instead, it tells you the earlier entry wasn't saved.
- **Logging work moves the stage on automatically**, the same as in the app. Every entry records who logged it ("via Telegram").

## Who can do what

- **Admin and floor managers:** everything above.
- **Workers:** log work only, recorded as themselves.
- **Strangers:** nothing. The bot only answers accounts connected with a code from the app.

Turning someone's login off under **Access** also stops their Telegram. **Settings → Telegram bot** lists who's connected, with a Disconnect button.
