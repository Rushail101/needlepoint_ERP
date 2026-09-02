import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, uploadPhoto } from '../supabaseClient.js'
import Modal, { FormActions, inputClass, labelClass } from '../components/Modal.jsx'
import { STAGES, stageInfo } from '../stages.js'
import { useAuth } from '../components/PinGate.jsx'
import { can } from '../permissions.js'

const STATUS_LABEL = {
  in_production: { text: 'In Production', color: 'bg-blue-900/50 text-blue-300' },
  sampling: { text: 'Sampling', color: 'bg-yellow-900/50 text-yellow-300' },
  completed: { text: 'Completed', color: 'bg-green-900/50 text-green-300' },
  on_hold: { text: 'On Hold', color: 'bg-gray-800 text-gray-400' },
}

export default function Orders() {
  const { user } = useAuth()
  const canEdit = can(user, 'edit_garments')
  const [orders, setOrders] = useState([])
  const [brands, setBrands] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [filterBrand, setFilterBrand] = useState('')
  const [search, setSearch] = useState('')

  const load = async () => {
    setLoading(true)
    const { data: prods } = await supabase
      .from('products')
      .select('*, brands(name), product_sizes(quantity)')
      .order('created_at', { ascending: false })
    const { data: brs } = await supabase.from('brands').select('*').order('name')
    setOrders(prods || [])
    setBrands(brs || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = orders
    .filter(p => (filterBrand ? p.brand_id === filterBrand : true))
    .filter(p => {
      if (!search.trim()) return true
      const q = search.trim().toLowerCase()
      return p.name?.toLowerCase().includes(q) ||
        p.style_code?.toLowerCase().includes(q) ||
        p.brands?.name?.toLowerCase().includes(q)
    })

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2">
        <h2 className="text-xl font-bold text-gray-100">Orders</h2>
        {canEdit && (
          <Link to="/orders/new"
            className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-4 py-2 font-semibold text-sm">
            + Add Order
          </Link>
        )}
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, style code, or brand..."
        className="w-full bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 mb-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
      />

      {brands.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-3 mb-2">
          <button
            onClick={() => setFilterBrand('')}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${filterBrand === '' ? 'bg-brand-600 text-white' : 'bg-gray-800 border border-gray-700 text-gray-300'}`}
          >All Brands</button>
          {brands.map(b => (
            <button
              key={b.id}
              onClick={() => setFilterBrand(b.id)}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${filterBrand === b.id ? 'bg-brand-600 text-white' : 'bg-gray-800 border border-gray-700 text-gray-300'}`}
            >{b.name}</button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-center py-10">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500 text-center py-10">No orders yet. Tap "Add Order" to start.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.map((p) => {
            const totalQty = (p.product_sizes || []).reduce((acc, s) => acc + (Number(s.quantity) || 0), 0)
            const subtotal = p.price_per_piece && totalQty > 0 ? Number(p.price_per_piece) * totalQty : 0
            const gstRate = p.gst_rate ?? 5
            const calculatedTotal = subtotal > 0 ? Math.round(subtotal + (subtotal * gstRate) / 100) : 0
            const grandTotal = p.total_amount != null ? Number(p.total_amount) : calculatedTotal

            return (
              <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition relative">
                {canEdit && (
                  <button
                    onClick={(e) => { e.preventDefault(); setEditing(p) }}
                    className="absolute top-1.5 right-1.5 z-10 bg-black/60 hover:bg-black/80 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm"
                    aria-label="Edit order"
                  >✎</button>
                )}
                <Link to={`/products/${p.id}`}>
                  <div className="aspect-square bg-gray-800">
                    {p.cover_photo_url ? (
                      <img src={p.cover_photo_url} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl text-gray-600">👕</div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="font-semibold text-sm truncate text-gray-100">{p.name}</p>
                    <p className="text-xs text-gray-400 truncate">{p.brands?.name || 'No brand'}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {p.status && (
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_LABEL[p.status]?.color || 'bg-gray-800 text-gray-400'}`}>
                          {STATUS_LABEL[p.status]?.text || p.status}
                        </span>
                      )}
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${stageInfo(p.stage).color}`}>
                        {stageInfo(p.stage).label}
                      </span>
                    </div>

                    {grandTotal > 0 && (
                      <div className="mt-2 pt-1.5 border-t border-gray-800 flex items-center justify-between text-xs">
                        <span className="text-gray-400">{totalQty} pcs</span>
                        <span className="font-semibold text-brand-400">
                          ₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    )}
                  </div>
                </Link>
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <OrderQuickEditForm
          brands={brands}
          order={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

function OrderQuickEditForm({ brands, order, onClose, onSaved }) {
  const [name, setName] = useState(order.name || '')
  const [styleCode, setStyleCode] = useState(order.style_code || '')
  const [brandId, setBrandId] = useState(order.brand_id || '')
  const [status, setStatus] = useState(order.status || 'in_production')
  const [stage, setStage] = useState(order.stage || 'cutting')
  const [pricePerPiece, setPricePerPiece] = useState(order.price_per_piece != null ? String(order.price_per_piece) : '')
  const [gstRate, setGstRate] = useState(order.gst_rate != null ? Number(order.gst_rate) : 5)
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const totalQty = (order.product_sizes || []).reduce((sum, s) => sum + (Number(s.quantity) || 0), 0)
  const hasPricing = Boolean(pricePerPiece && !isNaN(Number(pricePerPiece)) && totalQty > 0)
  const subtotal = hasPricing ? Number(pricePerPiece) * totalQty : 0
  const gstAmount = hasPricing ? (subtotal * Number(gstRate)) / 100 : 0
  const finalTotal = hasPricing ? Math.round(subtotal + gstAmount) : null

  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      let cover_photo_url = order.cover_photo_url || null
      if (file) cover_photo_url = await uploadPhoto(file, 'products')
      await supabase.from('products').update({
        name: name.trim(),
        style_code: styleCode.trim() || null,
        brand_id: brandId || null,
        status,
        stage,
        price_per_piece: pricePerPiece ? Number(pricePerPiece) : null,
        gst_rate: Number(gstRate),
        total_amount: finalTotal,
        cover_photo_url,
      }).eq('id', order.id)
      onSaved()
    } catch (err) {
      alert('Could not save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm(`Delete "${order.name}"? This removes all its photos, sizes, work history and sample versions too.`)) return
    setSaving(true)
    try {
      await supabase.from('products').delete().eq('id', order.id)
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
        <h3 className="text-lg font-bold mb-4 text-gray-100">Edit Order</h3>

        {order.cover_photo_url && !file && (
          <div className="w-full h-36 rounded-lg overflow-hidden border border-gray-800 mb-2 flex items-center justify-center bg-gray-900">
            <img src={order.cover_photo_url} className="w-full h-full object-cover" />
          </div>
        )}
        <label className={labelClass}>Photo</label>
        <input type="file" accept="image/*"
          onChange={(e) => setFile(e.target.files[0])}
          className="w-full mb-3 text-sm text-gray-300" />

        <label className={labelClass}>Garment name*</label>
        <input value={name} onChange={(e) => setName(e.target.value)}
          className={inputClass} placeholder="e.g. Oversized Hoodie - Navy" required />

        <label className={labelClass}>Style code</label>
        <input value={styleCode} onChange={(e) => setStyleCode(e.target.value)}
          className={inputClass} placeholder="optional" />

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

        <label className={labelClass}>Production stage</label>
        <select value={stage} onChange={(e) => setStage(e.target.value)} className={inputClass}>
          {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className={labelClass}>Price per piece (₹)</label>
            <input
              value={pricePerPiece}
              onChange={(e) => setPricePerPiece(e.target.value.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              className={inputClass}
              placeholder="Rate before GST"
            />
          </div>
          <div>
            <label className={labelClass}>GST Slab</label>
            <div className="flex gap-2">
              {[
                { label: '0%', value: 0 },
                { label: '5%', value: 5 },
                { label: '18%', value: 18 },
              ].map(slab => (
                <button
                  key={slab.value}
                  type="button"
                  onClick={() => setGstRate(slab.value)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition ${
                    gstRate === slab.value
                      ? 'bg-brand-600 border-brand-600 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  {slab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {totalQty > 0 && (
          <div className="bg-gray-950/60 border border-gray-800 rounded-xl p-3 mb-4 space-y-1.5 text-xs">
            <div className="flex justify-between text-gray-400">
              <span>Total Quantity:</span>
              <span className="font-medium text-gray-200">{totalQty} pcs</span>
            </div>
            {hasPricing && (
              <>
                <div className="flex justify-between text-gray-400">
                  <span>Subtotal (Taxable):</span>
                  <span>₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>GST ({gstRate}%):</span>
                  <span>₹{gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="border-t border-gray-800 pt-1.5 mt-1 flex justify-between font-bold text-sm text-gray-100">
                  <span>Grand Total:</span>
                  <span className="text-brand-400">
                    ₹{finalTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        <FormActions onCancel={onClose} saving={saving} onDelete={remove} />
      </form>
    </Modal>
  )
}
