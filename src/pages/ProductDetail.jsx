import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase, uploadPhoto, must } from '../supabaseClient.js'
import { STAGES, stageInfo } from '../stages.js'
import { WORK_TYPE_LABEL } from '../workTypes.js'
import Modal, { FormActions, inputClass, labelClass } from '../components/Modal.jsx'
import ShipmentModal from '../components/ShipmentModal.jsx'
import OrderEditModal from '../components/OrderEditModal.jsx'
import JobCardModal from '../components/JobCardModal.jsx'
import { exportProductPDF } from '../pdfExport.js'
import { useAuth } from '../components/PinGate.jsx'
import { can } from '../permissions.js'
import { toast } from '../components/Toast.jsx'
import { deliveryStatus, sizeProgress, fmtDay, inr } from '../production.js'
import { orderKeyOf, loadOrderDocuments } from '../billing.js'
import { MaterialsPanel } from './Materials.jsx'
import { JobWorkPanel } from './JobWork.jsx'

export default function ProductDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isClient = user?.role === 'client'

  const canEdit = can(user, 'edit_garments')
  const canLog = can(user, 'log_work')
  const showFinancials = can(user, 'view_financials')

  const [product, setProduct] = useState(null)
  const [sizes, setSizes] = useState([])
  const [photos, setPhotos] = useState([])
  const [logs, setLogs] = useState([])
  const [history, setHistory] = useState([])
  const [samples, setSamples] = useState([])
  const [docs, setDocs] = useState([])
  const [employees, setEmployees] = useState([])
  const [brands, setBrands] = useState([])
  const [loading, setLoading] = useState(true)

  const [activeTab, setActiveTab] = useState('progress')
  const [modal, setModal] = useState(null) // 'edit' | 'ship' | 'log' | 'job'

  const loadProduct = async () => {
    let prodQuery = supabase.from('products').select('*, brands(name, contact_phone), shipments(*)').eq('id', id)
    if (isClient && user?.brandId) prodQuery = prodQuery.eq('brand_id', user.brandId)
    const { data: prod, error } = await prodQuery.single()
    if (error || !prod) {
      toast('Order not found or you don\'t have access to it.', 'error')
      navigate('/orders')
      return
    }
    const [sz, ph, lg, hist, smp, emps, brs] = await Promise.all([
      supabase.from('product_sizes').select('*').eq('product_id', id).order('size_label'),
      supabase.from('product_photos').select('*').eq('product_id', id).order('created_at', { ascending: false }),
      // work_logs has logged_at (not created_at) — ordering by created_at failed, so Work History was always empty
      isClient ? { data: [] } : supabase.from('work_logs').select('*, employees!work_logs_employee_id_fkey(name)').eq('product_id', id).order('logged_at', { ascending: false }),
      supabase.from('stage_history').select('*').eq('product_id', id).order('changed_at'),
      supabase.from('sample_versions').select('*').eq('product_id', id).order('version_number'),
      isClient ? { data: [] } : supabase.from('employees').select('*').eq('active', true).order('name'),
      isClient ? { data: [] } : supabase.from('brands').select('*').order('name'),
    ])
    setProduct(prod)
    setSizes(sz.data || []); setPhotos(ph.data || []); setLogs(lg.data || []); setHistory(hist.data || [])
    setSamples(smp.data || []); setEmployees(emps.data || []); setBrands(brs.data || [])
    if (showFinancials) loadOrderDocuments(orderKeyOf(prod)).then(setDocs)
    setLoading(false)
  }

  useEffect(() => { loadProduct() }, [id, user?.brandId])

  const updateStage = async (newStage) => {
    const { error } = await supabase.from('products').update({ stage: newStage }).eq('id', id)
    if (error) { toast('Couldn\'t update stage: ' + error.message, 'error'); return }
    toast(`Moved to ${stageInfo(newStage).label}`, 'success')
    loadProduct()
  }

  if (loading || !product) return <div className="text-gray-400 text-center py-10">Loading garment…</div>

  const totalQty = sizes.reduce((acc, s) => acc + (Number(s.quantity) || 0), 0)
  const totalShipped = (product.shipments || []).reduce((acc, s) => acc + (Number(s.quantity) || 0), 0)
  const ds = deliveryStatus(product)
  const rejectedTotal = logs.reduce((s, l) => s + (Number(l.rejected_qty) || 0), 0)

  const tabs = [
    ['progress', 'Progress'],
    ['sizes', 'Sizes & Qty'],
    ['photos', `Photos (${photos.length})`],
    ['samples', `Samples (${samples.length})`],
    ...(!isClient ? [['work', `Work (${logs.length})`], ['materials', 'Materials'], ['jobwork', 'Job Work']] : []),
    ...(showFinancials ? [['billing', `Billing${docs.length ? ` (${docs.length})` : ''}`]] : []),
  ]

  return (
    <div className="space-y-4">
      <Link to="/orders" className="text-brand-500 hover:text-brand-400 text-sm font-semibold inline-flex items-center gap-1">← Back to Orders</Link>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
          <div className="flex gap-3.5 items-center min-w-0">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-gray-800 border border-gray-700 overflow-hidden flex items-center justify-center flex-shrink-0">
              {product.cover_photo_url ? <img src={product.cover_photo_url} alt={product.name} className="w-full h-full object-cover" /> : <span className="text-3xl text-gray-600">👕</span>}
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-black text-gray-100 uppercase tracking-tight truncate">{product.name}</h1>
              <p className="text-xs text-gray-400">
                {product.brands?.name || 'Independent'}
                {product.po_number && <span> · PO <strong className="text-gray-300 font-mono">{product.po_number}</strong></span>}
                {product.style_code && <span> · Style <strong className="text-gray-300">{product.style_code}</strong></span>}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <span className="text-xs font-semibold text-brand-400">{totalQty} pcs</span>
                {totalShipped > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-800/60 text-emerald-400 font-semibold">🚚 {totalShipped}/{totalQty} shipped</span>}
                {ds && <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${ds.cls}`}>{ds.text}</span>}
                {!ds && product.due_date && <span className="text-[10px] text-gray-500">Delivery {fmtDay(product.due_date)}</span>}
                {rejectedTotal > 0 && !isClient && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-950/70 border border-red-900 text-red-300 font-semibold">❌ {rejectedTotal} rejected</span>}
                {showFinancials && product.price_per_piece != null && <span className="text-xs text-gray-300">· {inr(product.price_per_piece)}/pc</span>}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
            {canEdit && <Btn onClick={() => setModal('edit')}>✎ Edit</Btn>}
            {!isClient && <Btn tone="green" onClick={() => setModal('ship')}>🚚 Dispatches</Btn>}
            {canLog && <Btn tone="brand" onClick={() => setModal('log')}>+ Log work</Btn>}
            {!isClient && <Btn onClick={() => setModal('job')}>🏷 Job card</Btn>}
            {product.tech_pack_url && <a href={product.tech_pack_url} target="_blank" rel="noreferrer" className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-brand-400 rounded-xl px-3 py-1.5 text-xs font-semibold">📄 Tech pack</a>}
            <Btn onClick={() => exportProductPDF({ product, sizes })}>⬇ Job sheet</Btn>
          </div>
        </div>

        <div className="mt-4 pt-3.5 border-t border-gray-800 flex flex-wrap items-center gap-3 text-xs">
          <span className="text-gray-400">Stage:</span>
          {!isClient && canEdit ? (
            <div className="flex flex-wrap gap-1">
              {STAGES.map(s => (
                <button key={s.key} onClick={() => s.key !== product.stage && updateStage(s.key)}
                  className={`px-2.5 py-1 rounded-full font-semibold border ${product.stage === s.key ? `${s.color} border-transparent ring-1 ring-white/20` : 'border-gray-700 text-gray-500 hover:text-gray-200'}`}>{s.label}</button>
              ))}
            </div>
          ) : <span className={`px-2.5 py-1 rounded-full font-semibold ${stageInfo(product.stage).color}`}>{stageInfo(product.stage).label}</span>}
        </div>

        {product.planned_work?.length > 0 && (
          <div className="mt-3 text-xs">
            <span className="text-gray-500 uppercase tracking-wider text-[10px] font-bold mr-2">Planned work</span>
            {product.planned_work.map((w, i) => <span key={i} className="inline-block bg-gray-800 text-gray-300 px-2 py-0.5 rounded-md text-[11px] font-medium mr-1.5 mt-1">{WORK_TYPE_LABEL[w] || w}</span>)}
          </div>
        )}
      </div>

      <div className="flex border-b border-gray-800 text-sm gap-1 overflow-x-auto">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setActiveTab(k)}
            className={`pb-2 px-3 font-semibold whitespace-nowrap transition ${activeTab === k ? 'text-brand-500 border-b-2 border-brand-500' : 'text-gray-400 hover:text-gray-200'}`}>{l}</button>
        ))}
      </div>

      {activeTab === 'progress' && <ProgressTab product={product} sizes={sizes} logs={logs} history={history} isClient={isClient} />}
      {activeTab === 'sizes' && <SizesTab productId={product.id} sizes={sizes} canEdit={!isClient && canEdit} onReload={loadProduct} />}
      {activeTab === 'photos' && <PhotosTab productId={product.id} photos={photos} canEdit={!isClient && canEdit} onReload={loadProduct} />}
      {activeTab === 'samples' && <SamplesTab productId={product.id} samples={samples} canEdit={!isClient && canEdit} onReload={loadProduct} />}
      {!isClient && activeTab === 'work' && <WorkLogsTab logs={logs} canLog={canLog} onOpenLogModal={() => setModal('log')} onReload={loadProduct} />}
      {!isClient && activeTab === 'materials' && <MaterialsPanel product={product} canEdit={can(user, 'manage_materials')} />}
      {!isClient && activeTab === 'jobwork' && <JobWorkPanel product={product} canEdit={can(user, 'manage_job_work')} />}
      {showFinancials && activeTab === 'billing' && <BillingTab docs={docs} />}

      {modal === 'ship' && <ShipmentModal product={product} sizes={sizes} onClose={() => setModal(null)} onUpdated={loadProduct} />}
      {modal === 'job' && <JobCardModal product={product} brandName={product.brands?.name} sizes={sizes} onClose={() => setModal(null)} />}
      {modal === 'log' && <LogWorkModal product={product} sizes={sizes} employees={employees} defaultEmployee={user?.employeeId} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadProduct() }} />}
      {modal === 'edit' && (
        <OrderEditModal product={product} brands={brands} onClose={() => setModal(null)}
          onSaved={() => { setModal(null); loadProduct() }} onDeleted={() => { setModal(null); navigate('/orders') }} />
      )}
    </div>
  )
}

function Btn({ children, onClick, tone }) {
  const cls = tone === 'green' ? 'bg-emerald-950/70 hover:bg-emerald-900 border-emerald-800/70 text-emerald-300'
    : tone === 'brand' ? 'bg-brand-600 hover:bg-brand-700 border-brand-600 text-white'
    : 'bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-200'
  return <button onClick={onClick} className={`${cls} border rounded-xl px-3 py-1.5 text-xs font-semibold`}>{children}</button>
}

function ProgressTab({ product, sizes, logs, history, isClient }) {
  const { rows, unsized } = sizeProgress(sizes, logs, product.shipments || [])
  const cols = [['ordered', 'Ordered'], ['cutting', 'Cut'], ['stitching', 'Stitched'], ['qc', 'QC passed'], ['rejected', 'Rejected'], ['packing', 'Packed'], ['dispatched', 'Dispatched']]
  const shownCols = isClient ? cols.filter(([k]) => ['ordered', 'packing', 'dispatched'].includes(k)) : cols
  const total = k => rows.reduce((s, r) => s + r[k], 0)
  return (
    <div className="space-y-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-gray-500 uppercase tracking-wider text-[10px]">
            <th className="text-left px-3 py-2">Size</th>{shownCols.map(([k, l]) => <th key={k} className="text-right px-3 py-2">{l}</th>)}
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.size} className="border-t border-gray-800">
                <td className="px-3 py-2 font-bold text-gray-200">{r.size}</td>
                {shownCols.map(([k]) => {
                  const v = r[k]; const full = k !== 'ordered' && k !== 'rejected' && r.ordered && v >= r.ordered
                  return <td key={k} className={`px-3 py-2 text-right font-mono ${k === 'rejected' && v ? 'text-red-400' : full ? 'text-emerald-400' : v ? 'text-gray-200' : 'text-gray-600'}`}>{v || '—'}</td>
                })}
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="border-t border-gray-700 bg-gray-950/50 font-bold">
                <td className="px-3 py-2 text-gray-300">Total</td>
                {shownCols.map(([k]) => <td key={k} className="px-3 py-2 text-right font-mono text-gray-200">{total(k) || '—'}</td>)}
              </tr>
            )}
            {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-500">No sizes on this order yet.</td></tr>}
          </tbody>
        </table>
        {!isClient && unsized > 0 && <p className="text-[11px] text-gray-500 px-3 pb-2">+ {unsized} pcs logged without a size (counted in Work, not in this table).</p>}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <p className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-3">Stage timeline</p>
        {history.length === 0 && <p className="text-xs text-gray-500">No stage changes recorded yet.</p>}
        <ol className="relative border-l border-gray-700 ml-2 space-y-3">
          {history.map((h, i) => {
            const next = history[i + 1]
            const days = Math.max(0, Math.round(((next ? new Date(next.changed_at) : new Date()) - new Date(h.changed_at)) / 86400000))
            return (
              <li key={h.id} className="ml-4">
                <span className={`absolute -left-1.5 w-3 h-3 rounded-full ${next ? 'bg-gray-600' : 'bg-brand-500'}`} />
                <p className="text-sm font-semibold text-gray-100">{stageInfo(h.stage).label}</p>
                <p className="text-[11px] text-gray-500">
                  {new Date(h.changed_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {!isClient && h.changed_by ? ` · ${h.changed_by}` : ''} · {next ? `${days} day${days === 1 ? '' : 's'}` : h.stage === 'packed' ? 'done' : `${days} day${days === 1 ? '' : 's'} so far`}
                </p>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

function SizesTab({ productId, sizes, canEdit, onReload }) {
  const [sizeList, setSizeList] = useState(sizes)
  const [newLabel, setNewLabel] = useState('')
  const [newQty, setNewQty] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { setSizeList(sizes) }, [sizes])

  const updateQuantity = async (sizeId, qty) => {
    try { must(await supabase.from('product_sizes').update({ quantity: Math.max(0, parseInt(qty, 10) || 0) }).eq('id', sizeId), 'Updating size'); onReload() }
    catch (e) { toast(e.message, 'error') }
  }
  const addSize = async (e) => {
    e.preventDefault()
    if (!newLabel.trim()) return
    setSaving(true)
    try {
      must(await supabase.from('product_sizes').insert({ product_id: productId, size_label: newLabel.trim().toUpperCase(), quantity: parseInt(newQty, 10) || 0 }), 'Adding size')
      setNewLabel(''); setNewQty(''); onReload()
    } catch (err) { toast(err.message, 'error') } finally { setSaving(false) }
  }
  const removeSize = async (sizeId) => {
    if (!confirm('Remove this size?')) return
    try { must(await supabase.from('product_sizes').delete().eq('id', sizeId), 'Removing size'); onReload() } catch (e) { toast(e.message, 'error') }
  }

  const total = sizeList.reduce((s, x) => s + (Number(x.quantity) || 0), 0)
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {sizeList.map((s) => (
          <div key={s.id} className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5">
            <span className="font-bold text-gray-200 text-sm w-16">{s.size_label}</span>
            <div className="flex items-center gap-2">
              <input type="number" disabled={!canEdit} value={s.quantity}
                onChange={(e) => { const val = e.target.value; setSizeList((prev) => prev.map((it) => (it.id === s.id ? { ...it, quantity: val } : it))) }}
                onBlur={(e) => Number(e.target.value) !== Number(sizes.find(x => x.id === s.id)?.quantity) && updateQuantity(s.id, e.target.value)}
                className={`w-20 bg-gray-950 border border-gray-700 text-gray-100 rounded-lg px-2.5 py-1 text-right text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-brand-500 ${!canEdit ? 'cursor-not-allowed text-gray-400' : ''}`} />
              <span className="text-xs text-gray-400">pcs</span>
              {canEdit && <button onClick={() => removeSize(s.id)} className="text-xs text-gray-500 hover:text-red-400 ml-3">Remove</button>}
            </div>
          </div>
        ))}
        {sizeList.length > 0 && <p className="text-right text-xs text-gray-400 pr-4">Total <b className="text-gray-200">{total}</b> pcs</p>}
      </div>
      {canEdit && (
        <form onSubmit={addSize} className="flex gap-2 pt-2">
          <input placeholder="Size (e.g. 2XL)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="w-28 bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          <input type="number" placeholder="Qty" value={newQty} onChange={(e) => setNewQty(e.target.value)} className="w-24 bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-4 py-2 text-xs font-semibold">+ Add size</button>
        </form>
      )}
    </div>
  )
}

function PhotosTab({ productId, photos, canEdit, onReload }) {
  const [uploading, setUploading] = useState(false)
  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    try {
      for (const file of files) {
        const url = await uploadPhoto(file, 'products')
        must(await supabase.from('product_photos').insert({ product_id: productId, photo_url: url }), 'Saving photo')
      }
      toast(`${files.length} photo${files.length === 1 ? '' : 's'} added`, 'success')
      onReload()
    } catch (err) { toast('Upload failed: ' + err.message, 'error') } finally { setUploading(false) }
  }
  const removePhoto = async (photoId) => {
    if (!confirm('Delete photo?')) return
    try { must(await supabase.from('product_photos').delete().eq('id', photoId), 'Deleting photo'); onReload() } catch (e) { toast(e.message, 'error') }
  }
  return (
    <div className="space-y-4">
      {canEdit && (
        <label className="inline-block bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-4 py-2 text-xs font-semibold cursor-pointer">
          {uploading ? 'Uploading…' : '+ Upload photos'}
          <input type="file" multiple accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {photos.map((p) => (
          <div key={p.id} className="aspect-square rounded-xl bg-gray-900 border border-gray-800 overflow-hidden relative group">
            <a href={p.photo_url} target="_blank" rel="noreferrer"><img src={p.photo_url} alt="" className="w-full h-full object-cover" /></a>
            {canEdit && <button onClick={() => removePhoto(p.id)} aria-label="Delete photo" className="absolute top-2 right-2 bg-black/70 hover:bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs sm:opacity-0 group-hover:opacity-100 transition">✕</button>}
          </div>
        ))}
        {photos.length === 0 && <p className="text-xs text-gray-500">No extra photos yet.</p>}
      </div>
    </div>
  )
}

// Sample rounds (v1, v2…) — the table existed but nothing showed or added them.
function SamplesTab({ productId, samples, canEdit, onReload }) {
  const [open, setOpen] = useState(false)
  const [desc, setDesc] = useState('')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const STATUS = { pending: 'bg-yellow-900/50 text-yellow-300', approved: 'bg-green-900/50 text-green-300', rejected: 'bg-red-900/50 text-red-300', revising: 'bg-blue-900/50 text-blue-300' }

  const add = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      const photo_url = file ? await uploadPhoto(file, 'products') : null
      const next = (samples.reduce((m, s) => Math.max(m, s.version_number || 0), 0)) + 1
      must(await supabase.from('sample_versions').insert({ product_id: productId, version_number: next, change_description: desc.trim() || null, photo_url, status: 'pending' }), 'Adding sample')
      toast(`Sample v${next} added`, 'success'); setOpen(false); setDesc(''); setFile(null); onReload()
    } catch (err) { toast(err.message, 'error') } finally { setSaving(false) }
  }
  const setStatus = async (s, status) => {
    try { must(await supabase.from('sample_versions').update({ status }).eq('id', s.id), 'Updating sample'); onReload() } catch (e) { toast(e.message, 'error') }
  }
  return (
    <div className="space-y-3">
      {canEdit && <button onClick={() => setOpen(true)} className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-4 py-2 text-xs font-semibold">+ New sample round</button>}
      {samples.length === 0 && <p className="text-xs text-gray-500">No sample rounds recorded.</p>}
      {[...samples].reverse().map(s => (
        <div key={s.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex gap-3">
          <div className="w-16 h-16 rounded-lg bg-gray-800 overflow-hidden flex-shrink-0">{s.photo_url && <a href={s.photo_url} target="_blank" rel="noreferrer"><img src={s.photo_url} alt="" className="w-full h-full object-cover" /></a>}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-black text-gray-100">v{s.version_number}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS[s.status] || 'bg-gray-800 text-gray-400'}`}>{s.status}</span>
              <span className="text-[10px] text-gray-500 ml-auto">{fmtDay(s.created_at)}</span>
            </div>
            <p className="text-xs text-gray-300 mt-1">{s.change_description || '—'}</p>
            {canEdit && s.status !== 'approved' && (
              <div className="flex gap-1.5 mt-2">
                {['approved', 'revising', 'rejected'].map(st => <button key={st} onClick={() => setStatus(s, st)} className="text-[11px] px-2 py-0.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800">{st === 'approved' ? '✓ Approve' : st === 'revising' ? 'Needs changes' : 'Reject'}</button>)}
              </div>
            )}
          </div>
        </div>
      ))}
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <form onSubmit={add}>
            <h3 className="text-lg font-bold mb-4 text-gray-100">New sample round</h3>
            <label className={labelClass}>What changed from the last round?</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} className={inputClass} placeholder="e.g. Shortened sleeve 2 cm, softer print ink" />
            <label className={labelClass}>Photo</label>
            <input type="file" accept="image/*" capture="environment" onChange={e => setFile(e.target.files[0])} className="w-full mb-3 text-sm text-gray-300" />
            <FormActions onCancel={() => setOpen(false)} saving={saving} />
          </form>
        </Modal>
      )}
    </div>
  )
}

function WorkLogsTab({ logs, canLog, onOpenLogModal, onReload }) {
  const deleteLog = async (logId) => {
    if (!confirm('Delete this work log entry?')) return
    try { must(await supabase.from('work_logs').delete().eq('id', logId), 'Deleting'); onReload() } catch (e) { toast(e.message, 'error') }
  }
  return (
    <div className="space-y-3">
      {canLog && <button onClick={onOpenLogModal} className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-4 py-2 text-xs font-semibold">+ Record work</button>}
      <div className="space-y-2">
        {logs.map((l) => (
          <div key={l.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center justify-between text-xs">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-gray-200">{l.employees?.name || 'Unassigned'}</span>
                <span className="bg-gray-800 text-gray-300 px-2 py-0.5 rounded text-[11px]">{WORK_TYPE_LABEL[l.work_type] || l.work_type}</span>
                {l.size_label && <span className="text-gray-400">size {l.size_label}</span>}
                {l.quantity ? <span className="text-gray-400">· {l.quantity} pcs</span> : null}
                {l.rejected_qty ? <span className="text-red-400">· {l.rejected_qty} rejected ({l.reject_reason})</span> : null}
              </div>
              {l.notes && <p className="text-gray-500 mt-1">{l.notes}</p>}
              <p className="text-[10px] text-gray-600 mt-1">{new Date(l.logged_at).toLocaleString('en-IN')}{l.logged_by ? ` · by ${l.logged_by}` : ''}</p>
            </div>
            {canLog && <button onClick={() => deleteLog(l.id)} className="text-gray-500 hover:text-red-400 text-[11px]">Delete</button>}
          </div>
        ))}
        {logs.length === 0 && <p className="text-gray-500">No work logged for this order yet.</p>}
      </div>
    </div>
  )
}

function BillingTab({ docs }) {
  if (!docs.length) return <p className="text-xs text-gray-500">No invoices or challans for this order yet. They're raised from Accounts → Production Orders.</p>
  return (
    <div className="space-y-2">
      {docs.map(d => (
        <div key={d.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex justify-between text-xs">
          <span><span className="font-mono text-brand-400">{d.number}</span> <span className="text-gray-500">{d.kind === 'challan' ? 'challan' : d.status} · {fmtDay(d.doc_date)}</span></span>
          <span className="text-gray-200 font-semibold">{inr(d.total)}{Number(d.paid) > 0 && <span className="text-emerald-400"> · paid {inr(d.paid)}</span>}</span>
        </div>
      ))}
    </div>
  )
}

// Quick entry from the garment page (the full guided flow is the Work Log screen).
function LogWorkModal({ product, sizes, employees, defaultEmployee, onClose, onSaved }) {
  const [employeeId, setEmployeeId] = useState(defaultEmployee || '')
  const [workType, setWorkType] = useState('stitching')
  const [sizeLabel, setSizeLabel] = useState('')
  const [quantity, setQuantity] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const save = async (e) => {
    e.preventDefault(); setSaving(true)
    try {
      must(await supabase.from('work_logs').insert({ product_id: product.id, employee_id: employeeId || null, work_type: workType, size_label: sizeLabel || null, quantity: quantity ? Number(quantity) : null, notes: notes.trim() || null }), 'Saving work')
      toast('Work recorded', 'success'); onSaved()
    } catch (err) { toast(err.message, 'error') } finally { setSaving(false) }
  }
  return (
    <Modal onClose={onClose}>
      <form onSubmit={save}>
        <h3 className="text-lg font-bold mb-4 text-gray-100">Record work · {product.name}</h3>
        <label className={labelClass}>Person</label>
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputClass}>
          <option value="">Unassigned</option>
          {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
        </select>
        <label className={labelClass}>Work</label>
        <select value={workType} onChange={(e) => setWorkType(e.target.value)} className={inputClass}>
          {Object.entries(WORK_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {sizes.length > 0 && <>
          <label className={labelClass}>Size</label>
          <select value={sizeLabel} onChange={(e) => setSizeLabel(e.target.value)} className={inputClass}>
            <option value="">All / mixed</option>
            {sizes.map(s => <option key={s.id} value={s.size_label}>{s.size_label}</option>)}
          </select>
        </>}
        <label className={labelClass}>Pieces</label>
        <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} />
        <label className={labelClass}>Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} placeholder="optional" />
        <FormActions onCancel={onClose} saving={saving} />
      </form>
      <p className="text-[11px] text-gray-500 mt-2">For QC with rejections, use the Work Log screen.</p>
    </Modal>
  )
}
