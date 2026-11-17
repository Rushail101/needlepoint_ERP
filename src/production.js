// Shared production helpers: dates, delivery status, per-size progress, pay.
import { STAGES } from './stages.js'

const pad = n => String(n).padStart(2, '0')
export const localISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayISO = () => localISO(new Date())
export const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); return localISO(d) }
export const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000)
export const fmtDay = iso => iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'
export const monthKey = ts => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}` }

const stageIndex = key => Math.max(0, STAGES.findIndex(s => s.key === key))
export const isDone = p => p.status === 'completed' || p.stage === 'packed'

// Delivery status for a garment/order: late, due soon, at risk (due in a few
// days but still early in production), or fine.
export function deliveryStatus(p) {
  if (!p?.due_date || isDone(p) || p.status === 'on_hold') return null
  const left = daysBetween(todayISO(), p.due_date)
  if (left < 0) return { key: 'late', text: `Late ${-left}d`, cls: 'bg-red-950/80 border-red-800 text-red-300', left }
  const atRisk = left <= 5 && stageIndex(p.stage) < stageIndex('stitching')
  if (atRisk) return { key: 'risk', text: left === 0 ? 'Due today · at risk' : `Due in ${left}d · at risk`, cls: 'bg-amber-950/80 border-amber-700 text-amber-300', left }
  if (left <= 7) return { key: 'soon', text: left === 0 ? 'Due today' : `Due in ${left}d`, cls: 'bg-yellow-950/60 border-yellow-800/70 text-yellow-300', left }
  return { key: 'ok', text: `Due ${fmtDay(p.due_date)}`, cls: 'bg-gray-800 border-gray-700 text-gray-300', left }
}

// Per-size progress from work logs (only logs that name a size).
export function sizeProgress(sizes, logs, shipments = []) {
  const rows = sizes.map(s => ({ size: s.size_label, ordered: Number(s.quantity) || 0, cutting: 0, screen_printing: 0, embroidery: 0, stitching: 0, qc: 0, rejected: 0, packing: 0, dispatched: 0 }))
  const by = Object.fromEntries(rows.map(r => [r.size, r]))
  let unsized = 0
  for (const l of logs) {
    if (!l.quantity && !l.rejected_qty) continue
    const r = l.size_label ? by[l.size_label] : null
    if (!r) { if (l.quantity) unsized += Number(l.quantity); continue }
    if (l.work_type in r) r[l.work_type] += Number(l.quantity) || 0
    if (l.rejected_qty) r.rejected += Number(l.rejected_qty)
  }
  for (const s of shipments) if (by[s.size_label]) by[s.size_label].dispatched += Number(s.quantity) || 0
  return { rows, unsized }
}

// Piece-rate lookup: product-specific rate first, then the default for that work type.
export function rateFor(rates, workType, productId) {
  return rates.find(r => r.work_type === workType && r.product_id === productId)?.rate
    ?? rates.find(r => r.work_type === workType && !r.product_id)?.rate
    ?? null
}
export function pieceEarnings(logs, rates) {
  let total = 0, unpriced = 0
  for (const l of logs) {
    if (!l.quantity) continue
    const r = rateFor(rates, l.work_type, l.product_id)
    if (r == null) unpriced += Number(l.quantity); else total += Number(r) * Number(l.quantity)
  }
  return { total, unpriced }
}

export const inr = n => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

// Moves a garment's stage forward from what's been logged — never backward.
//   printing/embroidery logged → Printing/Embroidery
//   stitching logged → Stitching; all ordered pieces stitched → QC
//   all ordered pieces packed → Packed
export function suggestedStage(product, sizes, logs) {
  const order = STAGES.map(s => s.key)
  const ordered = sizes.reduce((s, x) => s + (Number(x.quantity) || 0), 0)
  const sum = t => logs.filter(l => l.work_type === t).reduce((s, l) => s + (Number(l.quantity) || 0), 0)
  let target = 'cutting'
  if (sum('screen_printing') + sum('embroidery') > 0) target = 'printing_embroidery'
  if (sum('stitching') > 0) target = 'stitching'
  if (ordered > 0 && sum('stitching') >= ordered) target = 'qc'
  if (ordered > 0 && sum('packing') >= ordered) target = 'packed'
  const cur = order.indexOf(product.stage || 'cutting')
  return order.indexOf(target) > cur ? target : null
}
