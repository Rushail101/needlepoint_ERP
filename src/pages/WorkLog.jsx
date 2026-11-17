import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { supabase, must } from '../supabaseClient.js'
import Modal, { FormActions, inputClass, labelClass } from '../components/Modal.jsx'
import { WORK_TYPES, WORK_TYPE_LABEL, REJECT_REASONS } from '../workTypes.js'
import { useAuth } from '../components/PinGate.jsx'
import { toast } from '../components/Toast.jsx'
import { saveWorkLog, flushQueue, pendingCount, onQueueChange } from '../offlineQueue.js'
import { isDone, suggestedStage, deliveryStatus } from '../production.js'
import { stageInfo } from '../stages.js'

// Guided flow: garment → person → work. The person step is skipped when the
// logged-in user is linked to a team member, and "Save & next" keeps the
// garment and person so a batch of entries is a few taps each.
export default function WorkLog() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const preselectProductId = searchParams.get('product')
  const [step, setStep] = useState(1)
  const [products, setProducts] = useState([])
  const [employees, setEmployees] = useState([])
  const [recentLogs, setRecentLogs] = useState([])
  const [product, setProduct] = useState(null)
  const [sizes, setSizes] = useState([])
  const [productLogs, setProductLogs] = useState([])
  const [employee, setEmployee] = useState(null)
  const [workType, setWorkType] = useState(null)
  const [sizeLabel, setSizeLabel] = useState('')
  const [quantity, setQuantity] = useState('')
  const [rejected, setRejected] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [responsibleId, setResponsibleId] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [editingLog, setEditingLog] = useState(null)
  const [search, setSearch] = useState('')
  const [showFinished, setShowFinished] = useState(false)
  const [queued, setQueued] = useState(pendingCount())

  const loadAll = async () => {
    const [{ data: p }, { data: e }, { data: l }] = await Promise.all([
      supabase.from('products').select('*, brands(name)').order('created_at', { ascending: false }),
      supabase.from('employees').select('*').eq('active', true).order('name'),
      supabase.from('work_logs').select('*, products(name, cover_photo_url), employees!work_logs_employee_id_fkey(name)').order('logged_at', { ascending: false }).limit(15),
    ])
    setProducts(p || []); setEmployees(e || []); setRecentLogs(l || [])
    if (preselectProductId && !product) {
      const match = (p || []).find(x => x.id === preselectProductId)
      if (match) pickProduct(match, e || [])
    }
  }
  useEffect(() => { loadAll(); flushQueue().then(n => { if (n) { toast(`${n} offline entr${n === 1 ? 'y' : 'ies'} sent`, 'success'); loadAll() } }) }, [])
  useEffect(() => onQueueChange(setQueued), [])

  // The logged-in floor staff member, if their login is linked to the team.
  const me = useMemo(() => employees.find(x => x.id === user?.employeeId) || null, [employees, user])

  const pickProduct = async (p, emps = employees) => {
    setProduct(p)
    const [{ data: sz }, { data: lg }] = await Promise.all([
      supabase.from('product_sizes').select('*').eq('product_id', p.id).order('size_label'),
      supabase.from('work_logs').select('id, work_type, quantity, size_label, employee_id, rejected_qty').eq('product_id', p.id),
    ])
    setSizes(sz || []); setProductLogs(lg || [])
    const self = emps.find(x => x.id === user?.employeeId)
    if (self && !employee) { setEmployee(self); setStep(3) } else setStep(employee ? 3 : 2)
  }

  const clearWork = () => { setWorkType(null); setSizeLabel(''); setQuantity(''); setRejected(''); setRejectReason(''); setResponsibleId(''); setNotes(''); setFile(null) }
  const reset = () => { setStep(1); setProduct(null); setEmployee(null); clearWork() }

  // How many pieces of this work are still to do (for the "rest" quick button).
  const remaining = useMemo(() => {
    if (!workType || !product) return 0
    const ordered = sizeLabel ? Number(sizes.find(s => s.size_label === sizeLabel)?.quantity || 0) : sizes.reduce((s, x) => s + (Number(x.quantity) || 0), 0)
    const done = productLogs.filter(l => l.work_type === workType && (!sizeLabel || l.size_label === sizeLabel)).reduce((s, l) => s + (Number(l.quantity) || 0), 0)
    return Math.max(0, ordered - done)
  }, [workType, sizeLabel, sizes, productLogs, product])

  const submit = async (again) => {
    if (workType === 'qc' && !quantity && !rejected) { toast('Enter how many passed or were rejected', 'warn'); return }
    if (Number(rejected) > 0 && !rejectReason) { toast('Pick a reason for the rejected pieces', 'warn'); return }
    setSaving(true)
    try {
      const row = {
        product_id: product.id,
        employee_id: employee?.id || null,
        work_type: workType,
        size_label: sizeLabel || null,
        quantity: Number(quantity) || null,
        rejected_qty: Number(rejected) || null,
        reject_reason: Number(rejected) > 0 ? rejectReason : null,
        responsible_employee_id: Number(rejected) > 0 && responsibleId ? responsibleId : null,
        notes: notes.trim() || null,
        logged_by: user?.name || null,
      }
      const { queued: q } = await saveWorkLog(row, file)
      if (q) toast('No connection — saved on this phone and will send automatically', 'warn', 5000)
      else {
        // Move the garment's stage forward if this entry completes a step.
        const logs = [...productLogs, row]
        const next = suggestedStage(product, sizes, logs)
        if (next) {
          const res = await supabase.from('products').update({ stage: next }).eq('id', product.id)
          if (!res.error) { setProduct(p => ({ ...p, stage: next })); toast(`Saved · ${product.name} moved to ${stageInfo(next).label}`, 'success') }
          else toast('Saved', 'success')
        } else toast('Saved', 'success')
        setProductLogs(logs)
      }
      if (again) { clearWork() } else { reset() }
      loadAll()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const q = search.trim().toLowerCase()
  const lastTouched = Object.fromEntries(recentLogs.map((l, i) => [l.product_id, i]))
  const shown = products
    .filter(p => showFinished || !isDone(p))
    .filter(p => !q || [p.name, p.style_code, p.po_number, p.brands?.name].some(v => (v || '').toLowerCase().includes(q)))
    .sort((a, b) => (lastTouched[a.id] ?? 999) - (lastTouched[b.id] ?? 999))
  const stitchers = employees.filter(e => productLogs.some(l => l.employee_id === e.id && ['stitching', 'embroidery', 'screen_printing'].includes(l.work_type)))

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-bold text-gray-100">Log Work</h2>
        {queued > 0 && (
          <button onClick={async () => { const n = await flushQueue(); toast(n ? `${n} sent` : 'Still offline — will retry', n ? 'success' : 'warn') }}
            className="text-[11px] px-2.5 py-1 rounded-full bg-amber-950/80 border border-amber-700 text-amber-300 font-semibold">⏳ {queued} waiting to send</button>
        )}
      </div>

      <div className="flex items-center gap-2 mb-4 text-sm overflow-x-auto">
        <StepPill active={step >= 1} done={!!product} label={product ? product.name : 'Garment'} onClick={() => setStep(1)} />
        <span className="text-gray-700">→</span>
        <StepPill active={step >= 2} done={!!employee} label={employee ? employee.name : 'Person'} onClick={() => product && setStep(2)} />
        <span className="text-gray-700">→</span>
        <StepPill active={step >= 3} done={!!workType} label="Work" onClick={() => product && setStep(3)} />
      </div>

      {step === 1 && (
        <div>
          <div className="flex gap-2 mb-3">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search garment, style, PO, brand…"
              className="flex-1 bg-gray-900 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
            <button onClick={() => setShowFinished(s => !s)} className={`px-3 rounded-xl text-xs font-semibold border ${showFinished ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-gray-900 border-gray-700 text-gray-400'}`}>
              {showFinished ? 'All' : 'Active'}
            </button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {shown.map(p => {
              const ds = deliveryStatus(p)
              return (
                <button key={p.id} onClick={() => pickProduct(p)} className="bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl overflow-hidden text-left">
                  <div className="aspect-square bg-gray-800 relative">
                    {p.cover_photo_url ? <img src={p.cover_photo_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-2xl text-gray-600">👕</div>}
                    {ds && ds.key !== 'ok' && <span className={`absolute bottom-1 left-1 text-[9px] px-1.5 py-0.5 rounded border font-semibold ${ds.cls}`}>{ds.text}</span>}
                  </div>
                  <div className="p-1.5">
                    <p className="text-xs font-medium truncate text-gray-200">{p.name}</p>
                    <p className="text-[10px] text-gray-500 truncate">{p.po_number || p.brands?.name || ''} · {stageInfo(p.stage).label}</p>
                  </div>
                </button>
              )
            })}
          </div>
          {shown.length === 0 && <p className="text-gray-500 text-sm mt-3">{products.length ? 'No garments match.' : 'No garments yet — create an order first.'}</p>}
        </div>
      )}

      {step === 2 && product && (
        <div>
          <SelectedGarmentBanner product={product} />
          {me && <button onClick={() => { setEmployee(me); setStep(3) }} className="mt-3 w-full bg-brand-600/20 border border-brand-700 text-brand-300 rounded-xl py-2.5 text-sm font-semibold">It's me — {me.name}</button>}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3">
            {employees.map(e => (
              <button key={e.id} onClick={() => { setEmployee(e); setStep(3) }}
                className={`bg-gray-900 border rounded-xl p-2 flex flex-col items-center gap-1 ${employee?.id === e.id ? 'border-brand-500' : 'border-gray-800 hover:border-gray-600'}`}>
                <div className="w-12 h-12 rounded-full bg-gray-800 overflow-hidden">
                  {e.photo_url ? <img src={e.photo_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-lg">🧑</div>}
                </div>
                <p className="text-xs font-medium text-center truncate w-full text-gray-200">{e.name}</p>
                {e.role && <p className="text-[10px] text-gray-500 truncate w-full text-center">{e.role}</p>}
              </button>
            ))}
          </div>
          {employees.length === 0 && <p className="text-gray-500 text-sm mt-3">No team members yet — add someone in the Team tab first.</p>}
        </div>
      )}

      {step === 3 && product && (
        <div>
          <SelectedGarmentBanner product={product} employee={employee} onChangePerson={() => setStep(2)} />
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3 mb-4">
            {WORK_TYPES.map(w => (
              <button key={w.key} onClick={() => setWorkType(w.key)}
                className={`border rounded-xl p-2.5 flex flex-col items-center gap-1 ${workType === w.key ? 'bg-brand-600 text-white border-brand-600' : 'bg-gray-900 border-gray-800 text-gray-200 hover:border-gray-600'}`}>
                <span className="text-xl">{w.icon}</span>
                <span className="text-[11px] font-medium text-center leading-tight">{w.label}</span>
              </button>
            ))}
          </div>

          {workType && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              {sizes.length > 0 && (
                <>
                  <label className={labelClass}>Size</label>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {[{ size_label: '' }, ...sizes].map(s => (
                      <button key={s.size_label || 'all'} type="button" onClick={() => setSizeLabel(s.size_label)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${sizeLabel === s.size_label ? 'bg-brand-600 border-brand-600 text-white' : 'bg-gray-950 border-gray-700 text-gray-300'}`}>
                        {s.size_label || 'All / mixed'}{s.quantity ? <span className="opacity-60 font-normal"> {s.quantity}</span> : null}
                      </button>
                    ))}
                  </div>
                </>
              )}

              <label className={labelClass}>{workType === 'qc' ? 'Passed QC (pieces)' : 'Pieces done'}</label>
              <div className="flex gap-1.5 mb-3">
                <input type="number" inputMode="numeric" min="0" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0"
                  className="flex-1 bg-gray-950 border border-gray-700 text-gray-100 rounded-xl px-3.5 py-2.5 text-lg font-bold focus:outline-none focus:border-brand-500" />
                {[10, 25, 50].map(n => <button key={n} type="button" onClick={() => setQuantity(String((Number(quantity) || 0) + n))} className="px-3 rounded-xl bg-gray-800 border border-gray-700 text-gray-200 text-xs font-bold">+{n}</button>)}
                {remaining > 0 && <button type="button" onClick={() => setQuantity(String(remaining))} className="px-3 rounded-xl bg-emerald-950 border border-emerald-800 text-emerald-300 text-xs font-bold" title="Everything still to do">Rest {remaining}</button>}
              </div>

              {(workType === 'qc' || workType === 'alteration') && (
                <div className="bg-red-950/20 border border-red-900/50 rounded-xl p-3 mb-3">
                  <label className={labelClass}>Rejected pieces</label>
                  <input type="number" inputMode="numeric" min="0" value={rejected} onChange={e => setRejected(e.target.value)} placeholder="0" className={inputClass} />
                  {Number(rejected) > 0 && (
                    <>
                      <label className={labelClass}>Reason</label>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {REJECT_REASONS.map(r => (
                          <button key={r} type="button" onClick={() => setRejectReason(r)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${rejectReason === r ? 'bg-red-600 border-red-600 text-white' : 'bg-gray-950 border-gray-700 text-gray-300'}`}>{r}</button>
                        ))}
                      </div>
                      <label className={labelClass}>Whose work was it? (optional)</label>
                      <select value={responsibleId} onChange={e => setResponsibleId(e.target.value)} className={inputClass}>
                        <option value="">Not sure</option>
                        {(stitchers.length ? stitchers : employees).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                    </>
                  )}
                </div>
              )}

              <label className={labelClass}>Photo (optional)</label>
              <input type="file" accept="image/*" capture="environment" onChange={e => setFile(e.target.files[0])} className="w-full mb-3 text-sm text-gray-300" />
              <label className={labelClass}>Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={inputClass} placeholder="optional" />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => submit(true)} disabled={saving} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-100 rounded-xl py-3 text-sm font-semibold disabled:opacity-50">Save &amp; log more</button>
                <button onClick={() => submit(false)} disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          )}
        </div>
      )}

      <h3 className="text-sm font-bold text-gray-500 mt-8 mb-2 uppercase tracking-wide">Recent activity</h3>
      <div className="space-y-2">
        {recentLogs.map(l => (
          <button key={l.id} onClick={() => setEditingLog(l)} className="w-full bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl p-3 flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-lg bg-gray-800 overflow-hidden flex-shrink-0">
              {l.products?.cover_photo_url ? <img src={l.products.cover_photo_url} alt="" className="w-full h-full object-cover" /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate text-gray-100">{l.products?.name}</p>
              <p className="text-xs text-gray-400">
                {WORK_TYPE_LABEL[l.work_type] || l.work_type}{l.size_label ? ` · ${l.size_label}` : ''}{l.quantity ? ` · ${l.quantity} pcs` : ''}
                {l.rejected_qty ? <span className="text-red-400"> · {l.rejected_qty} rejected</span> : null} · {l.employees?.name || 'Unassigned'}
              </p>
            </div>
            <p className="text-[11px] text-gray-500 flex-shrink-0">{new Date(l.logged_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
          </button>
        ))}
        {recentLogs.length === 0 && <p className="text-gray-500 text-sm">No activity logged yet.</p>}
      </div>
      {product && step === 3 && <p className="text-[11px] text-gray-600 mt-4">QR shortcut for this garment: open it from <Link className="text-brand-400" to={`/products/${product.id}`}>its page</Link> → Job card.</p>}

      {editingLog && <QuickEditLogModal log={editingLog} onClose={() => setEditingLog(null)} onSaved={() => { setEditingLog(null); loadAll() }} />}
    </div>
  )
}

function QuickEditLogModal({ log, onClose, onSaved }) {
  const [quantity, setQuantity] = useState(log.quantity || '')
  const [rejected, setRejected] = useState(log.rejected_qty || '')
  const [notes, setNotes] = useState(log.notes || '')
  const [saving, setSaving] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      must(await supabase.from('work_logs').update({ quantity: Number(quantity) || null, rejected_qty: Number(rejected) || null, notes: notes.trim() || null }).eq('id', log.id), 'Saving')
      toast('Updated', 'success'); onSaved()
    } catch (err) { toast(err.message, 'error') } finally { setSaving(false) }
  }
  const remove = async () => {
    if (!confirm('Delete this work log entry?')) return
    setSaving(true)
    try { must(await supabase.from('work_logs').delete().eq('id', log.id), 'Deleting'); toast('Deleted', 'success'); onSaved() }
    catch (err) { toast(err.message, 'error') } finally { setSaving(false) }
  }

  return (
    <Modal onClose={onClose}>
      <form onSubmit={save}>
        <h3 className="text-lg font-bold mb-1 text-gray-100">{log.products?.name}</h3>
        <p className="text-sm text-gray-400 mb-4">{WORK_TYPE_LABEL[log.work_type] || log.work_type}{log.size_label ? ` · size ${log.size_label}` : ''} · {log.employees?.name || 'Unassigned'}</p>
        <label className={labelClass}>Pieces</label>
        <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} />
        {(log.work_type === 'qc' || log.rejected_qty) && <>
          <label className={labelClass}>Rejected</label>
          <input type="number" value={rejected} onChange={(e) => setRejected(e.target.value)} className={inputClass} />
        </>}
        <label className={labelClass}>Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputClass} />
        <FormActions onCancel={onClose} saving={saving} onDelete={remove} />
      </form>
    </Modal>
  )
}

function StepPill({ active, done, label, onClick }) {
  return (
    <button onClick={onClick} disabled={!active}
      className={`px-3 py-1.5 rounded-full font-medium whitespace-nowrap max-w-[45vw] truncate ${done ? 'bg-green-900/50 text-green-300' : active ? 'bg-brand-900/50 text-brand-400' : 'bg-gray-900 text-gray-600'}`}>
      {label}
    </button>
  )
}

function SelectedGarmentBanner({ product, employee, onChangePerson }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-2 flex items-center gap-2">
      <div className="w-10 h-10 rounded-lg bg-gray-800 overflow-hidden flex-shrink-0">
        {product.cover_photo_url ? <img src={product.cover_photo_url} alt="" className="w-full h-full object-cover" /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate text-gray-100">{product.name}</p>
        <p className="text-[11px] text-gray-500">{product.po_number || ''} · {stageInfo(product.stage).label}</p>
      </div>
      {employee && <button onClick={onChangePerson} className="text-xs text-gray-300 bg-gray-800 rounded-lg px-2 py-1">{employee.name} ✎</button>}
    </div>
  )
}
