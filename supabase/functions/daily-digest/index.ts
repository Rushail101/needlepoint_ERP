// Evening summary to Telegram. Triggered by pg_cron (see supabase/daily_digest_schedule.sql)
// with the x-digest-secret header; reads with the service role.
import { cors, sendTelegram } from '../_shared.ts';

const IST = 5.5 * 3600 * 1000;
const istDate = (d = new Date()) => new Date(d.getTime() + IST).toISOString().slice(0, 10);
const LABEL: Record<string, string> = {
  cutting: 'Cutting', screen_printing: 'Printing', embroidery: 'Embroidery', stitching: 'Stitching', qc: 'QC',
  packing: 'Packing', alteration: 'Alteration', sampling: 'Sampling', sample_change: 'Sample change', other: 'Other',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const secret = Deno.env.get('DIGEST_SECRET');
  if (!secret || req.headers.get('x-digest-secret') !== secret) return new Response('Forbidden', { status: 403, headers: cors });

  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const get = async (path: string) => {
    const r = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    return r.ok ? await r.json() : [];
  };
  const today = istDate();
  const startUtc = new Date(new Date(`${today}T00:00:00+05:30`).getTime()).toISOString();
  const in3 = istDate(new Date(Date.now() + 3 * 86400000));

  const [logs, moves, ships, due, jobs] = await Promise.all([
    get(`work_logs?select=work_type,quantity,rejected_qty,employees(name)&logged_at=gte.${startUtc}`),
    get(`stage_history?select=stage,products(name,po_number)&changed_at=gte.${startUtc}`),
    get(`shipments?select=quantity,products(name,po_number)&dispatched_at=gte.${startUtc}`),
    get(`products?select=name,po_number,due_date,stage,status&due_date=lte.${in3}&stage=neq.packed&status=neq.completed&order=due_date`),
    get(`job_work?select=work_type,qty_sent,qty_returned,expected_back,vendors(name),products(name)&expected_back=lt.${today}`),
  ]);

  const byType: Record<string, number> = {};
  let rejected = 0;
  for (const l of logs) { byType[l.work_type] = (byType[l.work_type] || 0) + (l.quantity || 0); rejected += l.rejected_qty || 0; }
  const shipped = ships.reduce((s: number, x: any) => s + (x.quantity || 0), 0);
  const late = due.filter((p: any) => p.due_date < today);
  const soon = due.filter((p: any) => p.due_date >= today);
  const jobsOut = jobs.filter((j: any) => j.qty_returned < j.qty_sent);
  const name = (p: any) => `${p?.name ?? '?'}${p?.po_number ? ` (${p.po_number})` : ''}`;

  const lines = [
    `🧵 <b>Needle Point — ${new Date(`${today}T12:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</b>`,
    '',
    `<b>Work today</b>: ${logs.length ? Object.entries(byType).map(([k, v]) => `${LABEL[k] ?? k} ${v}`).join(' · ') : 'nothing logged'}${rejected ? ` · ❌ ${rejected} rejected` : ''}`,
    `<b>Dispatched</b>: ${shipped} pcs`,
    moves.length ? `<b>Stage moves</b>: ${moves.slice(0, 8).map((m: any) => `${name(m.products)} → ${m.stage}`).join('; ')}` : '',
    late.length ? `\n🔴 <b>Late (${late.length})</b>\n${late.slice(0, 8).map((p: any) => `• ${name(p)} — due ${p.due_date}, at ${p.stage}`).join('\n')}` : '',
    soon.length ? `\n🟠 <b>Due in 3 days (${soon.length})</b>\n${soon.slice(0, 8).map((p: any) => `• ${name(p)} — ${p.due_date}, at ${p.stage}`).join('\n')}` : '',
    jobsOut.length ? `\n🏭 <b>Job work overdue</b>\n${jobsOut.slice(0, 6).map((j: any) => `• ${j.vendors?.name ?? 'vendor'}: ${j.qty_sent - j.qty_returned} pcs ${j.products?.name ?? ''} (${LABEL[j.work_type] ?? j.work_type}, due ${j.expected_back})`).join('\n')}` : '',
  ].filter(Boolean);

  const res = await sendTelegram(lines.join('\n'));
  return new Response(JSON.stringify(res), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
