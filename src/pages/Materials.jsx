import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, uploadPhoto, must } from '../supabaseClient.js'
import Modal, { FormActions, inputClass, labelClass } from '../components/Modal.jsx'
import { useAuth } from '../components/PinGate.jsx'
import { can } from '../permissions.js'
import { toast } from '../components/Toast.jsx'
import { todayISO, fmtDay, inr, isDone } from '../production.js'

const DIR = {
  in: { label: 'Received', cls: 'bg-emerald-950/80 border-emerald-800 text-emerald-300', sign: 1 },
  issue: { label: 'Issued', cls: 'bg-amber-950/80 border-amber-800 text-amber-300', sign: -1 },
  return: { label: 'Returned', cls: 'bg-blue-950/80 border-blue-800 text-blue-300', sign: 1 },
}
const UNITS = ['kg', 'm', 'pcs', 'rolls', 'cones']
const key = m => `${m.material.trim().toLowerCase()}|${m.unit}`

async function loadMoves(filter) {
  let q = supabase.from('material_moves').select('*, products(name, po_number), employees(name)').order('moved_at', { ascending: false }).order('created_at', { ascending: false })
  if (filter) q = filter(q)
  const { data, error } = await q
  if (error) { toast(/does not exist|schema cache/i.test(error.message) ? 'Run migration_008 to enable materials.' : error.message, 'error'); return [] }
  return data || []
}

// Stock per material = received − issued + returned.
function stockOf(moves) {
  const m = {}
  for (const x of moves) {
    const k = key(x)
    m[k] ||= { material: x.material, unit: x.unit, qty: 0, value: 0, inQty: 0 }
    m[k].qty += DIR[x.direction].sign * Number(x.quantity)
    if (x.direction === 'in') { m[k].inQty += Number(x.quantity); m[k].value += Number(x.quantity) * Number(x.rate || 0) }
  }
  return Object.values(m).map(s => ({ ...s, avgRate: s.inQty ? s.value / s.inQty : 0 })).sort((a, b) => a.material.localeCompare(b.material))
}

export default function Materials() {
  const { user } = useAuth()
  const canEdit = can(user, 'manage_materials')
  const [moves, setMoves] = useState([])
  const [products, setProducts] = useState([])
  const [logs, setLogs] = useState([])
  const [tab, setTab] = useState('stock')
  const [form, setForm] = useState(null)
  const [search, setSearch] = useState('')

  const load = async () => {
    const [m, { data: p }, { data: l }] = await Promise.all([
      loadMoves(),
      supabase.from('products').select('id, name, po_number, brand_id, stage, status, brands(name)').order('created_at', { ascending: false }),
      supabase.from('work_logs').select('product_id, quantity').eq('work_type', 'cutting'),
    ])
    setMoves(m); setProducts(p || []); setLogs(l || [])
  }
  useEffect(() => { load() }, [])

  const stock = useMemo(() => stockOf(moves), [moves])
  const avgRate = useMemo(() => Object.fromEntries(stock.map(s => [`${s.material.trim().toLowerCase()}|${s.unit}`, s.avgRate])), [stock])

  // Per order (PO, or the garment when there's no PO): material used and pieces cut.
  const usage = useMemo(() => {
    const cutBy = {}; logs.forEach(l => { cutBy[l.product_id] = (cutBy[l.product_id] || 0) + Number(l.quantity || 0) })
    const groups = {}
    for (const x of moves.filter(m => m.direction !== 'in')) {
      const prod = products.find(p => p.id === x.product_id)
      const po = x.po_number || prod?.po_number
      const g = po ? `PO ${po}` : prod ? prod.name : 'Unassigned'
      groups[g] ||= { label: g, po, productIds: new Set(), mats: {} }
      if (x.product_id) groups[g].productIds.add(x.product_id)
      if (po) products.filter(p => p.po_number === po).forEach(p => groups[g].productIds.add(p.id))
      const k = key(x)
      groups[g].mats[k] ||= { material: x.material, unit: x.unit, used: 0 }
      groups[g].mats[k].used += (x.direction === 'issue' ? 1 : -1) * Number(x.quantity)
    }
    return Object.values(groups).map(g => {
      const cut = [...g.productIds].reduce((s, id) => s + (cutBy[id] || 0), 0)
      const mats = Object.values(g.mats).map(m => ({ ...m, perPiece: cut ? m.used / cut : null, cost: m.used * (avgRate[`${m.material.trim().toLowerCase()}|${m.unit}`] || 0) }))
      return { ...g, cut, mats, cost: mats.reduce((s, m) => s + m.cost, 0) }
    })
  }, [moves, products, logs, avgRate])

  const q = search.trim().toLowerCase()
  const shownMoves = moves.filter(m => !q || [m.material, m.supplier, m.po_number, m.products?.name, m.notes].some(v => (v || '').toLowerCase().includes(q)))

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="text-xl font-bold text-gray-100">Fabric &amp; Trims</h2>
        {canEdit && (
          <div className="flex gap-2">
            <button onClick={() => setForm({ direction: 'in' })} className="bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl px-3 py-2 text-xs font-semibold">+ Receive</button>
            <button onClick={() => setForm({ direction: 'issue' })} className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-3 py-2 text-xs font-semibold">Issue to order</button>
            <button onClick={() => setForm({ direction: 'return' })} className="bg-gray-800 border border-gray-700 text-gray-200 rounded-xl px-3 py-2 text-xs font-semibold">Return</button>
          </div>
        )}
      </div>

      <div className="flex gap-1 mb-4 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {[['stock', 'In stock'], ['usage', 'Usage per order'], ['log', 'All movements']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${tab === k ? 'bg-brand-600 text-white' : 'text-gray-400'}`}>{l}</button>
        ))}
      </div>

      {tab === 'stock' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {stock.map(s => (
            <div key={s.material + s.unit} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              <p className="text-sm font-semibold text-gray-100">{s.material}</p>
              <p className={`text-xl font-black mt-1 ${s.qty < 0 ? 'text-red-400' : 'text-gray-100'}`}>{Number(s.qty.toFixed(2))} <span className="text-xs font-semibold text-gray-400">{s.unit}</span></p>
              <p className="text-[11px] text-gray-500">{s.avgRate ? `avg ${inr(s.avgRate)}/${s.unit} · stock value ${inr(Math.max(0, s.qty) * s.avgRate)}` : 'no rate recorded'}</p>
              {s.qty < 0 && <p className="text-[11px] text-red-400 mt-1">More issued than received — a receipt may be missing.</p>}
            </div>
          ))}
          {stock.length === 0 && <p className="text-sm text-gray-500">Nothing recorded yet. Use “+ Receive” when fabric or trims arrive.</p>}
        </div>
      )}

      {tab === 'usage' && (
        <div className="space-y-2">
          {usage.map(g => (
            <div key={g.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              <div className="flex justify-between items-baseline">
                <p className="text-sm font-bold text-gray-100">{g.label}</p>
                <p className="text-[11px] text-gray-400">{g.cut ? `${g.cut} pcs cut` : 'no cutting logged yet'}{g.cost ? ` · material ${inr(g.cost)}` : ''}</p>
              </div>
              {g.mats.map(m => (
                <div key={m.material + m.unit} className="flex justify-between text-xs py-1 border-t border-gray-800 mt-1">
                  <span className="text-gray-300">{m.material}</span>
                  <span className="text-gray-200 font-mono">{Number(m.used.toFixed(2))} {m.unit}{m.perPiece != null && <span className="text-brand-400"> · {m.perPiece.toFixed(3)} {m.unit}/pc</span>}</span>
                </div>
              ))}
            </div>
          ))}
          {usage.length === 0 && <p className="text-sm text-gray-500">Issue material to an order to see consumption per piece here.</p>}
        </div>
      )}

      {tab === 'log' && (
        <>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search material, supplier, PO…" className="w-full bg-gray-900 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-xl px-3 py-2 text-sm mb-3 focus:outline-none focus:border-brand-500" />
          <MoveList moves={shownMoves} canEdit={canEdit} onChanged={load} />
        </>
      )}

      {form && <MoveForm initial={form} products={products} moves={moves} onClose={() => setForm(null)} onSaved={() => { setForm(null); load() }} />}
    </div>
  )
}

function MoveList({ moves, canEdit, onChanged }) {
  const del = async (m) => {
    if (!confirm(`Delete this ${DIR[m.direction].label.toLowerCase()} entry?`)) return
    try { must(await supabase.from('material_moves').delete().eq('id', m.id), 'Deleting'); onChanged() } catch (e) { toast(e.message, 'error') }
  }
  return (
    <div className="space-y-1.5">
      {moves.map(m => (
        <div key={m.id} className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 flex items-center gap-3 text-xs">
          <span className={`px-2 py-0.5 rounded border font-semibold text-[10px] ${DIR[m.direction].cls}`}>{DIR[m.direction].label}</span>
          <div className="flex-1 min-w-0">
            <p className="text-gray-100 font-semibold truncate">{m.material} · {Number(m.quantity)} {m.unit}{m.rate ? <span className="text-gray-400 font-normal"> @ {inr(m.rate)}</span> : null}</p>
            <p className="text-gray-500 truncate">
              {fmtDay(m.moved_at)}{m.supplier ? ` · ${m.supplier}` : ''}{m.products ? <> · <Link className="text-brand-400" to={`/products/${m.product_id}`}>{m.products.name}</Link></> : ''}{m.po_number ? ` · PO ${m.po_number}` : ''}{m.employees ? ` · to ${m.employees.name}` : ''}{m.notes ? ` · ${m.notes}` : ''}
            </p>
          </div>
          {m.photo_url && <a href={m.photo_url} target="_blank" rel="noreferrer" className="text-gray-400">📎</a>}
          {canEdit && <button onClick={() => del(m)} className="text-gray-500 hover:text-red-400">✕</button>}
        </div>
      ))}
      {moves.length === 0 && <p className="text-sm text-gray-500">No movements.</p>}
    </div>
  )
}

export function MoveForm({ initial, products, moves = [], onClose, onSaved }) {
  const { user } = useAuth()
  const [f, setF] = useState({ direction: 'in', material: '', unit: 'kg', quantity: '', rate: '', supplier: '', product_id: '', po_number: '', employee_id: '', moved_at: todayISO(), notes: '', ...initial })
  const [employees, setEmployees] = useState([])
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { supabase.from('employees').select('id, name').eq('active', true).order('name').then(({ data }) => setEmployees(data || [])) }, [])
  const materials = [...new Set(moves.map(m => m.material))]
  const suppliers = [...new Set(moves.map(m => m.supplier).filter(Boolean))]
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const active = products.filter(p => !isDone(p) || p.id === f.product_id)

  const save = async (e) => {
    e.preventDefault()
    if (!f.material.trim() || !(Number(f.quantity) > 0)) { toast('Material and a quantity are needed', 'warn'); return }
    if (f.direction !== 'in' && !f.product_id && !f.po_number.trim()) { toast('Pick the order this is for', 'warn'); return }
    setSaving(true)
    try {
      const prod = products.find(p => p.id === f.product_id)
      const photo_url = file ? await uploadPhoto(file, 'products') : null
      must(await supabase.from('material_moves').insert({
        direction: f.direction, material: f.material.trim(), unit: f.unit, quantity: Number(f.quantity),
        rate: f.rate === '' ? null : Number(f.rate), supplier: f.supplier.trim() || null,
        product_id: f.product_id || null, po_number: (f.po_number || prod?.po_number || '').trim().toUpperCase() || null,
        brand_id: prod?.brand_id || null, employee_id: f.employee_id || null, moved_at: f.moved_at, notes: f.notes.trim() || null,
        photo_url, created_by: user?.name || null,
      }), 'Saving')
      toast(`${DIR[f.direction].label}: ${f.quantity} ${f.unit} ${f.material}`, 'success')
      onSaved()
    } catch (err) { toast(err.message, 'error') } finally { setSaving(false) }
  }

  return (
    <Modal onClose={onClose}>
      <form onSubmit={save}>
        <div className="grid grid-cols-3 gap-1 bg-gray-950 border border-gray-800 rounded-xl p-1 mb-4">
          {Object.entries(DIR).map(([k, d]) => <button type="button" key={k} onClick={() => set('direction', k)} className={`py-1.5 rounded-lg text-xs font-bold ${f.direction === k ? 'bg-brand-600 text-white' : 'text-gray-400'}`}>{d.label}</button>)}
        </div>
        <label className={labelClass}>Material</label>
        <input list="mat-list" value={f.material} onChange={e => set('material', e.target.value)} placeholder="e.g. Cotton jersey 180gsm black" className={inputClass} />
        <datalist id="mat-list">{materials.map(m => <option key={m} value={m} />)}</datalist>
        <div className="grid grid-cols-2 gap-2">
          <div><label className={labelClass}>Quantity</label><input type="number" step="0.01" inputMode="decimal" value={f.quantity} onChange={e => set('quantity', e.target.value)} className={inputClass} /></div>
          <div><label className={labelClass}>Unit</label><select value={f.unit} onChange={e => set('unit', e.target.value)} className={inputClass}>{UNITS.map(u => <option key={u}>{u}</option>)}</select></div>
        </div>
        {f.direction === 'in' && (
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelClass}>Rate / {f.unit}</label><input type="number" step="0.01" value={f.rate} onChange={e => set('rate', e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Supplier</label><input list="sup-list" value={f.supplier} onChange={e => set('supplier', e.target.value)} className={inputClass} /><datalist id="sup-list">{suppliers.map(s => <option key={s} value={s} />)}</datalist></div>
          </div>
        )}
        <label className={labelClass}>{f.direction === 'in' ? 'For order (optional)' : 'Order'}</label>
        <select value={f.product_id} onChange={e => set('product_id', e.target.value)} className={inputClass}>
          <option value="">{f.direction === 'in' ? 'General stock' : 'Select garment…'}</option>
          {active.map(p => <option key={p.id} value={p.id}>{p.po_number ? `${p.po_number} · ` : ''}{p.name}{p.brands?.name ? ` (${p.brands.name})` : ''}</option>)}
        </select>
        {f.direction === 'issue' && <>
          <label className={labelClass}>Given to</label>
          <select value={f.employee_id} onChange={e => set('employee_id', e.target.value)} className={inputClass}>
            <option value="">—</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </>}
        <div className="grid grid-cols-2 gap-2">
          <div><label className={labelClass}>Date</label><input type="date" value={f.moved_at} onChange={e => set('moved_at', e.target.value)} className={inputClass} /></div>
          <div><label className={labelClass}>{f.direction === 'in' ? 'Bill photo' : 'Photo'}</label><input type="file" accept="image/*" capture="environment" onChange={e => setFile(e.target.files[0])} className="w-full text-xs text-gray-300 mt-2" /></div>
        </div>
        <label className={labelClass}>Notes</label>
        <input value={f.notes} onChange={e => set('notes', e.target.value)} className={inputClass} placeholder="lot / roll no., colour…" />
        <FormActions onCancel={onClose} saving={saving} />
      </form>
    </Modal>
  )
}

// Tab on a garment's page: its material movements and consumption per piece.
export function MaterialsPanel({ product, canEdit }) {
  const [moves, setMoves] = useState([])
  const [cut, setCut] = useState(0)
  const [form, setForm] = useState(null)
  const load = async () => {
    const po = (product.po_number || '').trim().toUpperCase()
    const m = await loadMoves(q => po ? q.or(`product_id.eq.${product.id},po_number.eq.${po}`) : q.eq('product_id', product.id))
    setMoves(m)
    const { data } = await supabase.from('work_logs').select('quantity').eq('product_id', product.id).eq('work_type', 'cutting')
    setCut((data || []).reduce((s, l) => s + Number(l.quantity || 0), 0))
  }
  useEffect(() => { load() }, [product.id])
  const used = stockOf(moves.filter(m => m.direction !== 'in').map(m => ({ ...m, direction: m.direction === 'issue' ? 'return' : 'issue' })))
  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex gap-2">
          <button onClick={() => setForm({ direction: 'issue', product_id: product.id })} className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-3 py-2 text-xs font-semibold">Issue material</button>
          <button onClick={() => setForm({ direction: 'in', product_id: product.id })} className="bg-gray-800 border border-gray-700 text-gray-200 rounded-xl px-3 py-2 text-xs font-semibold">Receive for this order</button>
        </div>
      )}
      {used.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-xs">
          <p className="text-gray-400 mb-1">{product.po_number ? `Used on PO ${product.po_number}` : 'Used on this garment'} · {cut ? `${cut} pcs cut on this garment` : 'no cutting logged yet'}</p>
          {used.map(u => <div key={u.material + u.unit} className="flex justify-between py-1 border-t border-gray-800"><span className="text-gray-300">{u.material}</span><span className="font-mono text-gray-100">{Number(u.qty.toFixed(2))} {u.unit}{cut && !product.po_number ? <span className="text-brand-400"> · {(u.qty / cut).toFixed(3)}/pc</span> : null}</span></div>)}
        </div>
      )}
      <MoveList moves={moves} canEdit={canEdit} onChanged={load} />
      {form && <MoveForm initial={form} products={[product]} moves={moves} onClose={() => setForm(null)} onSaved={() => { setForm(null); load() }} />}
    </div>
  )
}
