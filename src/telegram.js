// Sends a message to a Telegram chat via the Bot API. Configured via
// VITE_TELEGRAM_BOT_TOKEN and VITE_TELEGRAM_CHAT_ID — if either is missing,
// this silently does nothing, so the app works fine without Telegram set up.
//
// Note: since this runs in the browser, the bot token is visible in the
// compiled JS bundle to anyone who opens dev tools. That's an acceptable
// tradeoff for a bot whose only job is posting to one notifications chat —
// it can't read any of your app's data — but if you want the token fully
// hidden, move this call into a Supabase Edge Function instead.
export async function sendTelegramMessage(text) {
  const token = import.meta.env.VITE_TELEGRAM_BOT_TOKEN
  const chatId = import.meta.env.VITE_TELEGRAM_CHAT_ID
  if (!token || !chatId) return

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })
  } catch (err) {
    // Never let a notification failure block the actual order from being placed.
    console.error('Telegram notification failed:', err)
  }
}
