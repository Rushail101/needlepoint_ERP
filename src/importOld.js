// Import from the old operations project (tables in `public`, photos in its
// buckets) into this one (schema `ops`, bucket `ops-photos`). Runs in the
// admin's browser: reads the old project with its public anon key, writes
// here with the admin session. Nothing in the old project is changed, and it
// is safe to run again (rows are upserted by id, photos overwritten).
import { PHOTO_BUCKET } from './supabaseClient.js'

// Parents before children (foreign keys).
export const IMPORT_TABLES = [
  'brands', 'garments', 'employees', 'products', 'product_photos', 'product_sizes', 'work_logs',
  'sample_versions', 'shipments', 'access_pins', 'ops_settings', 'piece_rates', 'vendors',
  'material_moves', 'job_work', 'stage_history',
]
// Never copied as columns: links to the old project's accounts data, and
// plain-text secrets (they're re-set through the secure login functions).
const DROP = { shipments: ['invoice_id', 'challan_id'], access_pins: ['pin'], brands: ['portal_password'] }

const missingTable = e => e && (e.code === 'PGRST205' || e.code === '42P01' || /does not exist|Could not find the table/i.test(e.message || ''))

async function readAll(old, table) {
  let rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await old.from(table).select('*').range(from, from + 999)
    if (error) { if (missingTable(error)) return null; throw new Error(`Reading ${table} from the old project: ${error.message}`) }
    rows = rows.concat(data || [])
    if (!data || data.length < 1000) return rows
  }
}

async function upsert(db, table, rows) {
  const skip = new Set(DROP[table] || [])
  for (let i = 0; i < rows.length; i += 500) {
    for (;;) {
      const chunk = rows.slice(i, i + 500).map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !skip.has(k))))
      const { error } = await db.from(table).upsert(chunk)
      if (!error) break
      const m = (error.message || '').match(/Could not find the '([^']+)' column/)
      if (m && !skip.has(m[1])) { skip.add(m[1]); continue }      // old column the new schema doesn't have
      throw new Error(`Saving ${table}: ${error.message}`)
    }
  }
}

export async function checkBeforeImport(db) {
  const { data, error } = await db.schema('accounts_erp').from('integration_settings').select('ops_business_id').maybeSingle()
  if (!error && data?.ops_business_id) {
    return 'The accounts link is already switched on, so importing brands now would create a new client party for each one instead of letting you match them. Import first, then do the one-time setup in Accounts.'
  }
  return null
}

// log(text, kind) receives progress lines; returns a summary.
export async function importOldProject({ old, db, oldUrl, log = () => {} }) {
  const base = oldUrl.replace(/\/+$/, '')
  const photoPrefix = `${base}/storage/v1/object/public/`
  const start = new Date().toISOString()
  const summary = { tables: {}, photos: 0, photoFails: [], pinsSet: 0, pinsMissing: [], portalsSet: 0, portalsMissing: [] }

  // ── photos ──
  const copied = new Map()
  const copyPhoto = async (url) => {
    if (copied.has(url)) return copied.get(url)
    const path = decodeURIComponent(url.slice(photoPrefix.length).split('?')[0])   // "<old bucket>/<file>"
    let out = url
    try {
      const r = await fetch(url)
      if (!r.ok) throw new Error(`download failed (${r.status})`)
      const blob = await r.blob()
      const { error } = await db.storage.from(PHOTO_BUCKET).upload(path, blob, { upsert: true, contentType: blob.type || undefined, cacheControl: '3600' })
      if (error) throw new Error(error.message)
      out = db.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl
      summary.photos++
    } catch (e) {
      summary.photoFails.push(path)
      log(`Photo not copied (kept old link): ${path} (${e.message})`, 'warn')
    }
    copied.set(url, out)
    return out
  }
  const movePhotos = async (rows) => {
    for (const row of rows) for (const [k, v] of Object.entries(row)) {
      if (typeof v === 'string' && v.startsWith(photoPrefix)) row[k] = await copyPhoto(v)
    }
  }

  // ── tables ──
  const old_ = {}
  for (const t of IMPORT_TABLES) {
    const rows = await readAll(old, t)
    if (rows === null) { log(`${t}: not in the old project, skipped`, 'muted'); continue }
    old_[t] = rows
    if (t === 'stage_history') continue
    if (rows.length) log(`${t}: copying ${rows.length}…`, 'muted')
    await movePhotos(rows)
    await upsert(db, t, rows)
    summary.tables[t] = rows.length
    log(`${t}: ${rows.length}`, 'ok')
  }

  // Saving products made the database add a "stage started" entry dated now.
  // Swap those for the real history (or date them by when the order was made).
  const ids = (old_.products || []).map(p => p.id)
  for (let i = 0; i < ids.length; i += 200) {
    const part = ids.slice(i, i + 200)
    if (old_.stage_history) {
      const { error } = await db.from('stage_history').delete().in('product_id', part).gte('changed_at', start)
      if (error) throw new Error(`Tidying stage history: ${error.message}`)
    } else {
      for (const p of old_.products.filter(x => part.includes(x.id) && x.created_at)) {
        // already has history from an earlier import → drop today's extra entry; otherwise date it
        const { count } = await db.from('stage_history').select('id', { count: 'exact', head: true }).eq('product_id', p.id).lt('changed_at', start)
        if (count) await db.from('stage_history').delete().eq('product_id', p.id).gte('changed_at', start)
        else await db.from('stage_history').update({ changed_at: p.created_at, changed_by: null }).eq('product_id', p.id).gte('changed_at', start)
      }
    }
  }
  if (old_.stage_history) { await upsert(db, 'stage_history', old_.stage_history); summary.tables.stage_history = old_.stage_history.length; log(`stage_history: ${old_.stage_history.length}`, 'ok') }
  else if (ids.length) log('stage_history: each order dated by when it was created', 'ok')

  // ── logins: set PINs / portal passwords through the secure functions ──
  for (const a of old_.access_pins || []) {
    const pin = String(a.pin || '').trim()
    if (!pin) { summary.pinsMissing.push(a.name); continue }
    const { error } = await db.rpc('ops_set_pin', { p_pin_id: a.id, p_pin: pin })
    if (error) { summary.pinsMissing.push(`${a.name} (${error.message})`); continue }
    summary.pinsSet++
  }
  for (const b of old_.brands || []) {
    const pw = String(b.portal_password || '')
    if (!pw) { if (b.portal_active) summary.portalsMissing.push(b.name); continue }
    const { error } = await db.rpc('ops_set_portal_password', { p_brand_id: b.id, p_password: pw })
    if (error) { summary.portalsMissing.push(`${b.name} (${error.message})`); continue }
    summary.portalsSet++
  }
  if (old_.access_pins) log(`logins: ${summary.pinsSet} staff PINs carried over`, 'ok')
  if (old_.brands) log(`brand portals: ${summary.portalsSet} passwords carried over`, 'ok')
  return summary
}
