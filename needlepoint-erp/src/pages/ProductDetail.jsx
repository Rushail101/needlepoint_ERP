import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase, uploadPhoto } from '../supabaseClient.js'

const WORK_TYPE_LABEL = {
  screen_printing: 'Screen Printing',
  embroidery: 'Embroidery',
  sampling: 'Sampling',
  sample_change: 'Sample Change',
  stitching: 'Stitching',
  other: 'Other',
}

export default function ProductDetail() {
  const { id } = useParams()
  const [product, setProduct] = useState(null)
  const [sizes, setSizes] = useState([])
  const [photos, setPhotos] = useState([])
  const [logs, setLogs] = useState([])
  const [samples, setSamples] = useState([])
  const [employees, setEmployees] = useState([])
  const [tab, setTab] = useState('sizes')

  const load = async () => {
    const { data: p } = await supabase.from('products').select('*, brands(name)').eq('id', id).single()
    const { data: s } = await supabase.from('product_sizes').select('*').eq('product_id', id).order('created_at')
    const { data: ph } = await supabase.from('product_photos').select('*').eq('product_id', id).order('created_at', { ascending: false })
    const { data: l } = await supabase.from('work_logs').select('*, employees(name)').eq('product_id', id).order('logged_at', { ascending: false })
    const { data: sv } = await supabase.from('sample_versions').select('*').eq('product_id', id).order('version_number', { ascending: false })
    const { data: emp } = await supabase.from('employees').select('*').eq('active', true).order('name')
    setProduct(p); setSizes(s || []); setPhotos(ph || []); setLogs(l || []); setSamples(sv || []); setEmployees(emp || [])
  }

  useEffect(() => { load() }, [id])

  if (!product) return <p className="text-paper-400 text-center py-10">Loading...</p>

  const totalQty = sizes.reduce((sum, s) => sum + (s.quantity || 0), 0)

  return (
    <div>
      <Link to="/" className="text-thread-500 text-sm font-medium">← Back to Garments</Link>

      <div className="flex gap-4 mt-3 mb-4">
        <div className="w-24 h-24 rounded-xl bg-ink-800 overflow-hidden flex-shrink-0">
          {product.cover_photo_url
            ? <img src={product.cover_photo_url} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-3xl text-paper-400">👕</div>}
        </div>
        <div>
          <h2 className="text-xl font-bold font-display text-paper-100">{product.name}</h2>
          <p className="text-sm text-paper-400">{product.brands?.name || 'No brand'} {product.style_code ? `· ${product.style_code}` : ''}</p>
          <p className="text-sm text-paper-400 mt-1">Total qty: <span className="font-semibold text-paper-100">{totalQty}</span></p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-ink-700 mb-4 overflow-x-auto">
        {[
          ['sizes', 'Sizes & Qty'],
          ['photos', 'Photos'],
          ['work', 'Work History'],
          ['samples', 'Sample Versions'],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === key ? 'border-thread-500 text-thread-500' : 'border-transparent text-paper-400 hover:text-paper-100'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'sizes' && <SizesTab productId={id} sizes={sizes} onChange={load} />}
      {tab === 'photos' && <PhotosTab productId={id} photos={photos} onChange={load} />}
      {tab === 'work' && <WorkTab logs={logs} employees={employees} onChange={load} />}
      {tab === 'samples' && <SamplesTab productId={id} samples={samples} onChange={load} />}
    </div>
  )
}

function SizesTab({ productId, sizes, onChange }) {
  const [label, setLabel] = useState('')
  const [qty, setQty] = useState('')

  const add = async (e) => {
    e.preventDefault()
    if (!label.trim()) return
    await supabase.from('product_sizes').insert({ product_id: productId, size_label: label.trim(), quantity: Number(qty) || 0 })
    setLabel(''); setQty(''); onChange()
  }

  const updateLabel = async (sizeId, newLabel) => {
    if (!newLabel.trim()) return
    await supabase.from('product_sizes').update({ size_label: newLabel.trim() }).eq('id', sizeId)
    onChange()
  }

  const updateQty = async (sizeId, newQty) => {
    await supabase.from('product_sizes').update({ quantity: Number(newQty) || 0 }).eq('id', sizeId)
    onChange()
  }

  const remove = async (sizeId) => {
    await supabase.from('product_sizes').delete().eq('id', sizeId)
    onChange()
  }

  return (
    <div>
      <div className="space-y-2 mb-4">
        {sizes.map(s => (
          <div key={s.id} className="flex items-center gap-2 bg-ink-900 seam-top border border-ink-700 rounded-xl p-3">
            <input defaultValue={s.size_label}
              onBlur={(e) => updateLabel(s.id, e.target.value)}
              className="font-semibold w-16 bg-ink-800 border border-ink-700 rounded-lg px-2 py-1 text-sm text-paper-100 focus:outline-none focus:border-thread-500" />
            <input type="number" defaultValue={s.quantity}
              onBlur={(e) => updateQty(s.id, e.target.value)}
              className="bg-ink-800 border border-ink-700 text-paper-100 rounded-lg px-2 py-1 w-24 text-sm focus:outline-none focus:border-thread-500" />
            <span className="text-xs text-paper-400">pcs</span>
            <button onClick={() => remove(s.id)} className="ml-auto text-red-400 hover:text-red-300 text-sm transition-colors">Remove</button>
          </div>
        ))}
        {sizes.length === 0 && <p className="text-paper-400 text-sm">No sizes added yet.</p>}
      </div>
      <form onSubmit={add} className="flex gap-2">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Size (e.g. M)"
          className="bg-ink-800 border border-ink-700 text-paper-100 rounded-lg px-3 py-2 flex-1 text-sm focus:outline-none focus:border-thread-500" />
        <input value={qty} onChange={(e) => setQty(e.target.value)} type="number" placeholder="Qty"
          className="bg-ink-800 border border-ink-700 text-paper-100 rounded-lg px-3 py-2 w-24 text-sm focus:outline-none focus:border-thread-500" />
        <button className="bg-thread-500 hover:bg-thread-600 text-ink-950 rounded-lg px-4 text-sm font-semibold transition-colors">Add</button>
      </form>
    </div>
  )
}

function PhotosTab({ productId, photos, onChange }) {
  const [uploading, setUploading] = useState(false)

  const upload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadPhoto(file, 'products')
      await supabase.from('product_photos').insert({ product_id: productId, photo_url: url })
      onChange()
    } catch (err) {
      alert('Upload failed: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  const remove = async (photoId) => {
    await supabase.from('product_photos').delete().eq('id', photoId)
    onChange()
  }

  return (
    <div>
      <label className="block bg-ink-900 border-2 border-dashed border-ink-700 rounded-xl p-4 text-center mb-4 text-sm text-thread-500 font-medium cursor-pointer hover:border-thread-500 transition-colors">
        {uploading ? 'Uploading...' : '+ Add Photo'}
        <input type="file" accept="image/*" capture="environment" onChange={upload} className="hidden" disabled={uploading} />
      </label>
      <div className="grid grid-cols-3 gap-2">
        {photos.map(p => (
          <div key={p.id} className="relative aspect-square rounded-lg overflow-hidden bg-ink-800">
            <img src={p.photo_url} className="w-full h-full object-cover" />
            <button onClick={() => remove(p.id)}
              className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 text-xs">✕</button>
          </div>
        ))}
      </div>
      {photos.length === 0 && <p className="text-paper-400 text-sm">No extra photos yet.</p>}
    </div>
  )
}

function WorkTab({ logs, employees, onChange }) {
  const [editing, setEditing] = useState(null)
  return (
    <div className="space-y-2">
      {logs.map(l => (
        <div key={l.id} className="relative bg-ink-900 seam-top border border-ink-700 rounded-xl p-3 flex gap-3">
          {l.photo_url && <img src={l.photo_url} className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />}
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm text-paper-100">{WORK_TYPE_LABEL[l.work_type] || l.work_type}</p>
            <p className="text-xs text-paper-400">{l.employees?.name || 'Unassigned'} {l.quantity ? `· ${l.quantity} pcs` : ''}</p>
            {l.notes && <p className="text-xs text-paper-300 mt-1">{l.notes}</p>}
            <p className="text-[11px] text-paper-400/70 mt-1">{new Date(l.logged_at).toLocaleString()}</p>
          </div>
          <button
            onClick={() => setEditing(l)}
            aria-label="Edit work log entry"
            className="absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-full bg-ink-950/80 border border-ink-700 text-xs text-paper-300 hover:text-thread-500 hover:border-thread-500 transition-colors"
          >✏️</button>
        </div>
      ))}
      {logs.length === 0 && <p className="text-paper-400 text-sm">No work logged for this garment yet. Log it from the Work Log tab.</p>}
      {editing && (
        <WorkLogEditModal
          log={editing}
          employees={employees}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChange() }}
        />
      )}
    </div>
  )
}

export function WorkLogEditModal({ log, employees, onClose, onSaved }) {
  const [workType, setWorkType] = useState(log.work_type)
  const [employeeId, setEmployeeId] = useState(log.employee_id || '')
  const [quantity, setQuantity] = useState(log.quantity ?? '')
  const [notes, setNotes] = useState(log.notes || '')
  const [saving, setSaving] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await supabase.from('work_logs').update({
        work_type: workType,
        employee_id: employeeId || null,
        quantity: Number(quantity) || null,
        notes: notes.trim() || null,
      }).eq('id', log.id)
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
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-30">
      <form onSubmit={save} className="bg-ink-900 seam-top border border-ink-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5">
        <h3 className="text-lg font-bold font-display mb-4">Edit Work Log</h3>
        <label className="block text-sm font-medium mb-1 text-paper-300">Work type</label>
        <select value={workType} onChange={(e) => setWorkType(e.target.value)}
          className="w-full bg-ink-800 border border-ink-700 text-paper-100 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:border-thread-500">
          {Object.entries(WORK_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="block text-sm font-medium mb-1 text-paper-300">Person</label>
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}
          className="w-full bg-ink-800 border border-ink-700 text-paper-100 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:border-thread-500">
          <option value="">Unassigned</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <label className="block text-sm font-medium mb-1 text-paper-300">Quantity of pieces</label>
        <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)}
          className="w-full bg-ink-800 border border-ink-700 text-paper-100 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:border-thread-500" placeholder="optional" />
        <label className="block text-sm font-medium mb-1 text-paper-300">Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
          className="w-full bg-ink-800 border border-ink-700 text-paper-100 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:border-thread-500" placeholder="optional" />
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 border border-ink-700 text-paper-100 hover:bg-ink-800 rounded-xl py-2.5 font-semibold transition-colors">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 bg-thread-500 hover:bg-thread-600 text-ink-950 rounded-xl py-2.5 font-semibold disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
        <button type="button" onClick={remove} disabled={saving} className="w-full mt-3 text-red-400 hover:text-red-300 text-sm font-medium transition-colors">
          Delete entry
        </button>
      </form>
    </div>
  )
}

function SamplesTab({ productId, samples, onChange }) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  return (
    <div>
      <button onClick={() => setShowForm(true)} className="bg-thread-500 hover:bg-thread-600 text-ink-950 rounded-xl px-4 py-2 text-sm font-semibold mb-4 transition-colors">
        + Log Sample Version
      </button>
      <div className="space-y-3">
        {samples.map(s => (
          <div key={s.id} className="relative bg-ink-900 seam-top border border-ink-700 rounded-xl p-3 flex gap-3">
            {s.photo_url && <img src={s.photo_url} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm text-paper-100">Version {s.version_number} <span className={`ml-2 text-[11px] px-2 py-0.5 rounded-full ${
                s.status === 'approved' ? 'bg-emerald-500/15 text-emerald-300' :
                s.status === 'rejected' ? 'bg-red-500/15 text-red-300' :
                s.status === 'revising' ? 'bg-amber-500/15 text-amber-300' : 'bg-white/10 text-paper-300'
              }`}>{s.status}</span></p>
              {s.change_description && <p className="text-xs text-paper-300 mt-1">{s.change_description}</p>}
              <p className="text-[11px] text-paper-400/70 mt-1">{new Date(s.created_at).toLocaleDateString()}</p>
            </div>
            <button
              onClick={() => setEditing(s)}
              aria-label={`Edit sample version ${s.version_number}`}
              className="absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-full bg-ink-950/80 border border-ink-700 text-xs text-paper-300 hover:text-thread-500 hover:border-thread-500 transition-colors"
            >✏️</button>
          </div>
        ))}
        {samples.length === 0 && <p className="text-paper-400 text-sm">No sample versions logged yet.</p>}
      </div>
      {showForm && (
        <SampleForm productId={productId} nextVersion={(samples[0]?.version_number || 0) + 1}
          onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); onChange() }} />
      )}
      {editing && (
        <SampleForm
          initial={editing}
          productId={productId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChange() }}
        />
      )}
    </div>
  )
}

function SampleForm({ initial, productId, nextVersion, onClose, onSaved }) {
  const isEdit = !!initial
  const [desc, setDesc] = useState(initial?.change_description || '')
  const [status, setStatus] = useState(initial?.status || 'pending')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      let photo_url = initial?.photo_url ?? null
      if (file) photo_url = await uploadPhoto(file, 'samples')
      if (isEdit) {
        await supabase.from('sample_versions').update({
          change_description: desc.trim() || null, status, photo_url,
        }).eq('id', initial.id)
      } else {
        await supabase.from('sample_versions').insert({
          product_id: productId, version_number: nextVersion,
          change_description: desc.trim() || null, status, photo_url,
        })
      }
      onSaved()
    } catch (err) {
      alert('Could not save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-30">
      <form onSubmit={save} className="bg-ink-900 seam-top border border-ink-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5">
        <h3 className="text-lg font-bold font-display mb-4">{isEdit ? `Edit Sample Version ${initial.version_number}` : `Log Sample Version ${nextVersion}`}</h3>
        <label className="block text-sm font-medium mb-1 text-paper-300">Photo of this version</label>
        {isEdit && initial.photo_url && !file && (
          <img src={initial.photo_url} className="w-16 h-16 rounded-lg object-cover mb-2" />
        )}
        <input type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files[0])} className="w-full mb-3 text-sm text-paper-300" />
        <label className="block text-sm font-medium mb-1 text-paper-300">What changed</label>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3}
          className="w-full bg-ink-800 border border-ink-700 text-paper-100 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:border-thread-500" placeholder="e.g. Collar width reduced, moved logo 1 inch left" />
        <label className="block text-sm font-medium mb-1 text-paper-300">Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full bg-ink-800 border border-ink-700 text-paper-100 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:border-thread-500">
          <option value="pending">Pending brand approval</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="revising">Revising</option>
        </select>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 border border-ink-700 text-paper-100 hover:bg-ink-800 rounded-xl py-2.5 font-semibold transition-colors">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 bg-thread-500 hover:bg-thread-600 text-ink-950 rounded-xl py-2.5 font-semibold disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
