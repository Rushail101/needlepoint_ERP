// Needle Point Telegram bot — conversation logic.
//
// Everything works by tapping buttons or typing short messages like
// "cayani tee 40 stitched", "kite hats sent to embroidery", "urban jacket
// dispatched m30 l20". No order numbers needed: orders are found by brand +
// garment name, or picked from buttons (most recently worked-on first).
//
// ctx.db  = supabase-js client on schema `ops` (service role)
// ctx.acc = supabase-js client on schema `accounts_erp` (service role)
// ctx.tg(method, body) calls the Telegram Bot API; ctx.alert(text) posts to the team group.

// ── shared tables (same as the app) ───────────────────────────────────────
export const WORK_TYPES = [
  ['cutting', 'Cutting', '✂️'], ['screen_printing', 'Screen printing', '🖨️'], ['embroidery', 'Embroidery', '🧵'],
  ['stitching', 'Stitching', '🪡'], ['qc', 'QC check', '🔍'], ['packing', 'Packing', '📦'],
  ['alteration', 'Alteration / rework', '🔧'], ['sampling', 'Sampling', '🧪'], ['other', 'Other', '📌'],
] as const;
const WORK_LABEL: Record<string, string> = Object.fromEntries(WORK_TYPES.map(w => [w[0], w[1]]));
export const STAGES = [['cutting', 'Cutting'], ['printing_embroidery', 'Printing/Embroidery'], ['stitching', 'Stitching'], ['qc', 'QC'], ['packed', 'Packed']] as const;
const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGES.map(s => [s[0], s[1]]));
const REJECT_REASONS = ['Stitching defect', 'Print / embroidery defect', 'Measurement off', 'Fabric fault', 'Stain / dirty', 'Wrong colour / trim', 'Other'];

// ── words people actually type ────────────────────────────────────────────
const WORK_WORDS: Record<string, string> = {
  cut: 'cutting', cutting: 'cutting', cuts: 'cutting',
  print: 'screen_printing', printing: 'screen_printing', printed: 'screen_printing', screen: 'screen_printing',
  emb: 'embroidery', embroidery: 'embroidery', embroidered: 'embroidery', embroid: 'embroidery', embro: 'embroidery',
  stitch: 'stitching', stitched: 'stitching', stitching: 'stitching', sewn: 'stitching', sewing: 'stitching', silai: 'stitching',
  qc: 'qc', check: 'qc', checked: 'qc', checking: 'qc',
  pack: 'packing', packed: 'packing', packing: 'packing',
  alter: 'alteration', alteration: 'alteration', rework: 'alteration', repair: 'alteration',
  sample: 'sampling', sampling: 'sampling',
};
const STAGE_WORDS: Record<string, string> = {
  cut: 'cutting', cutting: 'cutting',
  print: 'printing_embroidery', printing: 'printing_embroidery', screen: 'printing_embroidery', emb: 'printing_embroidery', embroidery: 'printing_embroidery', embro: 'printing_embroidery',
  stitch: 'stitching', stitching: 'stitching', silai: 'stitching',
  qc: 'qc', check: 'qc', checking: 'qc',
  packed: 'packed', pack: 'packed', packing: 'packed', ready: 'packed',
};
const DISPATCH_WORDS = new Set(['dispatch', 'dispatched', 'shipped', 'ship', 'delivered', 'deliver', 'delivery', 'sent', 'send', 'out']);
const MOVE_WORDS = new Set(['move', 'moved', 'moving', 'stage', 'to', 'into', 'now', 'gone', 'went', 'sent', 'send']);
const STOP = new Set(['pcs', 'pc', 'piece', 'pieces', 'nos', 'no', 'done', 'today', 'of', 'the', 'for', 'and', 'in', 'on', 'by', 'more',
  'qty', 'units', 'unit', 'from', 'we', 'have', 'has', 'been', 'is', 'are', 'a', 'an', 'total', 'order', 'orders', 'got', 'get',
  'please', 'pls', 'ok', 'okay', 'it', 'its', 'with', 'size', 'sizes', 'at', 'all', 'po', 'complete', 'completed', 'finished', 'only']);
const SIZE_RE = /^(xxs|xs|s|m|l|xl|xxl|xxxl|2xl|3xl|4xl|5xl|free|fs)$/;

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inr = (n: unknown) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const normSize = (s: string) => { const u = s.toUpperCase(); return u === 'FS' ? 'FREE' : u; };
const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL', '5XL', 'FREE'];
export const sortSizes = (keys: string[]) => [...keys].sort((a, z) => {
  const ia = SIZE_ORDER.indexOf(a.toUpperCase()), iz = SIZE_ORDER.indexOf(z.toUpperCase());
  if (ia >= 0 && iz >= 0) return ia - iz; if (ia >= 0) return -1; if (iz >= 0) return 1;
  return a.localeCompare(z, undefined, { numeric: true });
});
const sizeEntries = (m: Record<string, number>) => sortSizes(Object.keys(m || {})).map(k => [k, m[k]] as [string, number]);
const words = (s: unknown) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

// ── message parsing ───────────────────────────────────────────────────────
export function parseText(text: string) {
  const raw = String(text || '').toLowerCase().replace(/[,;]+/g, ' ');
  const toks = raw.split(/\s+/).filter(Boolean).map(t => t.replace(/[^a-z0-9:\-=]/g, '')).filter(Boolean);
  const sizes: Record<string, number> = {};
  const nums: number[] = [];
  const rest: string[] = [];
  let work: string | null = null, stage: string | null = null, dispatch = false, move = false, rejected: number | null = null, loneSize: string | null = null;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    let m;
    if ((m = t.match(/^([a-z0-9]+?)[:\-=]?(\d+)$/)) && SIZE_RE.test(m[1])) { sizes[normSize(m[1])] = (sizes[normSize(m[1])] || 0) + Number(m[2]); continue; }   // m30 m:30 m-30
    if ((m = t.match(/^(\d+)[:\-=]?([a-z0-9]+)$/)) && SIZE_RE.test(m[2]) && !/^\d+$/.test(m[2])) { sizes[normSize(m[2])] = (sizes[normSize(m[2])] || 0) + Number(m[1]); continue; } // 30m
    if (SIZE_RE.test(t) && /^\d+$/.test(toks[i + 1] || '')) { sizes[normSize(t)] = (sizes[normSize(t)] || 0) + Number(toks[i + 1]); i++; continue; } // m 30
    if (/^(rej|reject|rejected|rejects|defect|defects)$/.test(t) && /^\d+$/.test(toks[i + 1] || '')) { rejected = Number(toks[i + 1]); i++; continue; }
    if (/^\d+$/.test(t)) {
      // 5 rejected  (but in 45 rejected 5, the 5 after is the rejected count)
      if (/^(rej|reject|rejected|rejects|defect|defects)$/.test(toks[i + 1] || '') && !/^\d+$/.test(toks[i + 2] || '')) { rejected = Number(t); i++; continue; }
      nums.push(Number(t)); continue;
    }
    if (SIZE_RE.test(t)) { loneSize = normSize(t); continue; }   // e.g. 40 m
    const bare = t.replace(/[^a-z0-9]/g, '');
    if (!bare) continue;
    if (DISPATCH_WORDS.has(bare)) { dispatch = true; if (bare === 'sent' || bare === 'send') move = true; continue; }
    if (MOVE_WORDS.has(bare)) { move = true; continue; }
    let used = false;
    if (WORK_WORDS[bare]) { work = work || WORK_WORDS[bare]; used = true; }
    if (STAGE_WORDS[bare]) { stage = STAGE_WORDS[bare]; used = true; }
    if (used) continue;
    if (STOP.has(bare)) continue;
    rest.push(bare);
  }
  if (loneSize && !Object.keys(sizes).length && nums.length) sizes[loneSize] = nums.shift() as number;
  const sizeTotal = Object.values(sizes).reduce((a, b) => a + b, 0);
  const qty = sizeTotal || (nums.length ? nums[0] : null);
  // what does the person want?
  let intent: 'log' | 'dispatch' | 'stage' | 'order' | 'menu' | null = null;
  if (/^\/?(new\s*order|add\s*order|order)\b/.test(raw.trim())) intent = 'order';
  else if (/^\/?(menu|start|help|hi|hello|hey)\b/.test(raw.trim())) intent = 'menu';
  else if (dispatch && !(move && stage) && !work) intent = 'dispatch';
  else if (dispatch && !stage && !work) intent = 'dispatch';
  else if (stage && qty == null && (move || !work || ['packed', 'ready'].some(w => raw.includes(w)))) intent = 'stage';
  else if (work || qty != null) intent = 'log';
  else if (stage) intent = 'stage';
  return { intent, work, stage, sizes: sizeTotal ? sizes : null, qty, rejected, terms: rest };
}

// Score garments against the words someone typed (brand, garment name, style, PO).
export function matchProducts(products: any[], terms: string[]) {
  if (!terms.length) return [];
  const scored = products.map(p => {
    const hay = [...words(p.brand_name), ...words(p.name), ...words(p.style_code), ...words(p.po_number)];
    let score = 0;
    for (const t of terms) {
      if (hay.some(h => h === t || (t.length >= 2 && h.startsWith(t)) || (h.length >= 3 && t.startsWith(h)))) score++;
    }
    return { p, score };
  }).filter(x => x.score > 0);
  if (!scored.length) return [];
  const best = Math.max(...scored.map(x => x.score));
  return scored.filter(x => x.score === best).map(x => x.p);
}

export function parseSizeList(text: string): Record<string, number> | null {
  const p = parseText(text);
  if (p.sizes) return p.sizes;
  const n = String(text).trim().match(/^(\d+)$/);
  return n ? { FREE: Number(n[1]) } : null;
}

export function parseDate(text: string, today: Date): string | null {
  const t = String(text || '').trim().toLowerCase();
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  let d: number | null = null, m: number | null = null, y: number | null = null, x;
  if ((x = t.match(/^(?:in\s*)?(\d{1,3})\s*(?:d|day|days)$/))) { const r = new Date(today); r.setDate(r.getDate() + +x[1]); return iso(r); }
  if ((x = t.match(/^(\d{1,2})[\/\-. ](\d{1,2})(?:[\/\-. ](\d{2,4}))?$/))) { d = +x[1]; m = +x[2]; y = x[3] ? +x[3] : null; }
  else if ((x = t.match(/^(\d{1,2})\s*([a-z]{3})[a-z]*\s*(\d{2,4})?$/))) { d = +x[1]; m = months.indexOf(x[2]) + 1; y = x[3] ? +x[3] : null; }
  else if ((x = t.match(/^([a-z]{3})[a-z]*\s*(\d{1,2})(?:\s+(\d{2,4}))?$/))) { m = months.indexOf(x[1]) + 1; d = +x[2]; y = x[3] ? +x[3] : null; }
  if (!d || !m || m < 1 || m > 12 || d > 31) return null;
  if (y != null && y < 100) y += 2000;
  let r = new Date(y ?? today.getFullYear(), m - 1, d);
  if (y == null && r < new Date(today.getFullYear(), today.getMonth(), today.getDate())) r = new Date(today.getFullYear() + 1, m - 1, d);
  if (r.getDate() !== d || r.getMonth() !== m - 1) return null;   // e.g. 31 Feb
  return iso(r);
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtDay = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export function suggestedStage(stage: string, sizes: any[], logs: any[]) {
  const order = STAGES.map(s => s[0] as string);
  const ordered = sizes.reduce((s, x) => s + (Number(x.quantity) || 0), 0);
  const sum = (t: string) => logs.filter(l => l.work_type === t).reduce((s, l) => s + (Number(l.quantity) || 0), 0);
  let target = 'cutting';
  if (sum('screen_printing') + sum('embroidery') > 0) target = 'printing_embroidery';
  if (sum('stitching') > 0) target = 'stitching';
  if (ordered > 0 && sum('stitching') >= ordered) target = 'qc';
  if (ordered > 0 && sum('packing') >= ordered) target = 'packed';
  return order.indexOf(target) > order.indexOf(stage || 'cutting') ? target : null;
}

// ── the bot ───────────────────────────────────────────────────────────────
type Btn = { text: string; callback_data: string };
const rows = (btns: Btn[], per = 2) => { const out: Btn[][] = []; for (let i = 0; i < btns.length; i += per) out.push(btns.slice(i, i + per)); return out; };
const b = (text: string, data: string): Btn => ({ text, callback_data: data });
const PAGE = 8;

export async function handleUpdate(update: any, ctx: any) {
  const msg = update.message || update.edited_message;
  const cb = update.callback_query;
  const from = (cb || msg)?.from;
  const chatId = cb ? cb.message?.chat?.id : msg?.chat?.id;
  if (!from || chatId == null) return;
  const bot = new Bot(ctx, chatId, from);
  try {
    if (cb) {
      await ctx.tg('answerCallbackQuery', { callback_query_id: cb.id }).catch(() => {});
      if (cb.message?.message_id) await ctx.tg('editMessageReplyMarkup', { chat_id: chatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
      await bot.onButton(String(cb.data || ''));
    } else if (typeof msg?.text === 'string') {
      await bot.onText(msg.text.trim());
    } else if (msg) {
      await bot.say('I can read text and buttons. Type <b>menu</b> to start.');
    }
  } catch (e: any) {
    console.error(e);
    await bot.say(`⚠️ Something went wrong: ${esc(e?.message || e)}\nType <b>menu</b> to start again.`);
  }
}

class Bot {
  ctx: any; chatId: number; from: any; key: string; user: any = null; st: any = {};
  constructor(ctx: any, chatId: number, from: any) { this.ctx = ctx; this.chatId = chatId; this.from = from; this.key = `${chatId}:${from.id}`; }
  get db() { return this.ctx.db; }
  now() { return this.ctx.now ? this.ctx.now() : new Date(); }

  async say(text: string, buttons?: Btn[][]) {
    return this.ctx.tg('sendMessage', { chat_id: this.chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...(buttons?.length ? { reply_markup: { inline_keyboard: buttons } } : {}) });
  }
  async alert(text: string) { try { await this.ctx.alert?.(text); } catch (_) { /* alerts are best-effort */ } }
  async load() { const { data } = await this.db.from('telegram_chats').select('state').eq('chat_key', this.key).maybeSingle(); this.st = data?.state || {}; }
  async save() { await this.db.from('telegram_chats').upsert({ chat_key: this.key, state: this.st, updated_at: new Date().toISOString() }); }
  async reset() { this.st = {}; await this.save(); }

  async auth() {
    const { data: u } = await this.db.from('telegram_users').select('*').eq('tg_user_id', this.from.id).eq('active', true).maybeSingle();
    if (!u) return false;
    if (u.access_pin_id) {
      const { data: pin } = await this.db.from('access_pins').select('active,name,role,employee_id').eq('id', u.access_pin_id).maybeSingle();
      if (!pin || pin.active === false) return false;
    }
    this.user = u;
    return true;
  }
  isStaff() { return ['admin', 'manager'].includes(this.user?.role); }

  // ── entry points ──
  async onText(text: string) {
    const link = text.match(/^\/(?:start|link)(?:@\w+)?\s+(\d{6})\b/);
    if (link) return this.linkAccount(link[1]);
    if (!(await this.auth())) {
      return this.say('👋 Hi! This bot is for the Needle Point team.\nTo connect: open the Needle Point app → <b>📲 Telegram</b> → <b>Connect</b>, then send the code here.');
    }
    await this.load();
    const lower = text.toLowerCase().replace(/^\//, '').replace(/@\w+$/, '');
    if (/^(cancel|stop|exit|quit|x)$/.test(lower)) { await this.reset(); return this.say('Cancelled.', this.menuButtons()); }
    if (this.st.await) return this.onTyped(text);
    if (this.st.confirm) { await this.reset(); await this.say('ℹ️ The entry above was <b>not saved</b> (you didn\'t tap Save). Starting on your new message.'); }
    return this.onFreeText(text);
  }

  async onButton(data: string) {
    if (!(await this.auth())) return this.say('This Telegram account isn\'t connected. Open the app → 📲 Telegram → Connect.');
    await this.load();
    if (data === 'menu') { await this.reset(); return this.menu(); }
    if (data === 'x') { await this.reset(); return this.say('Cancelled. Nothing was saved.', this.menuButtons()); }
    if (data.startsWith('m:')) { await this.reset(); return this.start(data.slice(2)); }
    if (/^do:(log|stage|dispatch)$/.test(data)) { const pid = this.st.d?.pid; await this.reset(); return this.start(data.slice(3), pid ? { pid } : {}); }
    if (data.startsWith('again:')) { this.st = { flow: 'log', d: { pid: data.slice(6) } }; return this.logNext(); }
    if (!this.st.flow) return this.say('That menu has expired.', this.menuButtons());
    const [k, v] = data.split(':');
    const f = this.st.flow;
    if (k === 'g') return v === 'more' ? this.pickGarment(this.st.query, (this.st.page || 0) + 1) : this.garmentChosen(this.st.opts?.[Number(v)]);
    if (f === 'log') return this.logButton(k, v);
    if (f === 'dispatch') return this.dispatchButton(k, v);
    if (f === 'stage') return this.stageButton(k, v);
    if (f === 'order') return this.orderButton(k, v);
  }

  menuButtons() {
    const r = [[b('📋 Log work', 'm:log')]];
    if (this.isStaff()) r.push([b('🔁 Change stage', 'm:stage'), b('🚚 Dispatch', 'm:dispatch')], [b('➕ New order', 'm:order')]);
    return r;
  }
  async menu(note = '') {
    return this.say(`${note ? note + '\n\n' : ''}What would you like to do, ${esc(this.user.name)}?\n\n<i>Tip: you can also just type, e.g.</i>\n<code>cayani tee 40 stitched</code>\n<code>kite hats to embroidery</code>${this.isStaff() ? '\n<code>urban jacket dispatched m30 l20</code>\n<code>new order</code>' : ''}`, this.menuButtons());
  }

  async start(flow: string, preset: any = {}) {
    if (flow !== 'log' && !this.isStaff()) return this.say('Only the admin or a floor manager can do that from Telegram. You can log work.', this.menuButtons());
    this.st = { flow, d: { ...preset } };
    if (flow === 'order') return this.orderNext();
    if (this.st.d.pid) return this.next();
    return this.pickGarment();
  }

  // ── garments ──
  async activeProducts() {
    const [{ data: prods }, { data: logs }] = await Promise.all([
      this.db.from('products').select('id,name,style_code,po_number,stage,status,brand_id,created_at,due_date,brands(name)').neq('status', 'completed').neq('status', 'on_hold').order('created_at', { ascending: false }).limit(300),
      this.db.from('work_logs').select('product_id,logged_at').order('logged_at', { ascending: false }).limit(400),
    ]);
    const recent = new Map<string, number>();
    (logs || []).forEach((l: any, i: number) => { if (!recent.has(l.product_id)) recent.set(l.product_id, i); });
    return (prods || []).map((p: any) => ({ ...p, brand_name: p.brands?.name || '' }))
      .sort((a: any, z: any) => (recent.get(a.id) ?? 1e9) - (recent.get(z.id) ?? 1e9) || String(z.created_at).localeCompare(String(a.created_at)));
  }
  label(p: any) { return `${p.brand_name ? p.brand_name + ' · ' : ''}${p.name}${p.po_number ? ` (${p.po_number})` : ''}`.slice(0, 60); }

  async pickGarment(query: string | null = null, page = 0) {
    const all = await this.activeProducts();
    const list = query ? matchProducts(all, words(query).filter(w => !STOP.has(w))) : all;
    if (!list.length) {
      this.st.await = 'garment'; this.st.query = null; await this.save();
      return this.say(query ? `No active garment matches “${esc(query)}”. Type another name, or tap Cancel.` : 'There are no active orders right now.', [[b('✖ Cancel', 'x')]]);
    }
    const slice = list.slice(page * PAGE, page * PAGE + PAGE);
    this.st.opts = slice.map((p: any) => p.id); this.st.page = page; this.st.query = query; this.st.await = 'garment';
    await this.save();
    const btns = slice.map((p: any, i: number) => b(this.label(p), `g:${i}`));
    const kb = rows(btns, 1);
    if (list.length > (page + 1) * PAGE) kb.push([b('More ▸', 'g:more')]);
    kb.push([b('✖ Cancel', 'x')]);
    return this.say(`${query ? 'Matching garments' : 'Which garment?'}${page ? ` (page ${page + 1})` : ''}\n<i>Or type part of the brand or garment name.</i>`, kb);
  }

  async product(pid: string) {
    const [{ data: p }, { data: sizes }] = await Promise.all([
      this.db.from('products').select('*, brands(name)').eq('id', pid).maybeSingle(),
      this.db.from('product_sizes').select('size_label,quantity').eq('product_id', pid),
    ]);
    if (!p) return null;
    const bySize: Record<string, number> = {};
    (sizes || []).forEach((s: any) => { const k = (s.size_label || '').toUpperCase(); bySize[k] = (bySize[k] || 0) + Number(s.quantity || 0); });
    return { ...p, brand_name: p.brands?.name || '', sizes: sizes || [], bySize, ordered: Object.values(bySize).reduce((a: number, c: number) => a + c, 0) };
  }

  async garmentChosen(pid: string | undefined) {
    if (!pid) return this.say('That list has expired.', this.menuButtons());
    this.st.d.pid = pid; this.st.await = null;
    return this.next();
  }

  async next() {
    const f = this.st.flow;
    if (f === 'log') return this.logNext();
    if (f === 'dispatch') return this.dispatchNext();
    if (f === 'stage') return this.stageNext();
  }

  // ── free text: "cayani tee 40 stitched" ──
  async onFreeText(text: string) {
    const p = parseText(text);
    if (p.intent === 'menu' || (!p.intent && !p.terms.length)) return this.menu();
    if (p.intent === 'order') return this.start('order');
    const all = await this.activeProducts();
    const found = matchProducts(all, p.terms);
    const preset: any = {};
    if (p.work) preset.work = p.work;
    if (p.sizes) preset.sizes = p.sizes;
    else if (p.qty != null) preset.qty = p.qty;
    if (p.rejected != null) preset.rej = p.rejected;
    if (p.stage) preset.stage = p.stage;
    let intent = p.intent;
    if (!intent) {
      if (!found.length) return this.menu(`I couldn't tell what “${esc(text)}” means.`);
      intent = null as any;
    }
    if (intent && intent !== 'log' && !this.isStaff()) return this.say('From Telegram you can log work. Ask the admin or floor manager for dispatches and stage changes.', this.menuButtons());
    if (found.length === 1) preset.pid = found[0].id;
    if (!intent) {
      // only a garment named: ask what to do
      this.st = { flow: 'ask', d: { pid: found.length === 1 ? found[0].id : null } };
      if (found.length !== 1) return this.ambiguous(found, preset, 'log');
      await this.save();
      return this.say(`<b>${esc(this.label(found[0]))}</b>: what happened?`, this.isStaff() ? [[b('📋 Log work', 'do:log')], [b('🔁 Change stage', 'do:stage'), b('🚚 Dispatch', 'do:dispatch')], [b('✖ Cancel', 'x')]] : [[b('📋 Log work', 'do:log')], [b('✖ Cancel', 'x')]]);
    }
    this.st = { flow: intent, d: preset };
    if (!preset.pid) {
      if (found.length > 1) return this.ambiguous(found, preset, intent);
      if (p.terms.length) { await this.save(); return this.pickGarment(p.terms.join(' ')); }
      return this.pickGarment();
    }
    return this.next();
  }

  async ambiguous(found: any[], preset: any, flow: string) {
    this.st = { flow, d: preset, opts: found.slice(0, PAGE).map((p: any) => p.id), page: 0, await: 'garment' };
    await this.save();
    const kb = rows(found.slice(0, PAGE).map((p: any, i: number) => b(this.label(p), `g:${i}`)), 1);
    kb.push([b('✖ Cancel', 'x')]);
    return this.say('Which one?', kb);
  }

  // typed answer to the current question
  async onTyped(text: string) {
    const a = this.st.await;
    if (this.looksLikeNewCommand(a, text)) { await this.reset(); return this.onFreeText(text); }
    if (a === 'garment') return this.pickGarment(text);
    if (this.st.flow === 'log') return this.logTyped(a, text);
    if (this.st.flow === 'dispatch') return this.dispatchTyped(a, text);
    if (this.st.flow === 'order') return this.orderTyped(a, text);
    return this.onFreeText(text);
  }

  // While a question is open, is this message an answer or a fresh instruction?
  looksLikeNewCommand(a: string, text: string) {
    const t = text.trim().toLowerCase();
    if (/^\/?(menu|start|help|new\s*order|add\s*order|order|log|dispatch)\b/.test(t)) return true;
    const p = parseText(text);
    const instruction = p.terms.length > 0 && (p.work || p.stage || p.intent === 'dispatch' || p.intent === 'order');
    if (['size', 'qty', 'rej', 'dqty', 'dsizes'].includes(a)) return p.terms.length > 0 || !!instruction;   // answers are just sizes / numbers
    if (a === 'garment') return !!instruction;                                                              // "cayani tee 40 stitched" while picking
    return false;                                                                                           // names, PO numbers, rates, dates are free text
  }

  // ══ LOG WORK ═════════════════════════════════════════════════════════════
  async logNext() {
    const d = this.st.d;
    const p = await this.product(d.pid);
    if (!p) { await this.reset(); return this.say('That garment no longer exists.', this.menuButtons()); }
    if (!d.work) {
      this.st.await = null; await this.save();
      return this.say(`<b>${esc(this.label(p))}</b>\nWhat work was done?`, [...rows(WORK_TYPES.map(w => b(`${w[2]} ${w[1]}`, `w:${w[0]}`)), 2), [b('✖ Cancel', 'x')]]);
    }
    const sizeKeys = sortSizes(Object.keys(p.bySize).filter(k => k));
    if (!d.sizes && d.size === undefined && sizeKeys.length === 1) d.size = sizeKeys[0];
    if (!d.sizes && d.size === undefined && sizeKeys.length > 0) {
      this.st.sizeOpts = sizeKeys; this.st.await = 'size'; await this.save();
      return this.say(`<b>${esc(WORK_LABEL[d.work])}</b>${d.qty ? ` · ${d.qty} pcs` : ''}: which size?\n<i>Or type several, e.g. M40 L20</i>`,
        [...rows(sizeKeys.map((k, i) => b(`${k} (${p.bySize[k]})`, `z:${i}`)), 4), [b('All / mixed sizes', 'z:none')], [b('✖ Cancel', 'x')]]);
    }
    if (!d.sizes && d.qty == null) {
      const logs = await this.logsFor(p.id);
      const ord = d.size ? (p.bySize[d.size] || 0) : p.ordered;
      const done = logs.filter((l: any) => l.work_type === d.work && (!d.size || (l.size_label || '').toUpperCase() === d.size)).reduce((s: number, l: any) => s + Number(l.quantity || 0), 0);
      const rest = Math.max(0, ord - done);
      this.st.await = 'qty'; await this.save();
      const quick = [10, 25, 50].map(n => b(String(n), `q:${n}`));
      if (rest > 0 && ![10, 25, 50].includes(rest)) quick.push(b(`Rest ${rest}`, `q:${rest}`));
      return this.say(`How many pieces${d.size ? ` of <b>${esc(d.size)}</b>` : ''}? Type a number.${ord ? `\n<i>${done} of ${ord} already logged for ${esc(WORK_LABEL[d.work].toLowerCase())}.</i>` : ''}`, [quick, [b('✖ Cancel', 'x')]]);
    }
    if (d.work === 'qc' && d.rej == null) {
      this.st.await = 'rej'; await this.save();
      return this.say('Any pieces rejected in QC? Type how many, or tap None.', [[b('None', 'r:0')], [b('✖ Cancel', 'x')]]);
    }
    if (d.work === 'qc' && d.rej > 0 && !d.reason) {
      this.st.await = null; await this.save();
      return this.say(`Why were the ${d.rej} rejected?`, [...rows(REJECT_REASONS.map((r, i) => b(r, `rr:${i}`)), 2), [b('✖ Cancel', 'x')]]);
    }
    if (d.emp === undefined) {
      if (this.user.role === 'tailor' || this.user.employee_id) d.emp = this.user.employee_id || null;
      if (this.user.role === 'tailor' && !d.emp) { await this.reset(); return this.say('Your login isn\'t linked to a team member yet. Ask the admin to link it under Access.'); }
      if (d.emp === undefined) return this.askPerson();
    }
    return this.logConfirm(p);
  }

  async askPerson() {
    const { data: emps } = await this.db.from('employees').select('id,name').eq('active', true).order('name');
    this.st.people = (emps || []).map((e: any) => e.id); this.st.await = null; await this.save();
    return this.say('Who did the work?', [...rows((emps || []).map((e: any, i: number) => b(e.name, `p:${i}`)), 3), [b('Not one person / skip', 'p:none')], [b('✖ Cancel', 'x')]]);
  }

  async logsFor(pid: string) { const { data } = await this.db.from('work_logs').select('work_type,quantity,size_label').eq('product_id', pid); return data || []; }

  async logConfirm(p: any) {
    const d = this.st.d;
    let who = 'no one in particular';
    if (d.emp) { const { data: e } = await this.db.from('employees').select('name').eq('id', d.emp).maybeSingle(); who = e?.name || '?'; }
    const qtyText = d.sizes ? sizeEntries(d.sizes).map(([k, v]) => `${k}×${v}`).join(', ') + ` (${Object.values(d.sizes).reduce((a: any, c: any) => a + c, 0)} pcs)` : `${d.qty} pcs${d.size ? ` (${d.size})` : ''}`;
    this.st.await = null; this.st.confirm = true; await this.save();
    return this.say(`Save this?\n\n<b>${esc(this.label(p))}</b>\n${esc(WORK_LABEL[d.work])}: <b>${esc(qtyText)}</b>${d.rej ? `\nRejected: ${d.rej} (${esc(d.reason || '')})` : ''}\nBy: ${esc(who)}`,
      [[b('✅ Save', 'ok'), b('👤 Change person', 'who')], [b('✖ Cancel', 'x')]]);
  }

  async logButton(k: string, v: string) {
    const d = this.st.d;
    if (k === 'w') { d.work = v; return this.logNext(); }
    if (k === 'z') { if (v === 'none') d.size = null; else d.size = this.st.sizeOpts?.[Number(v)] ?? null; return this.logNext(); }
    if (k === 'q') { d.qty = Number(v); return this.logNext(); }
    if (k === 'r') { d.rej = Number(v); return this.logNext(); }
    if (k === 'rr') { d.reason = REJECT_REASONS[Number(v)]; return this.logNext(); }
    if (k === 'p') { d.emp = v === 'none' ? null : this.st.people?.[Number(v)] ?? null; return this.logNext(); }
    if (k === 'who') { delete d.emp; return this.askPerson(); }
    if (k === 'ok') return this.logSave();
  }

  async logTyped(a: string, text: string) {
    const d = this.st.d;
    if (a === 'size') {
      const s = parseSizeList(text);
      if (s && !s.FREE) { d.sizes = s; return this.logNext(); }
      const one = text.trim().toUpperCase();
      if (this.st.sizeOpts?.includes(one)) { d.size = one; return this.logNext(); }
      return this.say('Tap a size, or type like <code>M40 L20</code>.');
    }
    if (a === 'qty' || a === 'rej') {
      const n = text.match(/\d+/);
      if (!n) return this.say('Please type a number.');
      if (a === 'qty') d.qty = Number(n[0]); else d.rej = Number(n[0]);
      return this.logNext();
    }
    return this.onFreeText(text);
  }

  async logSave() {
    const d = this.st.d;
    if (!this.st.confirm) return this.logNext();
    const p = await this.product(d.pid);
    const entries: [string | null, number][] = d.sizes ? sizeEntries(d.sizes) : [[d.size || null, Number(d.qty)]];
    const rowsToSave = entries.filter(([, q]) => q > 0).map(([size, q], i) => ({
      product_id: d.pid, employee_id: d.emp || null, work_type: d.work, quantity: q, size_label: size,
      rejected_qty: i === 0 && d.rej ? d.rej : null, reject_reason: i === 0 && d.rej ? d.reason || null : null,
      logged_by: this.user.name, notes: 'via Telegram',
    }));
    const { error } = await this.db.from('work_logs').insert(rowsToSave);
    if (error) throw new Error(error.message);
    // move the stage on, same rule as the app
    const logs = await this.logsFor(d.pid);
    const nextStage = suggestedStage(p.stage, p.sizes, logs);
    let moved = '';
    if (nextStage) { await this.setStage(d.pid, nextStage); moved = `\n➡️ Moved to <b>${STAGE_LABEL[nextStage]}</b>`; }
    const total = rowsToSave.reduce((s, r) => s + r.quantity, 0);
    this.st = { flow: 'log', d: { pid: d.pid } }; await this.save();
    return this.say(`✅ Saved: ${esc(WORK_LABEL[d.work])} ${total} pcs on <b>${esc(this.label(p))}</b>${moved}`,
      [[b('➕ More on this garment', `again:${d.pid}`)], [b('📋 Another garment', 'm:log'), b('🏠 Menu', 'menu')]]);
  }

  async setStage(pid: string, stage: string) {
    const { error } = await this.db.from('products').update({ stage }).eq('id', pid);
    if (error) throw new Error(error.message);
    // the database records the change; note who did it
    const since = new Date(Date.now() - 120000).toISOString();
    await this.db.from('stage_history').update({ changed_by: this.user.name }).eq('product_id', pid).eq('stage', stage).is('changed_by', null).gte('changed_at', since);
  }

  // ══ STAGE ════════════════════════════════════════════════════════════════
  async stageNext() {
    const d = this.st.d;
    const p = await this.product(d.pid);
    if (!p) { await this.reset(); return this.say('That garment no longer exists.', this.menuButtons()); }
    const po = (p.po_number || '').trim();
    let siblings: any[] = [];
    if (po) { const { data } = await this.db.from('products').select('id,name').eq('brand_id', p.brand_id).eq('po_number', p.po_number).neq('status', 'completed'); siblings = data || []; }
    if (!d.stage) {
      this.st.await = null; await this.save();
      return this.say(`<b>${esc(this.label(p))}</b> is at <b>${STAGE_LABEL[p.stage] || p.stage}</b>. Move it to:`,
        [...rows(STAGES.filter(s => s[0] !== p.stage).map(s => b(s[1], `s:${s[0]}`)), 2), [b('✖ Cancel', 'x')]]);
    }
    if (siblings.length > 1 && d.all === undefined) {
      this.st.await = null; await this.save();
      return this.say(`Move to <b>${STAGE_LABEL[d.stage]}</b>: just this garment, or all ${siblings.length} garments in ${esc(po)}?`,
        [[b('This garment', 'a:0'), b(`All ${siblings.length} in ${po}`.slice(0, 40), 'a:1')], [b('✖ Cancel', 'x')]]);
    }
    const ids = d.all ? siblings.map((s: any) => s.id) : [p.id];
    for (const id of ids) await this.setStage(id, d.stage);
    await this.reset();
    return this.say(`✅ ${ids.length > 1 ? `${ids.length} garments in ${esc(po)}` : `<b>${esc(this.label(p))}</b>`} moved to <b>${STAGE_LABEL[d.stage]}</b>`, [[b('🔁 Another', 'm:stage'), b('🏠 Menu', 'menu')]]);
  }
  async stageButton(k: string, v: string) {
    if (k === 's') { this.st.d.stage = v; return this.stageNext(); }
    if (k === 'a') { this.st.d.all = v === '1'; return this.stageNext(); }
  }

  // ══ DISPATCH ═════════════════════════════════════════════════════════════
  async shippedBySize(pid: string) {
    const { data } = await this.db.from('shipments').select('size_label,quantity').eq('product_id', pid);
    const m: Record<string, number> = {};
    (data || []).forEach((s: any) => { const k = (s.size_label || '').toUpperCase(); m[k] = (m[k] || 0) + Number(s.quantity || 0); });
    return m;
  }

  async dispatchNext() {
    const d = this.st.d;
    const p = await this.product(d.pid);
    if (!p) { await this.reset(); return this.say('That garment no longer exists.', this.menuButtons()); }
    const shipped = await this.shippedBySize(p.id);
    const sizeKeys = sortSizes(Object.keys(p.bySize).filter(k => k));
    if (!d.sizes && d.qty != null && sizeKeys.length <= 1) d.sizes = { [sizeKeys[0] || '']: d.qty };
    if (!d.sizes || d.adding) {
      this.st.sizeOpts = sizeKeys; this.st.await = d.pendingSize ? 'dqty' : 'dsizes'; await this.save();
      if (d.pendingSize) return this.say(`How many <b>${esc(d.pendingSize)}</b> went out? Type a number.`, [[b('✖ Cancel', 'x')]]);
      const lines = sizeKeys.map(k => `${k}: ${shipped[k] || 0}/${p.bySize[k]} sent`).join('\n');
      return this.say(`<b>${esc(this.label(p))}</b>\n${lines ? `<i>${esc(lines)}</i>\n` : ''}\nWhat went out? Type like <code>M30 L20</code>, or tap a size.`,
        [...rows(sizeKeys.map((k, i) => b(k, `ds:${i}`)), 4), ...(d.sizes ? [[b('✅ Done adding', 'dd')]] : []), [b('✖ Cancel', 'x')]]);
    }
    const lines = sizeEntries(d.sizes).map(([k, q]) => {
      const left = (p.bySize[k] || 0) - (shipped[k] || 0);
      return `${k || 'no size'} × ${q}${p.bySize[k] && q > left ? ` ⚠️ only ${Math.max(0, left)} left to send` : ''}`;
    });
    const total = Object.values(d.sizes as Record<string, number>).reduce((a, c) => a + c, 0);
    this.st.await = null; this.st.confirm = true; await this.save();
    return this.say(`Record this dispatch?\n\n<b>${esc(this.label(p))}</b>\n${esc(lines.join('\n'))}\n<b>Total ${total} pcs</b>`,
      [[b('✅ Save dispatch', 'ok'), b('➕ Add size', 'more')], [b('✖ Cancel', 'x')]]);
  }

  async dispatchButton(k: string, v: string) {
    const d = this.st.d;
    if (k === 'ds') { d.pendingSize = this.st.sizeOpts?.[Number(v)]; d.adding = true; return this.dispatchNext(); }
    if (k === 'dd') { d.adding = false; d.pendingSize = null; return this.dispatchNext(); }
    if (k === 'more') { d.adding = true; return this.dispatchNext(); }
    if (k === 'ok') return this.dispatchSave();
  }
  async dispatchTyped(a: string, text: string) {
    const d = this.st.d;
    if (a === 'dqty') {
      const n = text.match(/\d+/); if (!n) return this.say('Please type a number.');
      d.sizes = { ...(d.sizes || {}), [d.pendingSize]: Number(n[0]) }; d.pendingSize = null; d.adding = false;
      return this.dispatchNext();
    }
    if (a === 'dsizes') {
      const s = parseSizeList(text);
      if (!s) return this.say('Type like <code>M30 L20</code>, or tap a size.');
      if (s.FREE && Object.keys(s).length === 1 && this.st.sizeOpts?.length) {
        if (this.st.sizeOpts.length === 1) { d.sizes = { ...(d.sizes || {}), [this.st.sizeOpts[0]]: s.FREE }; }
        else { d.qty = s.FREE; return this.say('Which sizes? Type like <code>M30 L20</code> so each size is counted right.'); }
      } else d.sizes = { ...(d.sizes || {}), ...s };
      d.adding = false;
      return this.dispatchNext();
    }
    return this.onFreeText(text);
  }

  async dispatchSave() {
    const d = this.st.d;
    if (!this.st.confirm) return this.dispatchNext();
    const p = await this.product(d.pid);
    const rowsToSave = sizeEntries(d.sizes).filter(([, q]) => q > 0)
      .map(([size, q]) => ({ product_id: d.pid, size_label: size || null, quantity: q, created_by: this.user.name, notes: 'via Telegram' }));
    const { error } = await this.db.from('shipments').insert(rowsToSave);
    if (error) throw new Error(error.message);
    const total = rowsToSave.reduce((s, r) => s + r.quantity, 0);
    await this.reset();
    await this.alert(`🚚 <b>Dispatched</b>: ${esc(this.label(p))}\n${rowsToSave.map(r => `${r.size_label || 'no size'} × ${r.quantity}`).join(', ')} (${total} pcs)\nBy ${esc(this.user.name)} via Telegram. Ready to invoice in Accounts.`);
    return this.say(`✅ Dispatch saved: ${total} pcs of <b>${esc(this.label(p))}</b>. It shows as “to invoice” in Accounts.`, [[b('🚚 Another', 'm:dispatch'), b('🏠 Menu', 'menu')]]);
  }

  // ══ NEW ORDER ════════════════════════════════════════════════════════════
  // d: { brand, brandName, po, items: [{ name, garment_id, cover, sizes, rate, gst }], cur, due }
  async orderNext() {
    const d = this.st.d;
    d.items ||= [];
    if (!d.brand) {
      const { data: brands } = await this.db.from('brands').select('id,name').order('name');
      const { data: recent } = await this.db.from('products').select('brand_id,created_at').order('created_at', { ascending: false }).limit(200);
      const rank = new Map<string, number>(); (recent || []).forEach((r: any, i: number) => { if (!rank.has(r.brand_id)) rank.set(r.brand_id, i); });
      const list = (brands || []).sort((a: any, z: any) => (rank.get(a.id) ?? 1e9) - (rank.get(z.id) ?? 1e9));
      const shown = this.st.brandQuery ? list.filter((x: any) => words(x.name).some(w => w.startsWith(this.st.brandQuery))) : list;
      this.st.opts = shown.slice(0, 10).map((x: any) => x.id); this.st.await = 'brand'; await this.save();
      return this.say('➕ <b>New order</b>\nWhich brand? <i>(or type the name)</i>', [...rows(shown.slice(0, 10).map((x: any, i: number) => b(x.name, `b:${i}`)), 2), [b('✖ Cancel', 'x')]]);
    }
    if (d.po === undefined) {
      let next: string | null = null;
      try { const { data } = await this.ctx.acc.rpc('next_proforma_number'); next = data || null; } catch (_) { next = null; }
      this.st.nextPo = next; this.st.await = 'po'; await this.save();
      return this.say(`<b>${esc(d.brandName)}</b>: PO number?${next ? ` Tap to use the next proforma number (the proforma will get the same number), or type the client's PO.` : ' Type it, or tap Skip.'}`,
        [...(next ? [[b(`Use ${next}`, 'po:use')]] : []), [b('Skip (no PO)', 'po:skip')], [b('✖ Cancel', 'x')]]);
    }
    const cur = d.cur;
    if (!cur) {
      const { data: gs } = await this.db.from('garments').select('id,name,style_code,default_price_per_piece,cover_photo_url').eq('brand_id', d.brand).order('name').limit(12);
      this.st.cat = (gs || []).map((g: any) => g.id); this.st.await = 'gname'; await this.save();
      return this.say(`Garment ${d.items.length + 1}: which style? Tap one from the catalog, or type a new garment name.`,
        [...rows((gs || []).map((g: any, i: number) => b(`${g.name}${g.style_code ? ` (${g.style_code})` : ''}`.slice(0, 40), `ga:${i}`)), 1), [b('✖ Cancel', 'x')]]);
    }
    if (!cur.sizes) { this.st.await = 'gsizes'; await this.save(); return this.say(`<b>${esc(cur.name)}</b>: sizes and quantities?\nType like <code>S20 M30 L10</code> (or just <code>50</code> for one size).`, [[b('✖ Cancel', 'x')]]); }
    if (cur.rate == null) {
      this.st.await = 'grate'; await this.save();
      return this.say('Rate per piece, before GST? Type the amount.', [...(cur.defaultRate ? [[b(`₹${cur.defaultRate} (catalog)`, `rt:${cur.defaultRate}`)]] : []), [b('✖ Cancel', 'x')]]);
    }
    if (cur.gst == null) {
      const sug = cur.rate > 2500 ? 18 : 5;
      this.st.await = null; await this.save();
      return this.say(`GST rate? (₹${cur.rate}/pc → usually ${sug}%)`, [[b(`${sug}% ✓`, `gst:${sug}`), b(`${sug === 5 ? 18 : 5}%`, `gst:${sug === 5 ? 18 : 5}`)], [b('✖ Cancel', 'x')]]);
    }
    if (!cur.added) {
      d.items.push({ ...cur, added: true }); d.cur = null; this.st.await = null; await this.save();
      return this.say(`Added <b>${esc(cur.name)}</b>: ${sizesText(cur.sizes)} @ ${inr(cur.rate)} + ${cur.gst}%.\nAnother garment in this order?`,
        [[b('➕ Another garment', 'more'), b('Next ▸', 'next')], [b('✖ Cancel', 'x')]]);
    }
  }

  async orderDue() {
    const d = this.st.d;
    const { data: s } = await this.db.from('ops_settings').select('value').eq('key', 'default_lead_days').maybeSingle();
    const lead = Number(s?.value ?? 21) || 21;
    this.st.await = 'due'; await this.save();
    const day = (n: number) => { const t = this.now(); t.setDate(t.getDate() + n); return iso(t); };
    const opts = [...new Set([14, lead, 30])].sort((a, z) => a - z);
    return this.say('Delivery date? Tap one, or type a date like <code>25/12</code> or <code>25 dec</code>.',
      [opts.map(n => b(`${n} days (${fmtDay(day(n))})${n === lead ? ' ✓' : ''}`, `due:${day(n)}`)), [b('No date', 'due:none')], [b('✖ Cancel', 'x')]]);
  }

  async orderConfirm() {
    const d = this.st.d;
    let linked = false;
    try {
      const { data: setting } = await this.ctx.acc.from('integration_settings').select('ops_business_id').eq('id', 1).maybeSingle();
      if (setting?.ops_business_id) {
        const { data: party } = await this.ctx.acc.from('parties').select('id').eq('business_id', setting.ops_business_id).eq('brand_id', d.brand).maybeSingle();
        linked = !!party;
      }
    } catch (_) { linked = false; }
    const lines = d.items.map((it: any) => {
      const q = Object.values(it.sizes as Record<string, number>).reduce((a, c) => a + c, 0);
      return `• ${esc(it.name)}: ${esc(sizesText(it.sizes))} = ${q} pcs × ${inr(it.rate)} + ${it.gst}% → <b>${inr(Math.round(q * it.rate * (1 + it.gst / 100)))}</b>`;
    });
    const total = d.items.reduce((s: number, it: any) => s + Math.round(Object.values(it.sizes as Record<string, number>).reduce((a, c) => a + c, 0) * it.rate * (1 + it.gst / 100)), 0);
    this.st.await = null; this.st.confirm = true; this.st.linked = linked; await this.save();
    const kb = linked
      ? [[b('✅ Create + proforma', 'ok:pf')], [b('✅ Create order only', 'ok')], [b('✖ Cancel', 'x')]]
      : [[b('✅ Create order', 'ok')], [b('✖ Cancel', 'x')]];
    return this.say(`New order for <b>${esc(d.brandName)}</b>${d.po ? ` · PO <b>${esc(d.po)}</b>` : ''}\n${lines.join('\n')}\nDelivery: ${d.due ? fmtDay(d.due) : 'not set'}\n<b>Total ${inr(total)}</b> incl. GST${linked ? '' : '\n<i>(No proforma option: this brand isn\'t linked to a client in Accounts yet.)</i>'}`, kb);
  }

  async orderButton(k: string, v: string) {
    const d = this.st.d;
    if (k === 'b') { const id = this.st.opts?.[Number(v)]; if (!id) return this.orderNext(); const { data: br } = await this.db.from('brands').select('id,name').eq('id', id).maybeSingle(); d.brand = br.id; d.brandName = br.name; return this.orderNext(); }
    if (k === 'po') { d.po = v === 'use' ? this.st.nextPo || null : null; return this.orderNext(); }
    if (k === 'ga') {
      const id = this.st.cat?.[Number(v)];
      const { data: g } = await this.db.from('garments').select('*').eq('id', id).maybeSingle();
      if (!g) return this.orderNext();
      d.cur = { name: g.name, style_code: g.style_code || null, garment_id: g.id, cover: g.cover_photo_url || null, tech: g.tech_pack_url || null, defaultRate: g.default_price_per_piece ? Number(g.default_price_per_piece) : null };
      return this.orderNext();
    }
    if (k === 'rt') { d.cur.rate = Number(v); return this.orderNext(); }
    if (k === 'gst') { d.cur.gst = Number(v); return this.orderNext(); }
    if (k === 'more') return this.orderNext();
    if (k === 'next') return this.orderDue();
    if (k === 'due') { d.due = v === 'none' ? null : v; return this.orderConfirm(); }
    if (k === 'ok') return this.orderSave(v === 'pf');
  }

  async orderTyped(a: string, text: string) {
    const d = this.st.d;
    if (a === 'brand') {
      const q = words(text)[0] || '';
      const { data: brands } = await this.db.from('brands').select('id,name');
      const hits = (brands || []).filter((x: any) => words(x.name).some(w => w.startsWith(q)) || x.name.toLowerCase().includes(text.toLowerCase().trim()));
      if (hits.length === 1) { d.brand = hits[0].id; d.brandName = hits[0].name; return this.orderNext(); }
      this.st.brandQuery = hits.length ? q : null;
      if (!hits.length) await this.say(`No brand called “${esc(text)}”. Add new brands in the app (Brands), then come back.`);
      return this.orderNext();
    }
    if (a === 'po') { d.po = text.trim().toUpperCase().slice(0, 40); return this.orderNext(); }
    if (a === 'gname') { d.cur = { name: text.trim().slice(0, 80), style_code: null, garment_id: null, cover: null, tech: null, defaultRate: null }; return this.orderNext(); }
    if (a === 'gsizes') { const s = parseSizeList(text); if (!s) return this.say('Type like <code>S20 M30 L10</code>, or a number like <code>50</code>.'); d.cur.sizes = s; return this.orderNext(); }
    if (a === 'grate') { const n = text.replace(/[,₹\s]/g, '').match(/\d+(\.\d+)?/); if (!n) return this.say('Please type the rate, e.g. <code>450</code>.'); d.cur.rate = Number(n[0]); return this.orderNext(); }
    if (a === 'due') { const dt = parseDate(text, this.now()); if (!dt) return this.say('I couldn\'t read that date. Try <code>25/12</code> or <code>25 dec</code>.'); d.due = dt; return this.orderConfirm(); }
    return this.onFreeText(text);
  }

  async orderSave(withProforma: boolean) {
    const d = this.st.d;
    if (!this.st.confirm) return this.orderNext();
    const made: any[] = [];
    for (const it of d.items) {
      const units = Object.values(it.sizes as Record<string, number>).reduce((a, c) => a + c, 0);
      const { data: prod, error } = await this.db.from('products').insert({
        name: it.name, style_code: it.style_code, brand_id: d.brand, po_number: d.po || null, due_date: d.due || null,
        status: 'in_production', stage: 'cutting', planned_work: ['cutting', 'stitching', 'finishing'],
        cover_photo_url: it.cover, tech_pack_url: it.tech, garment_id: it.garment_id,
        price_per_piece: it.rate, gst_rate: it.gst, total_amount: Math.round(units * it.rate * (1 + it.gst / 100)),
      }).select().single();
      if (error) throw new Error(error.message);
      const sizeRows = sizeEntries(it.sizes).filter(([, q]) => q > 0).map(([size_label, quantity]) => ({ product_id: prod.id, size_label, quantity }));
      if (sizeRows.length) { const { error: e2 } = await this.db.from('product_sizes').insert(sizeRows); if (e2) throw new Error(e2.message); }
      await this.db.from('stage_history').update({ changed_by: this.user.name }).eq('product_id', prod.id).is('changed_by', null);
      made.push(prod);
    }
    // a PO groups the garments into one order; without a PO each garment is its own order
    const keys = [...new Set(made.map((p: any) => (p.po_number || '').trim() ? `PO:${p.brand_id || 'none'}|${p.po_number.trim().toUpperCase()}` : `P:${p.id}`))];
    let pfText = '';
    if (withProforma) {
      for (const key of keys) {
        const { data: pf, error } = await this.ctx.acc.rpc('create_order_proforma', { p_order_key: key });
        pfText += error ? `\n⚠️ Proforma not made: ${esc(error.message)}` : `\n📋 Proforma <b>${esc(pf.number)}</b> made: ${inr(pf.total)}. Download it from the order in the app, or in Accounts.`;
      }
    }
    const total = made.reduce((s: number, p: any) => s + Number(p.total_amount || 0), 0);
    await this.reset();
    await this.alert(`🆕 <b>New order</b> (via Telegram, ${esc(this.user.name)})\n<b>${esc(d.brandName)}</b>${d.po ? ` · PO ${esc(d.po)}` : ''}\n${d.items.map((it: any) => `• ${esc(it.name)}: ${esc(sizesText(it.sizes))}`).join('\n')}${d.due ? `\nDelivery by ${fmtDay(d.due)}` : ''}`);
    return this.say(`✅ Order created for <b>${esc(d.brandName)}</b>: ${made.length} garment${made.length > 1 ? 's' : ''}, ${inr(total)} incl. GST.${pfText}`, [[b('➕ Another order', 'm:order'), b('🏠 Menu', 'menu')]]);
  }

  // ══ CONNECT ══════════════════════════════════════════════════════════════
  async linkAccount(code: string) {
    const { data: c } = await this.db.from('telegram_link_codes').select('*').eq('code', code).maybeSingle();
    if (!c || new Date(c.expires_at) < new Date()) return this.say('That code has expired or is wrong. Get a new one in the app: 📲 Telegram → Connect.');
    const tgName = [this.from.first_name, this.from.last_name].filter(Boolean).join(' ') || this.from.username || '';
    const { error } = await this.db.from('telegram_users').upsert({ tg_user_id: this.from.id, tg_name: tgName, name: c.name, role: c.role, employee_id: c.employee_id, access_pin_id: c.access_pin_id, active: true, linked_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    await this.db.from('telegram_link_codes').delete().eq('code', code);
    this.user = { name: c.name, role: c.role, employee_id: c.employee_id };
    return this.menu(`✅ Connected as <b>${esc(c.name)}</b>.`);
  }
}

// small helper used in several places
function sizesText(s: Record<string, number>) { return sizeEntries(s).map(([k, v]) => k === 'FREE' ? `${v}` : `${k}${v}`).join(' '); }

