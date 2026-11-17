import { supabase } from './supabaseClient.js'

// Sends a Telegram message through the `notify` Supabase Edge Function, which
// holds the bot token as a server-side secret. (The token used to sit in a
// VITE_ env var, i.e. inside the public website code, where anyone could
// take it and post to your group.) Fails quietly if the function isn't
// deployed, so the app works without Telegram.
export async function sendTelegramMessage(text, parseMode = 'HTML') {
  try {
    const { error } = await supabase.functions.invoke('ops-notify', { body: { text, parse_mode: parseMode } })
    if (error) console.warn('Telegram notify skipped:', error.message)
  } catch (err) {
    console.warn('Telegram notify skipped:', err?.message || err)
  }
}
