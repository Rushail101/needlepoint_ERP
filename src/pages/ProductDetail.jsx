import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase, uploadPhoto } from '../supabaseClient.js'
import { STAGES, stageInfo } from '../stages.js'
import { WORK_TYPES, WORK_TYPE_LABEL } from '../workTypes.js'
import Modal, { FormActions, inputClass, labelClass } from '../components/Modal.jsx'
import ShipmentModal from '../components/ShipmentModal.jsx'
import { exportProductPDF } from '../pdfExport.js'
import { useAuth } from '../components/PinGate.jsx'
import { can } from '../permissions.js'

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
  const [employees, setEmployees] = useState([])
  const [brands, setBrands] = useState([])
  const [loading, setLoading] = useState(true)

  const [activeTab, setActiveTab] = useState('sizes')
  const [showEdit, setShowEdit] = useState(false)
  const [showLogWork, setShowLogWork] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [showShipmentModal, setShowShipmentModal] = useState(false)

  const loadProduct = async () => {
    setLoading(true)
    let prodQuery = supabase
      .from('products')
      .select('*, brands(name), shipments(size_label, quantity, dispatched_at)')
      .eq('id', id)

    if (isClient && user?.brandId) {
      prodQuery = prodQuery.eq('brand_id', user.brandId)
    }

    const { data: prod, error } = await prodQuery.single()

    if (error || !prod) {
      alert('Order not found or permission denied.')
      navigate('/orders')
      return
    }

    const [{ data: sz }, { data: ph }, { data: lg }, { data: emps }, { data: brs }] = await Promise.all([
      supabase.from('product_sizes').select('*').eq('product_id', id).order('size_label'),
      supabase.from('product_photos').select('*').eq('product_id', id).order('created_at', { ascending: false }),
      supabase.from('work_logs').select('*, employees(name)').eq('product_id', id).order('created_at', { ascending: false }),
      supabase.from('employees').select('*').eq('active', true).order('name'),
      supabase.from('brands').select('*').order('name'),
    ])

    setProduct(prod)
    setSizes(sz || [])
    setPhotos(ph || [])
    setLogs(lg || [])
    setEmployees(emps || [])
    setBrands(brs || [])
    setLoading(false)
  }

  useEffect(() => {
    loadProduct()
  }, [id, user?.brandId])

  const updateStage = async (newStage) => {
    const { error } = await supabase.from('products').update({ stage: newStage }).eq('id', id)
    if (error) {
      alert('Error updating stage: ' + error.message)
      return
    }
    setProduct((prev) => ({ ...prev, stage: newStage }))
  }

  const handleExportPDF = () => {
    exportProductPDF({ product, sizes })
  }

  if (loading || !product) {
    return <div className="text-gray-400 text-center py-10">Loading garment details...</div>
  }

  const totalQty = sizes.reduce((acc, s) => acc + (Number(s.quantity) || 0), 0)
  const totalShipped = (product.shipments || []).reduce((acc, s) => acc + (Number(s.quantity) || 0), 0)
  const logUrl = `${window.location.origin}/products/${product.id}`
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(logUrl)}`

  return (
    <div className="space-y-4">
      <div>
        <Link to="/orders" className="text-brand-500 hover:text-brand-400 text-sm font-semibold flex items-center gap-1">
          ← Back to Orders
        </Link>
      </div>

      {/* Main Details Header Card */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-5 relative">
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
          <div className="flex gap-3.5 items-center min-w-0">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-gray-800 border border-gray-700 overflow-hidden flex items-center justify-center flex-shrink-0">
              {product.cover_photo_url ? (
                <img src={product.cover_photo_url} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl text-gray-600">👕</span>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-black text-gray-100 uppercase tracking-tight truncate">
                {product.name}
              </h1>
              <p className="text-xs text-gray-400">
                {product.brands?.name || 'Independent'}
                {product.po_number && <span> · PO: <strong className="text-gray-300 font-mono">{product.po_number}</strong></span>}
                {product.style_code && <span> · Style: <strong className="text-gray-300">{product.style_code}</strong></span>}
              </p>
              
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="text-xs font-semibold text-brand-400">Total qty: {totalQty}</span>
                {totalShipped > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-800/60 text-emerald-400 font-semibold">
                    🚚 {totalShipped}/{totalQty} shipped
                  </span>
                )}
                {showFinancials && product.price_per_piece && (
                  <span className="text-xs text-gray-300 font-medium">
                    · ₹{Number(product.price_per_piece).toLocaleString('en-IN')}/pc
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
            {canEdit && (
              <button
                onClick={() => setShowEdit(true)}
                className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 rounded-xl px-3 py-1.5 text-xs font-semibold"
              >
                Edit
              </button>
            )}
            
            {/* Dispatch management available to internal staff & viewable by clients */}
            {!isClient && (
              <button
                onClick={() => setShowShipmentModal(true)}
                className="bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-800/70 text-emerald-300 rounded-xl px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5"
              >
                <span>🚚</span> Dispatches
              </button>
            )}

            {product.tech_pack_url && (
              <a
                href={product.tech_pack_url}
                target="_blank"
                rel="noreferrer"
                className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-brand-400 rounded-xl px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5"
              >
                <span>📄</span> Tech Pack
              </a>
            )}

            <button
              onClick={handleExportPDF}
              className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 rounded-xl px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5"
            >
              <span>📄</span> Export Job Sheet
            </button>
          </div>
        </div>

        {/* Stage & QR Bar */}
        <div className="mt-4 pt-3.5 border-t border-gray-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-400">Stage:</span>
            {!isClient && canEdit ? (
              <select
                value={product.stage || 'cutting'}
                onChange={(e) => updateStage(e.target.value)}
                className="bg-gray-950 border border-gray-700 text-gray-200 rounded-lg px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {STAGES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${stageInfo(product.stage).color}`}>
                {stageInfo(product.stage).label}
              </span>
            )}
          </div>

          {!isClient && (
            <button
              onClick={() => setShowQR(true)}
              className="bg-gray-950 hover:bg-gray-800 border border-gray-800 text-gray-300 rounded-lg px-2.5 py-1 text-xs font-medium flex items-center gap-1.5"
            >
              <span>📱</span> Quick QR Login
            </button>
          )}
        </div>

        {product.planned_work?.length > 0 && (
          <div className="mt-3 bg-gray-950/60 border border-gray-800/80 rounded-xl p-2.5 text-xs">
            <span className="text-gray-500 uppercase tracking-wider text-[10px] font-bold mr-2">Planned Work:</span>
            <div className="inline-flex flex-wrap gap-1.5 mt-1 sm:mt-0">
              {product.planned_work.map((w, idx) => (
                <span key={idx} className="bg-gray-800 text-gray-300 px-2 py-0.5 rounded-md text-[11px] font-medium">
                  {w}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800 text-sm gap-2">
        <button
          onClick={() => setActiveTab('sizes')}
          className={`pb-2 px-3 font-semibold transition ${
            activeTab === 'sizes' ? 'text-brand-500 border-b-2 border-brand-500' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          Sizes & Qty
        </button>
        <button
          onClick={() => setActiveTab('photos')}
          className={`pb-2 px-3 font-semibold transition ${
            activeTab === 'photos' ? 'text-brand-500 border-b-2 border-brand-500' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          Photos ({photos.length})
        </button>

        {/* Tailor work logs are internal only */}
        {!isClient && (
          <button
            onClick={() => setActiveTab('work')}
            className={`pb-2 px-3 font-semibold transition ${
              activeTab === 'work' ? 'text-brand-500 border-b-2 border-brand-500' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Work History ({logs.length})
          </button>
        )}
      </div>

      {activeTab === 'sizes' && (
        <SizesTab
          productId={product.id}
          sizes={sizes}
          canEdit={!isClient && canEdit}
          onReload={loadProduct}
        />
      )}

      {activeTab === 'photos' && (
        <PhotosTab
          productId={product.id}
          photos={photos}
          canEdit={!isClient && canEdit}
          onReload={loadProduct}
        />
      )}

      {!isClient && activeTab === 'work' && (
        <WorkLogsTab
          productId={product.id}
          logs={logs}
          canLog={canLog}
          onOpenLogModal={() => setShowLogWork(true)}
          onReload={loadProduct}
        />
      )}

      {showShipmentModal && (
        <ShipmentModal
          product={product}
          sizes={sizes}
          onClose={() => setShowShipmentModal(false)}
          onUpdated={loadProduct}
        />
      )}

      {showQR && (
        <Modal onClose={() => setShowQR(false)}>
          <div className="text-center p-2">
            <h3 className="text-lg font-bold text-gray-100">{product.name}</h3>
            <p className="text-xs text-gray-400 mb-4">{product.po_number || 'Single Order'}</p>
            <div className="w-56 h-56 mx-auto bg-white p-3 rounded-2xl flex items-center justify-center shadow-lg">
              <img src={qrUrl} alt="Garment Log QR" className="w-full h-full" />
            </div>
            <p className="text-xs text-gray-400 mt-4">
              Scan with phone camera to update stages or record piece-rate tailor logs.
            </p>
          </div>
        </Modal>
      )}

      {showLogWork && (
        <LogWorkModal
          productId={product.id}
          employees={employees}
          onClose={() => setShowLogWork(false)}
          onSaved={() => {
            setShowLogWork(false)
            loadProduct()
          }}
        />
      )}

      {showEdit && (
        <EditProductModal
          product={product}
          brands={brands}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false)
            loadProduct()
          }}
          onDeleted={() => {
            setShowEdit(false)
            navigate('/orders')
          }}
        />
      )}
    </div>
  )
}

function SizesTab({ productId, sizes, canEdit, onReload }) {
  const [sizeList, setSizeList] = useState(sizes)
  const [newLabel, setNewLabel] = useState('')
  const [newQty, setNewQty] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSizeList(sizes)
  }, [sizes])

  const updateQuantity = async (sizeId, qty) => {
    const validQty = Math.max(0, parseInt(qty, 10) || 0)
    await supabase.from('product_sizes').update({ quantity: validQty }).eq('id', sizeId)
    onReload()
  }

  const addSize = async (e) => {
    e.preventDefault()
    if (!newLabel.trim()) return
    setSaving(true)
    try {
      await supabase.from('product_sizes').insert({
        product_id: productId,
        size_label: newLabel.trim().toUpperCase(),
        quantity: parseInt(newQty, 10) || 0,
      })
      setNewLabel('')
      setNewQty('')
      onReload()
    } finally {
      setSaving(false)
    }
  }

  const removeSize = async (sizeId) => {
    if (!confirm('Remove this size?')) return
    await supabase.from('product_sizes').delete().eq('id', sizeId)
    onReload()
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {sizeList.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5"
          >
            <span className="font-bold text-gray-200 text-sm w-16">{s.size_label}</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                disabled={!canEdit}
                value={s.quantity}
                onChange={(e) => {
                  const val = e.target.value
                  setSizeList((prev) => prev.map((item) => (item.id === s.id ? { ...item, quantity: val } : item)))
                }}
                onBlur={(e) => updateQuantity(s.id, e.target.value)}
                className={`w-20 bg-gray-950 border border-gray-700 text-gray-100 rounded-lg px-2.5 py-1 text-right text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-brand-500 ${
                  !canEdit ? 'cursor-not-allowed text-gray-400' : ''
                }`}
              />
              <span className="text-xs text-gray-400">pcs</span>
              {canEdit && (
                <button
                  onClick={() => removeSize(s.id)}
                  className="text-xs text-gray-500 hover:text-red-400 ml-3"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {canEdit && (
        <form onSubmit={addSize} className="flex gap-2 pt-2">
          <input
            placeholder="Size (e.g. 2XL)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="w-28 bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <input
            type="number"
            placeholder="Qty"
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
            className="w-24 bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <button
            type="submit"
            disabled={saving}
            className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-4 py-2 text-xs font-semibold"
          >
            + Add Size
          </button>
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
        await supabase.from('product_photos').insert({ product_id: productId, photo_url: url })
      }
      onReload()
    } catch (err) {
      alert('Upload failed: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  const removePhoto = async (photoId) => {
    if (!confirm('Delete photo?')) return
    await supabase.from('product_photos').delete().eq('id', photoId)
    onReload()
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <div>
          <label className="inline-block bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-4 py-2 text-xs font-semibold cursor-pointer">
            {uploading ? 'Uploading...' : '+ Upload Photos'}
            <input type="file" multiple accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
          </label>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {photos.map((p) => (
          <div key={p.id} className="aspect-square rounded-xl bg-gray-900 border border-gray-800 overflow-hidden relative group">
            <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
            {canEdit && (
              <button
                onClick={() => removePhoto(p.id)}
                className="absolute top-2 right-2 bg-black/70 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {photos.length === 0 && <p className="text-xs text-gray-500">No additional photos uploaded yet.</p>}
      </div>
    </div>
  )
}

function WorkLogsTab({ productId, logs, canLog, onOpenLogModal, onReload }) {
  const deleteLog = async (logId) => {
    if (!confirm('Delete this work log entry?')) return
    await supabase.from('work_logs').delete().eq('id', logId)
    onReload()
  }

  return (
    <div className="space-y-3">
      {canLog && (
        <div>
          <button
            onClick={onOpenLogModal}
            className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-4 py-2 text-xs font-semibold"
          >
            + Record Completed Work
          </button>
        </div>
      )}

      <div className="space-y-2">
        {logs.map((l) => (
          <div
            key={l.id}
            className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center justify-between text-xs"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-200">{l.employees?.name || 'Unknown Tailor'}</span>
                <span className="bg-gray-800 text-gray-300 px-2 py-0.5 rounded text-[11px]">
                  {WORK_TYPE_LABEL?.[l.work_type] || l.work_type}
            