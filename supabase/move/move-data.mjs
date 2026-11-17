// Copies the operations app's data and photos from the OLD Supabase project
// (tables in `public`, photos in the old buckets) into the shared project
// (schema `ops`, bucket `ops-photos`). Nothing in the old project is changed.
//
// Needs Node 18+ — no npm install. Run from the app folder:
//
//   OLD_URL=https://<old-ref>.supabase.co  OLD_SERVICE_KEY=<old service_role key> \
//   NEW_URL=https://<new-ref>.supabase.co  NEW_SERVICE_KEY=<new service_role key> \
//   node supabase/move/move-data.mjs
//
// (Windows PowerShell: set each with  $env:OLD_URL="..."  then run the node line.)
// Keys: Project Settings → API → service_role (secret — don't commit or share).
// Safe to run again: rows and photos are upserted, not duplicated.

const env = (k) => {
  const v = (process.env[k] || '').trim().replace(/\/+$/, '');
  if (!v) { console.error(`Missing ${k}. See the top of this file.`); process.exit(1); }
  return v;
};
const OLD = env('OLD_URL'), OLD_KEY = env('OLD_SERVICE_KEY');
const NEW = env('NEW_URL'), NEW_KEY = env('NEW_SERVICE_KEY');
const BUCKET = 'ops-photos';
const http = globalThis.__moveFetch || fetch;   // test hook

// Parents before children (foreign keys).
const TABLES = [
  'brands', 'garments', 'employees', 'products', 'product_photos', 'product_sizes', 'work_logs',
  'sample_versions', 'shipments', 'access_pins', 'ops_settings', 'piece_rates', 'vendors',
  'material_moves', 'job_work', 'stage_history', 'ops_secrets',
];
// Links to the old project's accounts data don't carry over.
const DROP_COLS = { shipments: ['invoice_id', 'challan_id'] };

const h = (key, extra = {}) => ({ apikey: key, Authorization: `Bearer ${key}`, ...extra });
const log = (...a) => console.log(...a);

async function readAll(table) {
  let rows = [];
  for (let from = 0; ; from += 1000) {
    const r = await http(`${OLD}/rest/v1/${table}?select=*`, { headers: h(OLD_KEY, { 'Range-Unit': 'items', Range: `${from}-${from + 999}` }) });
    if (r.status === 404 || r.status === 400) {
      const body = await r.text();
      if (/PGRST205|42P01|does not exist|Could not find the table/i.test(body)) return null;   // table never existed
      throw new Error(`Reading ${table}: ${body}`);
    }
    if (!r.ok) throw new Error(`Reading ${table}: ${r.status} ${await r.text()}`);
    const page = await r.json();
    rows = rows.concat(page);
    if (page.length < 1000) return rows;
  }
}

// ── photos ────────────────────────────────────────────────────────────────
const oldPrefix = `${OLD}/storage/v1/object/public/`;
const copied = new Map();
let photoFails = 0;
async function copyPhoto(url) {
  if (copied.has(url)) return copied.get(url);
  const path = decodeURIComponent(url.slice(oldPrefix.length).split('?')[0]);   // "<old bucket>/<file>"
  let out = url;
  try {
    const got = await http(url);
    if (!got.ok) throw new Error(`download ${got.status}`);
    const type = got.headers.get('content-type') || 'application/octet-stream';
    const bytes = await got.arrayBuffer();
    const put = await http(`${NEW}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST', headers: h(NEW_KEY, { 'Content-Type': type, 'x-upsert': 'true', 'cache-control': '3600' }), body: bytes,
    });
    if (!put.ok) throw new Error(`upload ${put.status} ${await put.text()}`);
    out = `${NEW}/storage/v1/object/public/${BUCKET}/${path}`;
  } catch (e) {
    photoFails++;
    console.warn(`  ! photo not copied (kept old link): ${path} — ${e.message}`);
  }
  copied.set(url, out);
  return out;
}
async function movePhotos(rows) {
  for (const row of rows) for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'string' && v.startsWith(oldPrefix)) row[k] = await copyPhoto(v);
  }
}

// ── writing ───────────────────────────────────────────────────────────────
async function upsert(table, rows) {
  const skipCols = new Set(DROP_COLS[table] || []);
  for (let i = 0; i < rows.length; i += 500) {
    for (;;) {
      const chunk = rows.slice(i, i + 500).map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !skipCols.has(k))));
      const r = await http(`${NEW}/rest/v1/${table}`, {
        method: 'POST',
        headers: h(NEW_KEY, { 'Content-Type': 'application/json', 'Content-Profile': 'ops', Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify(chunk),
      });
      if (r.ok) break;
      const body = await r.text();
      // a column the old project had that the new schema doesn't: drop it and retry
      const m = body.match(/Could not find the '([^']+)' column/);
      if (m && !skipCols.has(m[1])) { log(`  (skipping old column ${table}.${m[1]})`); skipCols.add(m[1]); continue; }
      throw new Error(`Writing ${table}: ${r.status} ${body}`);
    }
  }
}

async function newGet(path, profile = 'ops') {
  const r = await http(`${NEW}/rest/v1/${path}`, { headers: h(NEW_KEY, { 'Accept-Profile': profile }) });
  return r.ok ? r.json() : null;
}

// ── main ──────────────────────────────────────────────────────────────────
async function main() {
  const start = new Date().toISOString();
  log(`From ${OLD}\nTo   ${NEW} (schema ops, bucket ${BUCKET})\n`);

  if (!(await newGet('brands?select=id&limit=1'))) {
    throw new Error('The ops schema isn\'t reachable in the new project. Run supabase/ops_install.sql there and add "ops" to Exposed schemas (Project Settings → API) first.');
  }
  const integ = await newGet('integration_settings?select=ops_business_id', 'accounts_erp');
  if (integ?.[0]?.ops_business_id && !process.env.FORCE) {
    throw new Error('The accounts link is already set up in the new project, so copying brands now would create parties automatically. Move the data BEFORE running 001_link_operations.sql / the Production setup, or re-run with FORCE=1 if you really mean it.');
  }

  const counts = {};
  const old = {};
  for (const t of TABLES) {
    const rows = await readAll(t);
    if (rows === null) { log(`- ${t}: not in old project, skipped`); continue; }
    old[t] = rows;
    if (t === 'stage_history') continue;   // handled after products
    await movePhotos(rows);
    await upsert(t, rows);
    counts[t] = rows.length;
    log(`✓ ${t}: ${rows.length}`);
  }

  // Inserting products made the database write a "started" stage entry for
  // each one, dated today. Replace those with the real history (or date them
  // by when the order was created, if the old project had no history).
  const auto = `stage_history?changed_at=gte.${encodeURIComponent(start)}&changed_by=is.null`;
  if (old.stage_history) {
    await http(`${NEW}/rest/v1/${auto}`, { method: 'DELETE', headers: h(NEW_KEY, { 'Content-Profile': 'ops' }) });
    await upsert('stage_history', old.stage_history);
    log(`✓ stage_history: ${old.stage_history.length}`);
  } else {
    for (const p of old.products || []) {
      if (!p.created_at) continue;
      await http(`${NEW}/rest/v1/${auto}&product_id=eq.${p.id}`, {
        method: 'PATCH', headers: h(NEW_KEY, { 'Content-Type': 'application/json', 'Content-Profile': 'ops', Prefer: 'return=minimal' }),
        body: JSON.stringify({ changed_at: p.created_at }),
      });
    }
    log('✓ stage_history: dated each order by its creation date');
  }

  log(`\nPhotos copied: ${[...copied.values()].filter(v => v.startsWith(NEW)).length}${photoFails ? `, ${photoFails} failed (still point at the old project, see above)` : ''}`);
  log('\nDone. Next, in the NEW project\'s SQL editor:');
  log('  1. Run supabase/ops_install.sql once more. It turns any old plain-text PINs and');
  log('     portal passwords into secure hashes (safe to re-run).');
  if (!old.ops_secrets?.some(s => s.kind === 'admin')) log('  2. Set the admin PIN:  select ops.ops_bootstrap_admin(\'your-pin\');');
  else log('  2. Your admin PIN carried over.');
  log('Then run the accounts link SQL and the one-time setup in Accounts → Production Orders.');
}

main().catch(e => { console.error('\n✗ ' + e.message); process.exit(1); });
