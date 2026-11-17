// Shared helpers for the Edge Functions.
export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ops-token, x-digest-secret',
};

export async function sendTelegram(text: string, parseMode = 'HTML') {
  const token = Deno.env.get('NP_TELEGRAM_BOT_TOKEN');
  const chat = Deno.env.get('NP_TELEGRAM_CHAT_ID');
  if (!token || !chat) return { ok: false, reason: 'NP_TELEGRAM_BOT_TOKEN / NP_TELEGRAM_CHAT_ID not set' };
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000), parse_mode: parseMode, disable_web_page_preview: true }),
  });
  return { ok: r.ok, reason: r.ok ? '' : await r.text() };
}

// Calls a Postgres function as the logged-in app user (their x-ops-token).
export async function rpcAsUser(req: Request, fn: string, args: Record<string, unknown> = {}) {
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json', 'Content-Profile': 'ops', 'x-ops-token': req.headers.get('x-ops-token') ?? '' },
    body: JSON.stringify(args),
  });
  return r.ok ? await r.json() : null;
}
