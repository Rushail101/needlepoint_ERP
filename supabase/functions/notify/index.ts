// POST { text, parse_mode? } → Telegram. Only for logged-in staff/clients:
// the caller's session token is checked with ops_whoami().
import { cors, sendTelegram, rpcAsUser } from '../_shared.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const who = await rpcAsUser(req, 'ops_whoami');
  if (!who) return new Response(JSON.stringify({ error: 'Not logged in' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
  const { text, parse_mode } = await req.json().catch(() => ({}));
  if (!text) return new Response(JSON.stringify({ error: 'text required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  const res = await sendTelegram(String(text), parse_mode || 'HTML');
  return new Response(JSON.stringify(res), { status: res.ok ? 200 : 502, headers: { ...cors, 'Content-Type': 'application/json' } });
});
