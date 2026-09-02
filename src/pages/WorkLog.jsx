import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase, uploadPhoto } from '../supabaseClient.js'
import Modal, { FormActions, inputClass, labelClass } from '../components/Modal.jsx'

const WORK_TYPES = [
  { key: 'screen_printing', label: 'Screen Printing', icon: '🖨️' },
  { key: 'embroidery', label: 'Embroidery', icon: '🧵' },
  { key: 'sampling', label: 'Sampling', icon: '✂️' },
  { key: 'sample_change', label: 'Sample Change', icon: '🔁' },
  { key: 'stitching', label: 'Stitching', icon: '🪡' },
  { key: 'other', label: 'Other', icon: '📌' },
]

export default function WorkLog() {
  const [searchParams] = useSearchParams()
  const preselectProductId = searchParams.get('product')
  const [step, setStep] = useState(1) // 1: pick garment, 2: pick person, 3: pick work type + details
  const [products, setProducts] = useState([])
  const [employees, setEmployees] = useState([])
  const [recentLogs, setRecentLogs] = useState([])
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [workType, setWorkType] = useState(null)
  const [quantity, setQuantity] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [editingLog, setEditingLog] = useState(null)

  const loadAll = async () => {
    const { data: p } = await supabase.from('products').select('*, brands(name)').order('created_at', { ascending: false })
    const { data: e } = await supabase.from('employees').select('*').eq('active', true).order('name')
    const { data: l } = await supabase.from('work_logs').select('*, products(name, cover_photo_url), employees(name)').order('logged_at', { ascending: false }).limit(10)
    setProducts(p || []); setEmployees(e || []); setRecentLogs(l || [])

    // If we arrived via a garment's QR code, jump straight to picking a person for it.
    if (preselectProductId) {
      const match = (p || []).find(prod => prod.id === preselectProductId)
      if (match) { setSelectedProduct(match); setStep(2) }
    }
  }
  useEffect(() => { loadAll() }, [])

  const reset = () => {
    setStep(1); setSelectedProduct(null); setSelectedEmployee(null); setWorkType(null)
    setQuantity(''); setNotes(''); setFile(null)
  }

  const submit = async () => {
    setSaving(true)
    try {
      let photo_url = null
      if (file) photo_url = await uploadPhoto(file, 'worklog')
      await supabase.from('work_logs').insert({
        product_id: selectedProduct.id,
        employee_id: selectedEmployee?.id || null,
        work_type: workType,
        quantity: Number(quantity) || null,
        notes: notes.trim() || null,
        photo_url,
      })
      reset()
      loadAll()
    } catch (err) {
      alert('Could not save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-4 text-gray-100">Log Work</h2>

      {/* Progress breadcrumb */}
      <div className="flex items-center gap-2 mb-4 text-sm">
        <StepPill active={step >= 1} done={!!selectedProduct} label="Garment" onClick={() => setStep(1)} />
        <span className="text-gray-700">→</span>
        <StepPill active={step >= 2} done={!!selectedEmployee} label="Person" onClick={() => selectedProduct && setStep(2)} />
        <span className="text-gray-700">→</span>
        <StepPill active={step >= 3} done={!!workType} label="Work Type" onClick={() => selectedProduct && setStep(3)} />
      </div>

      {step === 1 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {products.map(p => (
            <button key={p.id} onClick={() => { setSelectedProduct(p); setStep(2) }}
              className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl overflow-hidden text-left">
              <div className="aspect-square bg-gray-800">
                {p.cover_photo_url ? <img src={p.cover_photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-2xl text-gray-600">👕</div>}
              </div>
              <p className="text-xs font-medium p-1.5 truncate text-gray-200">{p.name}</p>
            </button>
          ))}
        </div>
      )}

      {step === 2 && selectedProduct && (
        <div>
          <SelectedGarmentBanner product={selectedProduct} />
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
            {employees.map(e => (
              <button key={e.id} onClick={() => { setSelectedEmployee(e); setStep(3) }}
                className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl p-2 flex flex-col items-center gap-1">
                <div className="w-12 h-12 rounded-full bg-gray-800 overflow-hidden">
                  {e.photo_url ? <img src={e.photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-lg">🧑</div>}
                </div>
                <p className="text-xs font-medium text-center truncate w-full text-gray-200">{e.name}</p>
              </button>
            ))}
          </div>
          {employees.length === 0 && <p className="text-gray-500 text-sm mt-3">No team members yet — add someone in the Team tab first.</p>}
        </div>
      )}

      {step === 3 && selectedProduct && (
        <div>
          <SelectedGarmentBanner product={selectedProduct} employee={selectedEmployee} />
          <div className="grid grid-cols-3 gap-2 mt-3 mb-4">
            {WORK_TYPES.map(w => (
              <button key={w.key} onClick={() => setWorkType(w.key)}
                className={`border rounded-xl p-3 flex flex-col items-center gap-1 ${workType === w.key ? 'bg-brand-600 text-white border-brand-600' : 'bg-gray-900 border-gray-800 text-gray-200'}`}>
                <span className="text-xl">{w.icon}</span>
                <span className="text-xs font-medium text-center">{w.label}</span>
              </button>
            ))}
          </div>

          {workType && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <label className={labelClass}>Quantity of pieces</label>
              <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)}
                className={inputClass} placeholder="optional" />
              <label className={labelClass}>Photo of the work</label>
              <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} className="w-full mb-3 text-sm text-gray-300" />
              <label className={labelClass}>Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                className={inputClass} placeholder="optional" />
              <button onClick={submit} disabled={saving}
                className="w-full bg-brand-600 hover:bg-brand-700 text-white rounded-xl py-3 font-semibold disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Work Log'}
              </button>
            </div>
          )}
        </div>
      )}

      <h3 className="text-sm font-bold text-gray-500 mt-8 mb-2 uppercase tracking-wide">Recent Activity</h3>
      <div className="space-y-2">
        {recentLogs.map(l => (
          <button key={l.id} onClick={() => setEditingLog(l)} className="w-full bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl p-3 flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-lg bg-gray-800 overflow-hidden flex-shrink-0">
              {l.products?.cover_photo_url ? <img src={l.products.cover_photo_url} className="w-full h-full object-cover" /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate text-gray-100">{l.products?.name}</p>
              <p className="text-xs text-gray-400">{WORK_TYPES.find(w => w.key === l.work_type)?.label || l.work_type} · {l.employees?.name || 'Unassigned'}</p>
            </div>
            <p className="text-[11px] text-gray-600 flex-shrink-0">{new Date(l.logged_at).toLocaleDateString()}</p>
          </button>
        ))}
        {recentLogs.length === 0 && <p className="text-gray-500 text-sm">No activity logged yet.</p>}
      </div>

      {editingLog && (
        <QuickEditLogModal log={editingLog} onClose={() => setEditingLog(null)} onSaved={() => { setEditingLog(null); loadAll() }} />
      )}
    </div>
  )
}

function QuickEditLogModal({ log, onClose, onSaved }) {
  const [quantity, setQuantity] = useState(log.quantity || '')
  const [notes, setNotes] = useState(log.notes || '')
  const [saving, setSaving] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await supabase.from('work_logs').update({ quantity: Number(quantity) || null, notes: notes.trim() || null }).eq('id', log.id)
      onSaved()
    } catch (err) {
      alert('Could not save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm('Delete this work log entry?')) return
    setSaving(true)
    try {
      await supabase.from('work_logs').delete().eq('id', log.id)
      onSaved()
    } catch (err) {
      alert('Could not delete: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <form onSubmit={save}>
        <h3 className="text-lg font-bold mb-1 text-gray-100">{log.products?.name}</h3>
        <p className="text-sm text-gray-400 mb-4">{log.employees?.name || 'Unassigned'}</p>
        <label className={labelClass}>Quantity of pieces</label>
        <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} />
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
      className={`px-3 py-1.5 rounded-full font-medium ${done ? 'bg-green-900/50 text-green-300' : active ? 'bg-brand-900/50 text-brand-400' : 'bg-gray-900 text-gray-600'}`}>
      {label}
    </button>
  )
}

function SelectedGarmentBanner({ product, employee }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-2 flex items-center gap-2">
      <div className="w-10 h-10 rounded-lg bg-gray-800 overflow-hidden flex-shrink-0">
        {product.cover_photo_url ? <img src={product.cover_photo_url} className="w-full h-full object-cover" /> : null}
      </div>
      <p className="text-sm font-medium truncate text-gray-100">{product.name}</p>
      {employee && <>
        <span className="text-gray-700">·</span>
        <p className="text-sm text-gray-400 truncate">{employee.name}</p>
      </>}
    </div>
  )
}
