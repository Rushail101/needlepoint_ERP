import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase, uploadPhoto } from '../supabaseClient.js'
import Modal, { FormActions, inputClass, labelClass } from '../components/Modal.jsx'
import { STAGES } from '../stages.js'
import { exportProductPDF } from '../pdfExport.js'
import ProductQR from '../components/ProductQR.jsx'
import { useAuth } from '../components/PinGate.jsx'
import { can } from '../permissions.js'
import { WORK_TYPES, WORK_TYPE_LABEL } from '../workTypes.js'
import { buildOrderSummaryText, buildWhatsAppUrl } from '../orderSummary.js'

export default function ProductDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const canEditGarment = can(user, 'edit_garments')
  const canManageSizes = can(user, 'manage_sizes')
  const canManagePhotos = can(user, 'manage_photos')
  const canManageWorkLogs = can(user, 'manage_work_logs')
  const canManageSamples = can(user, 'manage_samples')
  const canChangeStage = can(user, 'change_stage')
  const canExport = can(user, 'export_pdf')
  const canViewPricing = can(user, 'view_pricing')
  const [product, setProduct] = useState(null)
  const [brands, setBrands] = useState([])
  const [sizes, setSizes] = useState([])
  const [photos, setPhotos] = useState([])
  const [logs, setLogs] = useState([])
  const [samples, setSamples] = useState([])
  const [tab, setTab] = useState('sizes')
  const [editingProduct, setEditingProduct] = useState(false)
  const [exporting, setExporting] = useState(false)

  const load = async () => {
    const { data: p } = await supabase.from('products').select('*, brands(name)').eq('id', id).single()
    const { data: b } = await supabase.from('brands').select('*').order('name')
    const { data: s } = await supabase.from('product_sizes').select('*').eq('product_id', id).order('created_at')
    const { data: ph } = await supabase.from('product_photos').select('*').eq('product_id', id).order('created_at', { ascending: false })
    const { data: l } = await supabase.from('work_logs').select('*, employees(name)').eq('product_id', id).order('logged_at', { ascending: false })
    const { data: sv } = await supabase.from('sample_versions').select('*').eq('product_id', id).order('version_number', { ascending: false })
    setProduct(p); setBrands(b || []); setSizes(s || []); setPhotos(ph || []); setLogs(l || []); setSamples(sv || [])
  }

  useEffect(() => { load() }, [id])

  if (!product) return <p className="text-gray-500 text-center py-10">Loading...</p>

  const totalQty = sizes.reduce((sum, s) => sum + (s.quantity || 0), 0)

  const changeStage = async (newStage) => {
    await supabase.from('products').update({ stage: newStage }).eq('id', id)
    load()
  }

  const doExport = async () => {
    setExporting(true)
    try {
      await exportProductPDF({ product, sizes, photos, logs, samples, workTypeLabel: WORK_TYPE_LABEL })
    } catch (err) {
      alert('Could not export PDF: ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <Link to="/garments" className="text-brand-500 text-sm font-medium">← Back to Garments</Link>

      <div className="flex gap-4 mt-3 mb-3 items-start">
        <div className="w-24 h-24 rounded-xl bg-gray-800 overflow-hidden flex-shrink-0">
          {product.cover_photo_url
            ? <img src={product.cover_photo_url} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-3xl text-gray-600">👕</div>}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-gray-100">{product.name}</h2>
          <p className="text-sm text-gray-400">{product.brands?.name || 'No brand'} {product.style_code ? `· ${product.style_code}` : ''}</p>
          <p className="text-sm text-gray-400 mt-1">Total qty: <span className="font-semibold text-gray-200">{totalQty}</span></p>
        </div>
        {canEditGarment && (
          <button onClick={() => setEditingProduct(true)}
            className="bg-gray-800 border border-gray-700 hover:border-gray-600 text-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium flex-shrink-0">
            Edit
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <label className="text-xs text-gray-500">Stage:</label>
        {canChangeStage ? (
          <select value={product.stage || 'cutting'} onChange={(e) => changeStage(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-2 py-1.5 text-sm">
            {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        ) : (
          <span className="text-sm text-gray-300">{STAGES.find(s => s.key === (product.stage || 'cutting'))?.label}</span>
        )}
        {canExport && (
          <button onClick={doExport} disabled={exporting}
            className="ml-auto bg-gray-800 border border-gray-700 hover:border-gray-600 text-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50">
            {exporting ? 'Exporting...' : '📄 Export PDF'}
          </button>
        )}
      </div>

      {canManageWorkLogs && <ProductQR productId={product.id} />}

      {(product.planned_work?.length > 0 || (canViewPricing && product.price_per_piece)) && (
        <OrderSummaryPanel product={product} sizes={sizes} canViewPricing={canViewPricing} canManageWorkLogs={canManageWorkLogs} />
      )}

      <div className="flex gap-1 border-b border-gray-800 mb-4 overflow-x-auto">
        {[
          ['sizes', 'Sizes & Qty'],
          ['photos', 'Photos'],
          ['work', 'Work History'],
          ['samples', 'Sample Versions'],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 ${tab === key ? 'border-brand-500 text-brand-500' : 'border-transparent text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'sizes' && <SizesTab productId={id} sizes={sizes} onChange={load} canEdit={canManageSizes} />}
      {tab === 'photos' && <PhotosTab productId={id} photos={photos} onChange={load} canEdit={canManagePhotos} />}
      {tab === 'work' && <WorkTab logs={logs} onChange={load} canEdit={canManageWorkLogs} />}
      {tab === 'samples' && <SamplesTab productId={id} samples={samples} onChange={load} canEdit={canManageSamples} />}

      {editingProduct && (
        <ProductForm
          product={product}
          brands={brands}
          onClose={() => setEditingProduct(false)}
          onSaved={() => { setEditingProduct(false); load() }}
          onDeleted={() => navigate('/garments')}
        />
      )}
    </div>
  )
}

function ProductForm({ product, brands, onClose, onSaved, onDeleted }) {
  const [name, setName] = useState(product.name || '')
  const [styleCode, setStyleCode] = useState(product.style_code || '')
  const [brandId, setBrandId] = useState(product.brand_id || '')
  const [status, setStatus] = useState(product.status || 'in_production')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      let cover_photo_url = product.cover_photo_url || null
      if (file) cover_photo_url = await uploadPhoto(file, 'products')
      await supabase.from('products').update({
        name: name.trim(), style_code: styleCode.trim() || null,
        brand_id: brandId || null, status, cover_photo_url,
      }).eq('id', product.id)
      onSaved()
    } catch (err) {
      alert('Could not save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm(`Delete "${product.name}"? This removes all its photos, sizes, work history and sample versions too.`)) return
    setSaving(true)
    try {
      await supabase.from('products').delete().eq('id', product.id)
      onDeleted()
    } catch (err) {
      alert('Could not delete: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <form onSubmit={save}>
        <h3 className="text-lg font-bold mb-4 text-gray-100">Edit Garment</h3>
        {product.cover_photo_url && !file && <img src={product.cover_photo_url} className="w-full h-32 object-cover rounded-lg mb-2" />}
        <label className={labelClass}>Photo</label>
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} className="w-full mb-3 text-sm text-gray-300" />
        <label className={labelClass}>Garment name*</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
        <label className={labelClass}>Style code</label>
        <input value={styleCode} onChange={(e) => setStyleCode(e.target.value)} className={inputClass} />
        <label className={labelClass}>Brand</label>
        <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className={inputClass}>
          <option value="">No brand</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <label className={labelClass}>Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
          <option value="in_production">In Production</option>
          <option value="sampling">Sampling</option>
          <option value="completed">Completed</option>
          <option value="on_hold">On Hold</option>
        </select>
        <FormActions onCancel={onClose} saving={saving} onDelete={remove} />
      </form>
    </Modal>
  )
}

function OrderSummaryPanel({ product, sizes, canViewPricing, canManageWorkLogs }) {
  const totalQty = sizes.reduce((sum, s) => sum + (s.quantity || 0), 0)
  const totalValue = product.price_per_piece ? product.price_per_piece * totalQty : null

  const share = () => {
    const text = buildOrderSummaryText({ product, brandName: product.brands?.name, sizes })
    window.open(buildWhatsAppUrl(text, product.brands?.contact_phone), '_blank')
  }
  const copy = async () => {
    const text = buildOrderSummaryText({ product, brandName: product.brands?.name, sizes })
    try {
      await navigator.clipboard.writeText(text)
      alert('Summary copied to clipboard.')
    } catch {
      alert('Could not copy — your browser may not allow clipboard access here.')
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Order Summary</p>

      {canManageWorkLogs && product.planned_work?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {product.planned_work.map(w => (
            <span key={w} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-300">
              {WORK_TYPE_LABEL[w] || w}
            </span>
          ))}
        </div>
      )}

      {canViewPricing && product.price_per_piece && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <p className="text-lg font-bold text-gray-100">₹{product.price_per_piece}</p>
              <p className="text-xs text-gray-500">Price per piece</p>
            </div>
            <div>
              <p className="text-lg font-bold text-gray-100">₹{totalValue?.toLocaleString('en-IN')}</p>
              <p className="text-xs text-gray-500">Total Order Value ({totalQty} pcs)</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={share} className="flex-1 bg-green-800 hover:bg-green-700 text-white rounded-lg py-2 text-sm font-medium">
              💬 Share via WhatsApp
            </button>
            <button onClick={copy} className="flex-1 bg-gray-800 border border-gray-700 hover:border-gray-600 text-gray-200 rounded-lg py-2 text-sm font-medium">
              Copy Summary
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function SizesTab({ productId, sizes, onChange, canEdit }) {
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

  const updateLabel = async (sizeId, newLabel) => {
    if (!newLabel.trim()) return
    await supabase.from('product_sizes').update({ size_label: newLabel.trim() }).eq('id', sizeId)
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
          <div key={s.id} className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl p-3">
            {canEdit ? (
              <>
                <input defaultValue={s.size_label}
                  onBlur={(e) => updateLabel(s.id, e.target.value)}
                  className="font-semibold w-16 bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-2 py-1 text-sm" />
                <input type="number" defaultValue={s.quantity}
                  onBlur={(e) => updateQty(s.id, e.target.value)}
                  className="bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-2 py-1 w-24 text-sm" />
                <span className="text-xs text-gray-500">pcs</span>
                <button onClick={() => remove(s.id)} className="ml-auto text-red-400 text-sm">Remove</button>
              </>
            ) : (
              <>
                <span className="font-semibold w-16 text-gray-100">{s.size_label}</span>
                <span className="text-gray-300">{s.quantity} pcs</span>
              </>
            )}
          </div>
        ))}
        {sizes.length === 0 && <p className="text-gray-500 text-sm">No sizes added yet.</p>}
      </div>
      {canEdit && (
        <form onSubmit={add} className="flex gap-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Size (e.g. M)"
            className="bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 flex-1 text-sm" />
          <input value={qty} onChange={(e) => setQty(e.target.value)} type="number" placeholder="Qty"
            className="bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 w-24 text-sm" />
          <button className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-4 text-sm font-semibold">Add</button>
        </form>
      )}
    </div>
  )
}

function PhotosTab({ productId, photos, onChange, canEdit }) {
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
      {canEdit && (
        <label className="block bg-gray-900 border-2 border-dashed border-gray-700 rounded-xl p-4 text-center mb-4 text-sm text-brand-500 font-medium">
          {uploading ? 'Uploading...' : '+ Add Photo'}
          <input type="file" accept="image/*" onChange={upload} className="hidden" disabled={uploading} />
        </label>
      )}
      <div className="grid grid-cols-3 gap-2">
        {photos.map(p => (
          <div key={p.id} className="relative aspect-square rounded-lg overflow-hidden bg-gray-800">
            <img src={p.photo_url} className="w-full h-full object-cover" />
            {canEdit && (
              <button onClick={() => remove(p.id)}
                className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 text-xs">✕</button>
            )}
          </div>
        ))}
      </div>
      {photos.length === 0 && <p className="text-gray-500 text-sm">No extra photos yet.</p>}
    </div>
  )
}

function WorkTab({ logs, onChange, canEdit }) {
  const [editingLog, setEditingLog] = useState(null)
  const Row = canEdit ? 'button' : 'div'
  return (
    <div className="space-y-2">
      {logs.map(l => (
        <Row key={l.id} onClick={canEdit ? () => setEditingLog(l) : undefined}
          className="w-full bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl p-3 flex gap-3 text-left">
          {l.photo_url && <img src={l.photo_url} className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />}
          <div className="min-w-0">
            <p className="font-semibold text-sm text-gray-100">{WORK_TYPE_LABEL[l.work_type] || l.work_type}</p>
            <p className="text-xs text-gray-400">{l.employees?.name || 'Unassigned'} {l.quantity ? `· ${l.quantity} pcs` : ''}</p>
            {l.notes && <p className="text-xs text-gray-500 mt-1">{l.notes}</p>}
            <p className="text-[11px] text-gray-600 mt-1">{new Date(l.logged_at).toLocaleString()}</p>
          </div>
        </Row>
      ))}
      {logs.length === 0 && <p className="text-gray-500 text-sm">No work logged for this garment yet. Log it from the Work Log tab.</p>}
      {canEdit && editingLog && <WorkLogEditModal log={editingLog} onClose={() => setEditingLog(null)} onSaved={() => { setEditingLog(null); onChange() }} />}
    </div>
  )
}

function WorkLogEditModal({ log, onClose, onSaved }) {
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
        <h3 className="text-lg font-bold mb-1 text-gray-100">{WORK_TYPE_LABEL[log.work_type] || log.work_type}</h3>
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

function SamplesTab({ productId, samples, onChange, canEdit }) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const Row = canEdit ? 'button' : 'div'
  return (
    <div>
      {canEdit && (
        <button onClick={() => setShowForm(true)} className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-4 py-2 text-sm font-semibold mb-4">
          + Log Sample Version
        </button>
      )}
      <div className="space-y-3">
        {samples.map(s => (
          <Row key={s.id} onClick={canEdit ? () => setEditing(s) : undefined}
            className="w-full bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl p-3 flex gap-3 text-left">
            {s.photo_url && <img src={s.photo_url} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />}
            <div className="min-w-0">
              <p className="font-semibold text-sm text-gray-100">Version {s.version_number} <span className={`ml-2 text-[11px] px-2 py-0.5 rounded-full ${
                s.status === 'approved' ? 'bg-green-900/50 text-green-300' :
                s.status === 'rejected' ? 'bg-red-900/50 text-red-300' :
                s.status === 'revising' ? 'bg-yellow-900/50 text-yellow-300' : 'bg-gray-800 text-gray-400'
              }`}>{s.status}</span></p>
              {s.change_description && <p className="text-xs text-gray-400 mt-1">{s.change_description}</p>}
              <p className="text-[11px] text-gray-600 mt-1">{new Date(s.created_at).toLocaleDateString()}</p>
            </div>
          </Row>
        ))}
        {samples.length === 0 && <p className="text-gray-500 text-sm">No sample versions logged yet.</p>}
      </div>
      {canEdit && showForm && (
        <SampleForm productId={productId} nextVersion={(samples[0]?.version_number || 0) + 1}
          onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); onChange() }} />
      )}
      {canEdit && editing && (
        <SampleForm productId={productId} sample={editing}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChange() }} />
      )}
    </div>
  )
}

function SampleForm({ productId, sample, nextVersion, onClose, onSaved }) {
  const isEdit = !!sample
  const [desc, setDesc] = useState(sample?.change_description || '')
  const [status, setStatus] = useState(sample?.status || 'pending')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      let photo_url = sample?.photo_url || null
      if (file) photo_url = await uploadPhoto(file, 'samples')
      if (isEdit) {
        await supabase.from('sample_versions').update({ change_description: desc.trim() || null, status, photo_url }).eq('id', sample.id)
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

  const remove = async () => {
    if (!confirm(`Delete sample version ${sample.version_number}?`)) return
    setSaving(true)
    try {
      await supabase.from('sample_versions').delete().eq('id', sample.id)
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
        <h3 className="text-lg font-bold mb-4 text-gray-100">{isEdit ? `Edit Version ${sample.version_number}` : `Log Sample Version ${nextVersion}`}</h3>
        {sample?.photo_url && !file && <img src={sample.photo_url} className="w-full h-32 object-cover rounded-lg mb-2" />}
        <label className={labelClass}>Photo of this version</label>
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} className="w-full mb-3 text-sm text-gray-300" />
        <label className={labelClass}>What changed</label>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3}
          className={inputClass} placeholder="e.g. Collar width reduced, moved logo 1 inch left" />
        <label className={labelClass}>Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
          <option value="pending">Pending brand approval</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="revising">Revising</option>
        </select>
        <FormActions onCancel={onClose} saving={saving} onDelete={isEdit ? remove : null} />
      </form>
    </Modal>
  )
}
