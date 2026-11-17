import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, must } from '../supabaseClient.js'
import Modal, { FormActions, inputClass, labelClass } from '../components/Modal.jsx'
import { useAuth } from '../components/PinGate.jsx'
import { can } from '../permissions.js'
import { toast } from '../components/Toast.jsx'
import { WORK_TYPE_LABEL } from '../workTypes.js'
import { todayISO, addDays, fmtDay, daysBetween, inr, isDone } from '../production.js'

const OUT_TYPES = ['screen_printing', 'embroidery', 'stitching', 'cutting', 'other']
const outstanding = j => j.qty_sent - j.qty_returned - j.qty_rejected

async function loadJobs(filter) {
  let q = supabase.from('job_work').select('*, vendors(name, phone), products(name, po_number, cover_photo_url)').order('sent_at', { ascending: false })
  if (filter) q = filter(q)
  const { data, error } = await q
  if (error) { toast(/does not exist|schema cache/i.test(error.message) ? 'Run migration_008 to enable job work.' : error.message, 'error'); return [] }
  return data || []
}

export default function JobWork() {
  const { user } = useAuth()
  const canEdit = can(user, 'manage_job_work')
  const [jobs, setJobs] = useState([])
  const [vendors, setVendors] = useState([])
  const [products, setProducts] = useState([])
  const [form, setForm] = useState(null)
  const [returning, setReturning] = useState(null)
  const [vendorForm, setVendorForm] = useState(null)
  const [filter, setFilter] = useState('out')

  const load = async () => {
    const [j, { data: v }, { data: p }] = await Promise.all([
      loadJobs(),
      supabase.from('vendors').select('*').order('name'),
      supabase.from('products').select('id, name, po_number, stage, status, brands(name)').order('created_at', { ascending: false }),
    ])
    setJobs(j); setVendors(v || []); setProducts(p || [])
  }
  useEffect(() => { load() }, [])

  const out = jobs.filter(j => outstanding(j) > 0)
  const late = out.filter(j => j.expected_back && j.expected_back < todayISO())
  const shown = filter === 'out' ? out : filter === 'late' ? late : jobs

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="text-xl font-bold text-gray-100">Job Work</h2>
        {canEdit && (
          <div className="flex gap-2">
            <button onClick={() => setVendorForm({})} className="bg-gray-800 border border-gray-700 text-gray-200 rounded-xl px-3 py-2 text-xs font-semibold">Vendors ({vendors.length})</button>
            <button onClick={() => setForm({})} className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-3 py-2 text-xs font-semibold">+ Send out</button>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-3">Pieces sent to outside printers, embroiderers or tailors, and what's come back. If goods move under a delivery challan, raise it in Accounts (purpose “Job Work”).</p>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <Stat label="Out with vendors" value={`${out.reduce((s, j) => s + outstanding(j), 0)} pcs`} sub={`${out.length} batches`} />
        <Stat label="Overdue" value={late.length} sub="past expected date" tone={late.length ? 'text-red-400' : ''} />
        <Stat label="Rejected by us" value={`${jobs.reduce((s, j) => s + j.qty_rejected, 0)} pcs`} sub="all time" />
      </div>

      <div className="flex gap-1.5 mb-3">
        {[['out', 'Still out'], ['late', 'Overdue'], ['all', 'All']].map(([k, l]) => <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${filter === k ? 'bg-brand-600 text-white' : 'bg-gray-800 border border-gray-700 text-gray-300'}`}>{l}</button>)}
      </div>
      <JobList jobs={shown} canEdit={canEdit} onReturn={setReturning} onChanged={load} showProduct />

      {form && <SendForm vendors={vendors} products={products} initial={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); load() }} onNewVendor={() => setVendorForm({})} />}
      {returning && <ReturnForm job={returning} onClose={() => setReturning(null)} onSaved={() => { setReturning(null); load() }} />}
      {vendorForm && <VendorManager vendors={vendors} onClose={() => setVendorForm(null)} onChanged={load} />}
    </div>
  )
}

function Stat({ label, value, sub, tone = '' }) {
  return <div className="bg-gray-900 border border-gray-800 rounded-xl p-3"><p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">{label}</p><p className={`text-lg font-black text-gray-100 ${tone}`}>{value}</p><p className="text-[10px] text-gray-500">{sub}</p></div>
}

function JobList({ jobs, canEdit, onReturn, onChanged, showProduct }) {
  const del = async (j) => {
    if (!confirm('Delete this job work entry?')) return
    try { must(await supabase.from('job_work').delete().eq('id', j.id), 'Deleting'); onChanged() } catch (e) { toast(e.message, 'error') }
  }
  return (
    <div className="space-y-2">
      {jobs.map(j => {
        const left = outstanding(j)
        const overdue = left > 0 && j.expected_back && j.expected_back < todayISO()
        return (
          <div key={j.id} className={`bg-gray-900 border rounded-xl p-3 ${overdue ? 'border-red-900' : 'border-gray-800'}`}>
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0 text-xs">
                <p className="text-sm font-semibold text-gray-100">{j.vendors?.name || 'Vendor'} · {WORK_TYPE_LABEL[j.work_type] || j.work_type}</p>
                {showProduct && j.products && <p className="text-gray-400 truncate"><Link className="text-brand-400" to={`/products/${j.product_id}`}>{j.products.name}</Link>{j.products.po_number ? ` · ${j.products.po_number}` : ''}</p>}
                <p className="text-gray-500 mt-0.5">Sent {j.qty_sent} on {fmtDay(j.sent_at)}{j.expected_back ? ` · due back ${fmtDay(j.expected_back)}` : ''}{j.rate ? ` · ${inr(j.rate)}/pc = ${inr(j.rate * j.qty_sent)}` : ''}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, ((j.qty_returned + j.qty_rejected) / j.qty_sent) * 100)}%` }} /></div>
                  <span className={`font-semibold ${left ? (overdue ? 'text-red-400' : 'text-amber-300') : 'text-emerald-400'}`}>{left ? `${left} still out${overdue ? ` · ${daysBetween(j.expected_back, todayISO())}d late` : ''}` : '✓ all back'}</span>
                </div>
                {j.qty_rejected > 0 && <p className="text-red-400 mt-1">{j.qty_rejected} rejected on return</p>}
              </div>
              {canEdit && (
                <div className="flex flex-col gap-1">
                  {left > 0 && <button onClick={() => onReturn(j)} className="bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg px-2.5 py-1 text-[11px] font-semibold">Receive back</button>}
                  {j.vendors?.phone && left > 0 && <a href={`https://wa.me/${j.vendors.phone.replace(/\D/g, '').replace(/^(\d{10})$/, '91$1')}?text=${encodeURIComponent(`Hi, checking on ${left} pcs of ${j.products?.name || 'our order'} (${WORK_TYPE_LABEL[j.work_type] || j.work_type}) sent on ${fmtDay(j.sent_at)}. When can we expect them?`)}`} target="_blank" rel="noreferrer" className="text-center bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-2.5 py-1 text-[11px]">WhatsApp</a>}
                  <button onClick={() => del(j)} className="text-gray-500 hover:text-red-400 text-[11px]">Delete</button>
                </div>
              )}
            </div>
          </div>
        )
      })}
      {jobs.length === 0 && <p className="text-sm text-gray-500">Nothing here.</p>}
    </div>
  )
}

function SendForm({ vendors, products, initial, onClose, onSaved, onNewVendor }) {
  const { user } = useAuth()
  const [f, setF] = useState({ vendor_id: vendors[0]?.id || '', product_id: '', work_type: 'screen_printing', qty_sent: '', sent_at: todayISO(), expected_back: addDays(todayISO(), 5), rate: '', notes: '', ...initial })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const save = async (e) => {
    e.preventDefault()
    if (!f.vendor_id || !f.product_id || !(Number(f.qty_sent) > 0)) { toast('Vendor, garment and quantity are needed', 'warn'); return }
    setSaving(true)
    try {
      must(await supabase.from('job_work').insert({ ...f, qty_sent: Number(f.qty_sent), rate: f.rate === '' ? null : Number(f.rate), expected_back: f.expected_back || null, notes: f.notes.trim() || null, created_by: user?.name || null }), 'Saving')
      toast('Sent out', 'success'); onSaved()
    } catch (err) { toast(err.message, 'error') } finally { setSaving(false) }
  }
  return (
    <Modal onClose={onClose}>
      <form onSubmit={save}>
        <h3 className="text-lg font-bold mb-4 text-gray-100">Send out for job work</h3>
        <label className={labelClass}>Vendor</label>
        <div className="flex gap-2">
          <select value={f.vendor_id} onChange={e => set('vendor_id', e.target.value)} className={inputClass}>
            <option value="">Select…</option>{vendors.filter(v => v.active !== false).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <button type="button" onClick={onNewVendor} className="mb-3 px-3 rounded-xl bg-gray-800 border border-gray-700 text-gray-200 text-xs whitespace-nowrap">+ New</button>
        </div>
        <label className={labelClass}>Garment</label>
        <select value={f.product_id} onChange={e => set('product_id', e.target.value)} className={inputClass}>
          <option value="">Select…</option>
          {products.filter(p => !isDone(p) || p.id === f.product_id).map(p => <option key={p.id} value={p.id}>{p.po_number ? `${p.po_number} · ` : ''}{p.name}</option>)}
        </select>
        <label className={labelClass}>Work</label>
        <div className="flex flex-wrap gap-1.5 mb-3">{OUT_TYPES.map(t => <button type="button" key={t} onClick={() => set('work_type', t)} className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${f.work_type === t ? 'bg-brand-600 border-brand-600 text-white' : 'bg-gray-950 border-gray-700 text-gray-300'}`}>{WORK_TYPE_LABEL[t] || t}</button>)}</div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className={labelClass}>Pieces sent</label><input type="number" value={f.qty_sent} onChange={e => set('qty_sent', e.target.value)} className={inputClass} /></div>
          <div><label className={labelClass}>Rate / pc</label><input type="number" step="0.01" value={f.rate} onChange={e => set('rate', e.target.value)} className={inputClass} /></div>
          <div><label className={labelClass}>Sent on</label><input type="date" value={f.sent_at} onChange={e => set('sent_at', e.target.value)} className={inputClass} /></div>
          <div><label className={labelClass}>Expected back</label><input type="date" value={f.expected_back} onChange={e => set('expected_back', e.target.value)} className={inputClass} /></div>
        </div>
        <label className={labelClass}>Notes</label>
        <input value={f.notes} onChange={e => set('notes', e.target.value)} className={inputClass} placeholder="challan no., artwork ref…" />
        <FormActions onCancel={onClose} saving={saving} />
      </form>
    </Modal>
  )
}

function ReturnForm({ job, onClose, onSaved }) {
  const left = outstanding(job)
  const [ok, setOk] = useState(String(left))
  const [rej, setRej] = useState('')
  const [date, setDate] = useState(todayISO())
  const [saving, setSaving] = useState(false)
  const save = async (e) => {
    e.preventDefault()
    const a = Number(ok) || 0, r = Number(rej) || 0
    if (a + r <= 0 || a + r > left) { toast(`Enter between 1 and ${left} pieces`, 'warn'); return }
    setSaving(true)
    try {
      must(await supabase.from('job_work').update({ qty_returned: job.qty_returned + a, qty_rejected: job.qty_rejected + r, returned_at: date }).eq('id', job.id), 'Saving')
      toast(`${a} back${r ? `, ${r} rejected` : ''}`, 'success'); onSaved()
    } catch (err) { toast(err.message, 'error') } finally { setSaving(false) }
  }
  return (
    <Modal onClose={onClose}>
      <form onSubmit={save}>
        <h3 className="text-lg font-bold mb-1 text-gray-100">Receive back from {job.vendors?.name}</h3>
        <p className="text-xs text-gray-400 mb-4">{job.products?.name} · {left} pcs outstanding</p>
        <div className="grid grid-cols-2 gap-2">
          <div><label className={labelClass}>Good pieces</label><input type="number" value={ok} onChange={e => setOk(e.target.value)} className={inputClass} /></div>
          <div><label className={labelClass}>Rejected</label><input type="number" value={rej} onChange={e => setRej(e.target.value)} className={inputClass} /></div>
        </div>
        <label className={labelClass}>Date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputClass} />
        <FormActions onCancel={onClose} saving={saving} />
      </form>
    </Modal>
  )
}

function VendorManager({ vendors, onClose, onChanged }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [services, setServices] = useState([])
  const add = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    try { must(await supabase.from('vendors').insert({ name: name.trim(), phone: phone.trim() || null, services }), 'Adding vendor'); setName(''); setPhone(''); setServices([]); toast('Vendor added', 'success'); onChanged() }
    catch (err) { toast(err.message, 'error') }
  }
  const toggle = async (v) => { try { must(await supabase.from('vendors').update({ active: !v.active }).eq('id', v.id), 'Updating'); onChanged() } catch (e) { toast(e.message, 'error') } }
  return (
    <Modal onClose={onClose}>
      <h3 className="text-lg font-bold mb-3 text-gray-100">Job work vendors</h3>
      <div className="space-y-1.5 mb-4 max-h-60 overflow-y-auto">
        {vendors.map(v => (
          <div key={v.id} className={`flex items-center justify-between bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs ${v.active === false ? 'opacity-50' : ''}`}>
            <span className="text-gray-100 font-semibold">{v.name}<span className="text-gray-500 font-normal"> {v.phone || ''} {(v.services || []).map(s => WORK_TYPE_LABEL[s] || s).join(', ')}</span></span>
            <button onClick={() => toggle(v)} className="text-gray-400 hover:text-gray-100">{v.active === false ? 'Reactivate' : 'Deactivate'}</button>
          </div>
        ))}
        {vendors.length === 0 && <p className="text-xs text-gray-500">No vendors yet.</p>}
      </div>
      <form onSubmit={add} className="border-t border-gray-800 pt-3">
        <label className={labelClass}>New vendor</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" className={inputClass} />
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone (for WhatsApp follow-ups)" className={inputClass} />
        <div className="flex flex-wrap gap-1.5 mb-3">{OUT_TYPES.map(t => <button type="button" key={t} onClick={() => setServices(s => s.includes(t) ? s.filter(x => x !== t) : [...s, t])} className={`px-2.5 py-1 rounded-lg text-[11px] border ${services.includes(t) ? 'bg-brand-600 border-brand-600 text-white' : 'bg-gray-950 border-gray-700 text-gray-300'}`}>{WORK_TYPE_LABEL[t] || t}</button>)}</div>
        <button className="w-full bg-brand-600 hover:bg-brand-700 text-white rounded-xl py-2.5 text-xs font-bold">Add vendor</button>
      </form>
    </Modal>
  )
}

export function JobWorkPanel({ product, canEdit }) {
  const [jobs, setJobs] = useState([])
  const [vendors, setVendors] = useState([])
  const [form, setForm] = useState(false)
  const [returning, setReturning] = useState(null)
  const [vendorForm, setVendorForm] = useState(false)
  const load = async () => {
    setJobs(await loadJobs(q => q.eq('product_id', product.id)))
    const { data } = await supabase.from('vendors').select('*').order('name'); setVendors(data || [])
  }
  useEffect(() => { load() }, [product.id])
  return (
    <div className="space-y-3">
      {canEdit && <button onClick={() => setForm(true)} className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-3 py-2 text-xs font-semibold">+ Send out for job work</button>}
      <JobList jobs={jobs} canEdit={canEdit} onReturn={setReturning} onChanged={load} />
      {form && <SendForm vendors={vendors} products={[product]} initial={{ product_id: product.id }} onClose={() => setForm(false)} onSaved={() => { setForm(false); load() }} onNewVendor={() => setVendorForm(true)} />}
      {returning && <ReturnForm job={returning} onClose={() => setReturning(null)} onSaved={() => { setReturning(null); load() }} />}
      {vendorForm && <VendorManager vendors={vendors} onClose={() => setVendorForm(false)} onChanged={load} />}
    </div>
  )
}
