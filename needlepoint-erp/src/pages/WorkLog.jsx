import { useEffect, useState } from 'react'
import { supabase, uploadPhoto } from '../supabaseClient.js'

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
      <h2 className="text-xl font-bold mb-4">Log Work</h2>

      {/* Progress breadcrumb */}
      <div className="flex items-center gap-2 mb-4 text-sm">
        <StepPill active={step >= 1} done={!!selectedProduct} label="Garment" onClick={() => setStep(1)} />
        <span className="text-gray-300">→</span>
        <StepPill active={step >= 2} done={!!selectedEmployee} label="Person" onClick={() => selectedProduct && setStep(2)} />
        <span className="text-gray-300">→</span>
        <StepPill active={step >= 3} done={!!workType} label="Work Type" onClick={() => selectedProduct && setStep(3)} />
      </div>

      {step === 1 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {products.map(p => (
            <button key={p.id} onClick={() => { setSelectedProduct(p); setStep(2) }}
              className="bg-white border rounded-xl overflow-hidden text-left">
              <div className="aspect-square bg-gray-100">
                {p.cover_photo_url ? <img src={p.cover_photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-2xl text-gray-300">👕</div>}
              </div>
              <p className="text-xs font-medium p-1.5 truncate">{p.name}</p>
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
                className="bg-white border rounded-xl p-2 flex flex-col items-center gap-1">
                <div className="w-12 h-12 rounded-full bg-gray-100 overflow-hidden">
                  {e.photo_url ? <img src={e.photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-lg">🧑</div>}
                </div>
                <p className="text-xs font-medium text-center truncate w-full">{e.name}</p>
              </button>
            ))}
          </div>
          {employees.length === 0 && <p className="text-gray-400 text-sm mt-3">No team members yet — add someone in the Team tab first.</p>}
        </div>
      )}

      {step === 3 && selectedProduct && (
        <div>
          <SelectedGarmentBanner product={selectedProduct} employee={selectedEmployee} />
          <div className="grid grid-cols-3 gap-2 mt-3 mb-4">
            {WORK_TYPES.map(w => (
              <button key={w.key} onClick={() => setWorkType(w.key)}
                className={`border rounded-xl p-3 flex flex-col items-center gap-1 ${workType === w.key ? 'bg-brand-600 text-white border-brand-600' : 'bg-white'}`}>
                <span className="text-xl">{w.icon}</span>
                <span className="text-xs font-medium text-center">{w.label}</span>
              </button>
            ))}
          </div>

          {workType && (
            <div className="bg-white border rounded-xl p-4">
              <label className="block text-sm font-medium mb-1">Quantity of pieces</label>
              <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 mb-3" placeholder="optional" />
              <label className="block text-sm font-medium mb-1">Photo of the work</label>
              <input type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files[0])} className="w-full mb-3 text-sm" />
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                className="w-full border rounded-lg px-3 py-2 mb-4" placeholder="optional" />
              <button onClick={submit} disabled={saving}
                className="w-full bg-brand-600 text-white rounded-xl py-3 font-semibold disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Work Log'}
              </button>
            </div>
          )}
        </div>
      )}

      <h3 className="text-sm font-bold text-gray-500 mt-8 mb-2 uppercase tracking-wide">Recent Activity</h3>
      <div className="space-y-2">
        {recentLogs.map(l => (
          <div key={l.id} className="bg-white border rounded-xl p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
              {l.products?.cover_photo_url ? <img src={l.products.cover_photo_url} className="w-full h-full object-cover" /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{l.products?.name}</p>
              <p className="text-xs text-gray-500">{WORK_TYPES.find(w => w.key === l.work_type)?.label || l.work_type} · {l.employees?.name || 'Unassigned'}</p>
            </div>
            <p className="text-[11px] text-gray-400 flex-shrink-0">{new Date(l.logged_at).toLocaleDateString()}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function StepPill({ active, done, label, onClick }) {
  return (
    <button onClick={onClick} disabled={!active}
      className={`px-3 py-1.5 rounded-full font-medium ${done ? 'bg-green-100 text-green-700' : active ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-400'}`}>
      {label}
    </button>
  )
}

function SelectedGarmentBanner({ product, employee }) {
  return (
    <div className="bg-white border rounded-xl p-2 flex items-center gap-2">
      <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
        {product.cover_photo_url ? <img src={product.cover_photo_url} className="w-full h-full object-cover" /> : null}
      </div>
      <p className="text-sm font-medium truncate">{product.name}</p>
      {employee && <>
        <span className="text-gray-300">·</span>
        <p className="text-sm text-gray-500 truncate">{employee.name}</p>
      </>}
    </div>
  )
}
