import { useEffect, useState } from 'react'
import { supabase, uploadPhoto } from '../supabaseClient.js'
import { WorkLogEditModal } from './ProductDetail.jsx'

const WORK_TYPES = [
  { key: 'screen_printing', label: 'Screen Printing', icon: '🖨️' },
  { key: 'embroidery', label: 'Embroidery', icon: '🧵' },
  { key: 'sampling', label: 'Sampling', icon: '✂️' },
  { key: 'sample_change', label: 'Sample Change', icon: '🔁' },
  { key: 'stitching', label: 'Stitching', icon: '🪡' },
  { key: 'other', label: 'Other', icon: '📌' },
]

export default function WorkLog() {
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
      <h2 className="text-xl font-bold font-display mb-4">Log Work</h2>

      {/* Progress breadcrumb */}
      <div className="flex items-center gap-2 mb-4 text-sm">
        <StepPill active={step >= 1} done={!!selectedProduct} label="Garment" onClick={() => setStep(1)} />
        <span className="text-ink-700">→</span>
        <StepPill active={step >= 2} done={!!selectedEmployee} label="Person" onClick={() => selectedProduct && setStep(2)} />
        <span className="text-ink-700">→</span>
        <StepPill active={step >= 3} done={!!workType} label="Work Type" onClick={() => selectedProduct && setStep(3)} />
      </div>

      {step === 1 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {products.map(p => (
            <button key={p.id} onClick={() => { setSelectedProduct(p); setStep(2) }}
              className="bg-ink-900 seam-top border border-ink-700 rounded-xl overflow-hidden text-left hover:border-ink-600 transition-colors">
              <div className="aspect-square bg-ink-800">
                {p.cover_photo_url ? <img src={p.cover_photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-2xl text-paper-400">👕</div>}
              </div>
              <p className="text-xs font-medium p-1.5 truncate text-paper-100">{p.name}</p>
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
                className="bg-ink-900 seam-top border border-ink-700 rounded-xl p-2 flex flex-col items-center gap-1 hover:border-ink-600 transition-colors">
                <div className="w-12 h-12 rounded-full bg-ink-800 overflow-hidden">
                  {e.photo_url ? <img src={e.photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-lg">🧑</div>}
                </div>
                <p className="text-xs font-medium text-center truncate w-full text-paper-100">{e.name}</p>
              </button>
            ))}
          </div>
          {employees.length === 0 && <p className="text-paper-400 text-sm mt-3">No team members yet — add someone in the Team tab first.</p>}
        </div>
      )}

      {step === 3 && selectedProduct && (
        <div>
          <SelectedGarmentBanner product={selectedProduct} employee={selectedEmployee} />
          <div className="grid grid-cols-3 gap-2 mt-3 mb-4">
            {WORK_TYPES.map(w => (
              <button key={w.key} onClick={() => setWorkType(w.key)}
                className={`border rounded-xl p-3 flex flex-col items-center gap-1 transition-colors ${workType === w.key ? 'bg-thread-500 text-ink-950 border-thread-500 font-semibold' : 'bg-ink-900 border-ink-700 text-paper-100'}`}>
                <span className="text-xl">{w.icon}</span>
                <span className="text-xs font-medium text-center">{w.label}</span>
              </button>
            ))}
          </div>

          {workType && (
            <div className="bg-ink-900 seam-top border border-ink-700 rounded-xl p-4">
              <label className="block text-sm font-medium mb-1 text-paper-300">Quantity of pieces</label>
              <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)}
                className="w-full bg-ink-800 border border-ink-700 text-paper-100 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:border-thread-500" placeholder="optional" />
              <label className="block text-sm font-medium mb-1 text-paper-300">Photo of the work</label>
              <input type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files[0])} className="w-full mb-3 text-sm text-paper-300" />
              <label className="block text-sm font-medium mb-1 text-paper-300">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                className="w-full bg-ink-800 border border-ink-700 text-paper-100 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:border-thread-500" placeholder="optional" />
              <button onClick={submit} disabled={saving}
                className="w-full bg-thread-500 hover:bg-thread-600 text-ink-950 rounded-xl py-3 font-semibold disabled:opacity-50 transition-colors">
                {saving ? 'Saving...' : 'Save Work Log'}
              </button>
            </div>
          )}
        </div>
      )}

      <h3 className="text-sm font-bold text-paper-400 mt-8 mb-2 uppercase tracking-wide">Recent Activity</h3>
      <div className="space-y-2">
        {recentLogs.map(l => (
          <div key={l.id} className="relative bg-ink-900 seam-top border border-ink-700 rounded-xl p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-ink-800 overflow-hidden flex-shrink-0">
              {l.products?.cover_photo_url ? <img src={l.products.cover_photo_url} className="w-full h-full object-cover" /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate text-paper-100">{l.products?.name}</p>
              <p className="text-xs text-paper-400">{WORK_TYPES.find(w => w.key === l.work_type)?.label || l.work_type} · {l.employees?.name || 'Unassigned'}</p>
            </div>
            <p className="text-[11px] text-paper-400/70 flex-shrink-0 mr-7">{new Date(l.logged_at).toLocaleDateString()}</p>
            <button
              onClick={() => setEditingLog(l)}
              aria-label="Edit work log entry"
              className="absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-full bg-ink-950/80 border border-ink-700 text-xs text-paper-300 hover:text-thread-500 hover:border-thread-500 transition-colors"
            >✏️</button>
          </div>
        ))}
        {recentLogs.length === 0 && <p className="text-paper-400 text-sm">No work logged yet.</p>}
      </div>
      {editingLog && (
        <WorkLogEditModal
          log={editingLog}
          employees={employees}
          onClose={() => setEditingLog(null)}
          onSaved={() => { setEditingLog(null); loadAll() }}
        />
      )}
    </div>
  )
}

function StepPill({ active, done, label, onClick }) {
  return (
    <button onClick={onClick} disabled={!active}
      className={`px-3 py-1.5 rounded-full font-medium transition-colors ${done ? 'bg-emerald-500/15 text-emerald-300' : active ? 'bg-thread-500/15 text-thread-500' : 'bg-ink-800 text-paper-400/60'}`}>
      {label}
    </button>
  )
}

function SelectedGarmentBanner({ product, employee }) {
  return (
    <div className="bg-ink-900 border border-ink-700 rounded-xl p-2 flex items-center gap-2">
      <div className="w-10 h-10 rounded-lg bg-ink-800 overflow-hidden flex-shrink-0">
        {product.cover_photo_url ? <img src={product.cover_photo_url} className="w-full h-full object-cover" /> : null}
      </div>
      <p className="text-sm font-medium truncate text-paper-100">{product.name}</p>
      {employee && <>
        <span className="text-ink-700">·</span>
        <p className="text-sm text-paper-400 truncate">{employee.name}</p>
      </>}
    </div>
  )
}
