// Telegram bot webhook. Deploy:  supabase functions deploy ops-telegram-bot --no-verify-jwt
// Secrets: NP_TELEGRAM_BOT_TOKEN (same bot as the alerts), NP_TG_WEBHOOK_SECRET (any long random text).
// One-time setup: open  https://<project-ref>.supabase.co/functions/v1/ops-telegram-bot?setup=<NP_TG_WEBHOOK_SECRET>
// in a browser. That points Telegram at this function and saves the bot's username for the app.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleUpdate } from './bot.ts';
import { sendTelegram } from '../_shared.ts';

const TOKEN = Deno.env.get('NP_TELEGRAM_BOT_TOKEN') ?? '';
const SECRET = Deno.env.get('NP_TG_WEBHOOK_SECRET') ?? '';
const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const db = createClient(SB_URL, SB_KEY, { db: { schema: 'ops' }, auth: { persistSession: false } });
const acc = createClient(SB_URL, SB_KEY, { db: { schema: 'accounts_erp' }, auth: { persistSession: false } });

async function tg(method: string, body: unknown) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) console.warn(`telegram ${method} failed`, j.description);
  return j;
}

const page = (title: string, text: string, ok = true) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;max-width:560px;margin:40px auto;padding:0 16px">
   <h2>${ok ? '✅' : '⚠️'} ${title}</h2><p style="line-height:1.6">${text}</p></body>`,
  { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // ── one-time setup from a browser ──
  if (req.method === 'GET') {
    if (!TOKEN || !SECRET) return page('Secrets missing', 'Set NP_TELEGRAM_BOT_TOKEN and NP_TG_WEBHOOK_SECRET with <code>supabase secrets set</code>, then open this link again.', false);
    if (url.searchParams.get('setup') !== SECRET) return new Response('Not found', { status: 404 });
    const hook = `${SB_URL}/functions/v1/ops-telegram-bot`;
    const set = await tg('setWebhook', { url: hook, secret_token: SECRET, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
    if (!set.ok) return page('Telegram refused the webhook', String(set.description || 'Check NP_TELEGRAM_BOT_TOKEN.'), false);
    const me = await tg('getMe', {});
    const username = me?.result?.username || '';
    if (username) await db.from('ops_settings').upsert({ key: 'telegram_bot_username', value: username, updated_at: new Date().toISOString() });
    await tg('setMyCommands', { commands: [
      { command: 'menu', description: 'What can I do?' },
      { command: 'log', description: 'Log work' },
      { command: 'order', description: 'New order' },
      { command: 'cancel', description: 'Cancel what I was doing' },
    ] });
    return page('Bot connected', `@${username} now answers messages. Each person connects from the Needle Point app → <b>📲 Telegram</b>.`);
  }

  // ── updates from Telegram ──
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!SECRET || req.headers.get('x-telegram-bot-api-secret-token') !== SECRET) return new Response('Forbidden', { status: 403 });
  const update = await req.json().catch(() => null);
  if (!update) return new Response('ok');
  // "/log" and "/order" are shortcuts for the menu buttons
  const text = update.message?.text;
  if (typeof text === 'string') {
    if (/^\/log(@\w+)?$/i.test(text.trim())) update.callback_query = { id: '0', from: update.message.from, message: { chat: update.message.chat }, data: 'm:log' };
    if (/^\/order(@\w+)?$/i.test(text.trim())) update.callback_query = { id: '0', from: update.message.from, message: { chat: update.message.chat }, data: 'm:order' };
    if (update.callback_query) delete update.message;
  }
  await handleUpdate(update, { db, acc, tg, alert: (t: string) => sendTelegram(t, 'HTML') });
  return new Response('ok');
});
