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
  const [tab, setTab] = useState('sizes')

  const load = async () => {
    const { data: p } = await supabase.from('products').select('*, brands(name)').eq('id', id).single()
    const { data: s } = await supabase.from('product_sizes').select('*').eq('product_id', id).order('created_at')
    const { data: ph } = await supabase.from('product_photos').select('*').eq('product_id', id).order('created_at', { ascending: false })
    const { data: l } = await supabase.from('work_logs').select('*, employees(name)').eq('product_id', id).order('logged_at', { ascending: false })
    const { data: sv } = await supabase.from('sample_versions').select('*').eq('product_id', id).order('version_number', { ascending: false })
    setProduct(p); setSizes(s || []); setPhotos(ph || []); setLogs(l || []); setSamples(sv || [])
  }

  useEffect(() => { load() }, [id])

  if (!product) return <p className="text-gray-400 text-center py-10">Loading...</p>

  const totalQty = sizes.reduce((sum, s) => sum + (s.quantity || 0), 0)

  return (
    <div>
      <Link to="/" className="text-brand-600 text-sm font-medium">← Back to Garments</Link>

      <div className="flex gap-4 mt-3 mb-4">
        <div className="w-24 h-24 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0">
          {product.cover_photo_url
            ? <img src={product.cover_photo_url} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-3xl text-gray-300">👕</div>}
        </div>
        <div>
          <h2 className="text-xl font-bold">{product.name}</h2>
          <p className="text-sm text-gray-500">{product.brands?.name || 'No brand'} {product.style_code ? `· ${product.style_code}` : ''}</p>
          <p className="text-sm text-gray-500 mt-1">Total qty: <span className="font-semibold text-gray-700">{totalQty}</span></p>
        </div>
      </div>

      <div className="flex gap-1 border-b mb-4 overflow-x-auto">
        {[
          ['sizes', 'Sizes & Qty'],
          ['photos', 'Photos'],
          ['work', 'Work History'],
          ['samples', 'Sample Versions'],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 ${tab === key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'sizes' && <SizesTab productId={id} sizes={sizes} onChange={load} />}
      {tab === 'photos' && <PhotosTab productId={id} photos={photos} onChange={load} />}
      {tab === 'work' && <WorkTab logs={logs} />}
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
          <div key={s.id} className="flex items-center gap-2 bg-white border rounded-xl p-3">
            <span className="font-semibold w-16">{s.size_label}</span>
            <input type="number" defaultValue={s.quantity}
              onBlur={(e) => updateQty(s.id, e.target.value)}
              className="border rounded-lg px-2 py-1 w-24 text-sm" />
            <span className="text-xs text-gray-400">pcs</span>
            <button onClick={() => remove(s.id)} className="ml-auto text-red-500 text-sm">Remove</button>
          </div>
        ))}
        {sizes.length === 0 && <p className="text-gray-400 text-sm">No sizes added yet.</p>}
      </div>
      <form onSubmit={add} className="flex gap-2">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Size (e.g. M)"
          className="border rounded-lg px-3 py-2 flex-1 text-sm" />
        <input value={qty} onChange={(e) => setQty(e.target.value)} type="number" placeholder="Qty"
          className="border rounded-lg px-3 py-2 w-24 text-sm" />
        <button className="bg-brand-600 text-white rounded-lg px-4 text-sm font-semibold">Add</button>
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
      <label className="block bg-white border-2 border-dashed rounded-xl p-4 text-center mb-4 text-sm text-brand-600 font-medium">
        {uploading ? 'Uploading...' : '+ Add Photo'}
        <input type="file" accept="image/*" capture="environment" onChange={upload} className="hidden" disabled={uploading} />
      </label>
      <div className="grid grid-cols-3 gap-2">
        {photos.map(p => (
          <div key={p.id} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
            <img src={p.photo_url} className="w-full h-full object-cover" />
            <button onClick={() => remove(p.id)}
              className="absolute top-1 right-1 bg-black/50 text-white rounded-full w-6 h-6 text-xs">✕</button>
          </div>
        ))}
      </div>
      {photos.length === 0 && <p className="text-gray-400 text-sm">No extra photos yet.</p>}
    </div>
  )
}

function WorkTab({ logs }) {
  return (
    <div className="space-y-2">
      {logs.map(l => (
        <div key={l.id} className="bg-white border rounded-xl p-3 flex gap-3">
          {l.photo_url && <img src={l.photo_url} className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />}
          <div className="min-w-0">
            <p className="font-semibold text-sm">{WORK_TYPE_LABEL[l.work_type] || l.work_type}</p>
            <p className="text-xs text-gray-500">{l.employees?.name || 'Unassigned'} {l.quantity ? `· ${l.quantity} pcs` : ''}</p>
            {l.notes && <p className="text-xs text-gray-600 mt-1">{l.notes}</p>}
            <p className="text-[11px] text-gray-400 mt-1">{new Date(l.logged_at).toLocaleString()}</p>
          </div>
        </div>
      ))}
      {logs.length === 0 && <p className="text-gray-400 text-sm">No work logged for this garment yet. Log it from the Work Log tab.</p>}
    </div>
  )
}

function SamplesTab({ productId, samples, onChange }) {
  const [showForm, setShowForm] = useState(false)
  return (
    <div>
      <button onClick={() => setShowForm(true)} className="bg-brand-600 text-white rounded-xl px-4 py-2 text-sm font-semibold mb-4">
        + Log Sample Version
      </button>
      <div className="space-y-3">
        {samples.map(s => (
          <div key={s.id} className="bg-white border rounded-xl p-3 flex gap-3">
            {s.photo_url && <img src={s.photo_url} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />}
            <div className="min-w-0">
              <p className="font-semibold text-sm">Version {s.version_number} <span className={`ml-2 text-[11px] px-2 py-0.5 rounded-full ${
                s.status === 'approved' ? 'bg-green-100 text-green-700' :
                s.status === 'rejected' ? 'bg-red-100 text-red-700' :
                s.status === 'revising' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
              }`}>{s.status}</span></p>
              {s.change_description && <p className="text-xs text-gray-600 mt-1">{s.change_description}</p>}
              <p className="text-[11px] text-gray-400 mt-1">{new Date(s.created_at).toLocaleDateString()}</p>
            </div>
          </div>
        ))}
        {samples.length === 0 && <p className="text-gray-400 text-sm">No sample versions logged yet.</p>}
      </div>
      {showForm && (
        <SampleForm productId={productId} nextVersion={(samples[0]?.version_number || 0) + 1}
          onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); onChange() }} />
      )}
    </div>
  )
}

function SampleForm({ productId, nextVersion, onClose, onSaved }) {
  const [desc, setDesc] = useState('')
  const [status, setStatus] = useState('pending')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      let photo_url = null
      if (file) photo_url = await uploadPhoto(file, 'samples')
      await supabase.from('sample_versions').insert({
        product_id: productId, version_number: nextVersion,
        change_description: desc.trim() || null, status, photo_url,
      })
      onSaved()
    } catch (err) {
      alert('Could not save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-30">
      <form onSubmit={save} className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5">
        <h3 className="text-lg font-bold mb-4">Log Sample Version {nextVersion}</h3>
        <label className="block text-sm font-medium mb-1">Photo of this version</label>
        <input type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files[0])} className="w-full mb-3 text-sm" />
        <label className="block text-sm font-medium mb-1">What changed</label>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3}
          className="w-full border rounded-lg px-3 py-2 mb-3" placeholder="e.g. Collar width reduced, moved logo 1 inch left" />
        <label className="block text-sm font-medium mb-1">Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full border rounded-lg px-3 py-2 mb-4">
          <option value="pending">Pending brand approval</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="revising">Revising</option>
        </select>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 border rounded-xl py-2.5 font-semibold">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 bg-brand-600 text-white rounded-xl py-2.5 font-semibold disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
