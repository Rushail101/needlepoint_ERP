// Sends a message to a Telegram chat via the Bot API. Configured via
// VITE_TELEGRAM_BOT_TOKEN and VITE_TELEGRAM_CHAT_ID — if either is missing,
// this silently does nothing, so the app works fine without Telegram set up.
export async function sendTelegramMessage(text, parseMode = 'HTML') {
  const token = import.meta.env.VITE_TELEGRAM_BOT_TOKEN
  const chatId = import.meta.env.VITE_TELEGRAM_CHAT_ID
  if (!token || !chatId) return

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
      }),
    })
  } catch (err) {
    console.error('Telegram notification failed:', err)
  }
}
