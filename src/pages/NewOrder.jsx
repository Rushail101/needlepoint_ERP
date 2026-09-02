import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase, uploadPhoto } from '../supabaseClient.js'
import { inputClass, labelClass } from '../components/Modal.jsx'
import { WORK_TYPES } from '../workTypes.js'

const createEmptyItem = () => ({
  pickedGarmentId: '',
  name: '',
  styleCode: '',
  coverPhotoUrl: null,
  file: null,
  sizes: [{ size_label: 'Free Size', quantity: '' }],
  plannedWork: [],
  pricePerPiece: '',
  saveToCatalog: true,
})

export default function NewOrder() {
  const navigate = useNavigate()
  const [brands, setBrands] = useState([])
  const [savedGarments, setSavedGarments] = useState([])

  // Order-level fields
  const [brandId, setBrandId] = useState('')
  const [poNumber, setPoNumber] = useState('')
  const [gstRate, setGstRate] = useState(5)

  // Multiple items
  const [items, setItems] = useState([createEmptyItem()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('brands').select('*').order('name').then(({ data }) => setBrands(data || []))
    supabase.from('garments').select('*').order('name').then(({ data }) => setSavedGarments(data || []))
  }, [])

  const updateItem = (index, field, value) => {
    setItems(prev => prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item)))
  }

  const pickGarment = (itemIndex, gId) => {
    const g = savedGarments.find(x => x.id === gId)
    setItems(prev => prev.map((item, idx) => {
      if (idx !== itemIndex) return item
      if (!gId || !g) {
        return { ...item, pickedGarmentId: '', name: '', styleCode: '', coverPhotoUrl: null, file: null }
      }
      return {
        ...item,
        pickedGarmentId: g.id,
        name: g.name,
        styleCode: g.style_code || '',
        coverPhotoUrl: g.cover_photo_url || null,
        file: null,
      }
    }))
  }

  const addLineItem = () => setItems([...items, createEmptyItem()])
  const removeLineItem = (index) => {
    if (items.length <= 1) return
    setItems(items.filter((_, idx) => idx !== index))
  }

  // Size Row Operations
  const updateSize = (itemIdx, sizeIdx, field, value) => {
    setItems(prev => prev.map((item, idx) => {
      if (idx !== itemIdx) return item
      const newSizes = item.sizes.map((s, sIdx) => sIdx === sizeIdx ? { ...s, [field]: value } : s)
      return { ...item, sizes: newSizes }
    }))
  }

  const addSize = (itemIdx) => {
    setItems(prev => prev.map((item, idx) => (
      idx === itemIdx ? { ...item, sizes: [...item.sizes, { size_label: '', quantity: '' }] } : item
    )))
  }

  const removeSize = (itemIdx, sizeIdx) => {
    setItems(prev => prev.map((item, idx) => (
      idx === itemIdx ? { ...item, sizes: item.sizes.filter((_, sIdx) => sIdx !== sizeIdx) } : item
    )))
  }

  const toggleWork = (itemIdx, key) => {
    setItems(prev => prev.map((item, idx) => {
      if (idx !== itemIdx) return item
      const planned = item.plannedWork.includes(key)
        ? item.plannedWork.filter(w => w !== key)
        : [...item.plannedWork, key]
      return { ...item, plannedWork: planned }
    }))
  }

  // Calculations
  const visibleGarments = brandId ? savedGarments.filter(g => g.brand_id === brandId) : savedGarments

  let grandTotalQty = 0
  let combinedSubtotal = 0

  items.forEach(item => {
    const itemQty = item.sizes
      .filter(s => s.size_label.trim() && Number(s.quantity) > 0)
      .reduce((sum, s) => sum + Number(s.quantity), 0)
    grandTotalQty += itemQty

    if (item.pricePerPiece && !isNaN(Number(item.pricePerPiece))) {
      combinedSubtotal += Number(item.pricePerPiece) * itemQty
    }
  })

  const gstAmount = combinedSubtotal > 0 ? (combinedSubtotal * Number(gstRate)) / 100 : 0
  const grandTotal = combinedSubtotal > 0 ? Math.round(combinedSubtotal + gstAmount) : 0

  const submit = async (e) => {
    e.preventDefault()
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item.name.trim()) { setError(`Product #${i + 1} needs a name.`); return }
      const validSizes = item.sizes.filter(s => s.size_label.trim() && Number(s.quantity) > 0)
      if (validSizes.length === 0) { setError(`Product #${i + 1} needs at least one size & quantity.`); return }
    }

    setError('')
    setSaving(true)
    try {
      for (const item of items) {
        let finalPhoto = item.coverPhotoUrl
        if (item.file) finalPhoto = await uploadPhoto(item.file, 'products')

        let garmentId = item.pickedGarmentId || null
        if (!garmentId && item.saveToCatalog) {
          const { data: newG, error: gErr } = await supabase.from('garments').insert({
            name: item.name.trim(),
            style_code: item.styleCode.trim() || null,
            brand_id: brandId || null,
            cover_photo_url: finalPhoto,
          }).select().single()
          if (gErr) throw gErr
          garmentId = newG.id
        }

        const validSizes = item.sizes.filter(s => s.size_label.trim() && Number(s.quantity) > 0)
        const qty = validSizes.reduce((sum, s) => sum + Number(s.quantity), 0)
        const rate = item.pricePerPiece ? Number(item.pricePerPiece) : null
        const itemSubtotal = rate ? rate * qty : 0
        const itemTotal = itemSubtotal ? Math.round(itemSubtotal + (itemSubtotal * Number(gstRate)) / 100) : null

        const { data: prod, error: pErr } = await supabase.from('products').insert({
          garment_id: garmentId,
          po_number: poNumber.trim() || null,
          name: item.name.trim(),
          style_code: item.styleCode.trim() || null,
          brand_id: brandId || null,
          status: 'in_production',
          stage: 'cutting',
          price_per_piece: rate,
          gst_rate: Number(gstRate),
          total_amount: itemTotal,
          planned_work: item.plannedWork,
          cover_photo_url: finalPhoto,
        }).select().single()
        if (pErr) throw pErr

        const sizeRows = validSizes.map(s => ({
          product_id: prod.id,
          size_label: s.size_label.trim(),
          quantity: Number(s.quantity),
        }))
        const { error: sErr } = await supabase.from('product_sizes').insert(sizeRows)
        if (sErr) throw sErr
      }

      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <Link to="/" className="text-brand-500 text-sm font-medium">← Back to Orders</Link>
      <h2 className="text-xl font-bold text-gray-100 mt-2 mb-4">Create Order Run</h2>

      <form onSubmit={submit}>
        {/* Brand & PO Header */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-6">
          <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3">Order Details</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Brand</label>
              <select
                value={brandId}
                onChange={(e) => {
                  setBrandId(e.target.value)
                  // reset picks if brand changed
                  setItems(items.map(it => ({ ...it, pickedGarmentId: '' })))
                }}
                className={inputClass}
              >
                <option value="">No Brand / Independent</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>PO / Batch Number</label>
              <input
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder="e.g. PO-892 or AUG-RUN-01"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Dynamic Products List */}
        <div className="space-y-6 mb-6">
          {items.map((item, idx) => (
            <div key={idx} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 relative">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-bold text-gray-300">Garment #{idx + 1}</span>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLineItem(idx)}
                    className="text-xs text-red-400 hover:text-red-300 font-medium"
                  >
                    Remove Garment
                  </button>
                )}
              </div>

              {/* Visual Garment Selector Grid */}
              {visibleGarments.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-gray-400">Pick from catalog</label>
                    {item.pickedGarmentId && (
                      <button
                        type="button"
                        onClick={() => pickGarment(idx, '')}
                        className="text-xs text-brand-400 hover:underline"
                      >
                        Clear Selection (Custom Garment)
                      </button>
                    )}
                  </div>
              
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2.5 max-h-60 overflow-y-auto p-1.5 bg-gray-950/40 rounded-xl border border-gray-800">
                    {/* Option to create new/custom */}
                    <button
                      type="button"
                      onClick={() => pickGarment(idx, '')}
                      className={`p-3 rounded-lg border text-left flex flex-col items-center justify-center text-center transition ${
                        !item.pickedGarmentId
                          ? 'border-brand-500 bg-brand-950/20 text-brand-300'
                          : 'border-gray-800 bg-gray-900/60 text-gray-400 hover:border-gray-700'
                      }`}
                    >
                      <span className="text-2xl mb-1">✍️</span>
                      <span className="text-xs font-semibold leading-tight">Custom Garment</span>
                    </button>
              
                    {/* Catalog items with square product cards */}
                    {visibleGarments.map((g) => {
                      const isSelected = item.pickedGarmentId === g.id
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => pickGarment(idx, isSelected ? '' : g.id)}
                          className={`group rounded-lg border overflow-hidden text-left transition flex flex-col bg-gray-900 ${
                            isSelected
                              ? 'border-brand-500 ring-2 ring-brand-500/50'
                              : 'border-gray-800 hover:border-gray-700'
                          }`}
                        >
                          <div className="aspect-square w-full bg-gray-800 flex items-center justify-center overflow-hidden">
                            {g.cover_photo_url ? (
                              <img
                                src={g.cover_photo_url}
                                alt={g.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                              />
                            ) : (
                              <span className="text-2xl text-gray-600">👕</span>
                            )}
                          </div>
                          <div className="p-2 w-full">
                            <p className="text-xs font-medium text-gray-100 truncate">{g.name}</p>
                            {g.style_code && (
                              <p className="text-[10px] text-gray-400 truncate">{g.style_code}</p>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Preview */}
              {item.coverPhotoUrl && !item.file && (
                <div className="w-20 aspect-square rounded-lg overflow-hidden border border-gray-800 mb-3 bg-gray-950">
                  <img src={item.coverPhotoUrl} className="w-full h-full object-cover" />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className={labelClass}>Garment name*</label>
                  <input
                    value={item.name}
                    onChange={(e) => updateItem(idx, 'name', e.target.value)}
                    placeholder="e.g. Oversized Hoodie"
                    disabled={!!item.pickedGarmentId}
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className={labelClass}>Style code</label>
                  <input
                    value={item.styleCode}
                    onChange={(e) => updateItem(idx, 'styleCode', e.target.value)}
                    placeholder="optional"
                    disabled={!!item.pickedGarmentId}
                    className={inputClass}
                  />
                </div>
              </div>

              {!item.pickedGarmentId && (
                <div className="mb-3">
                  <label className={labelClass}>Photo</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => updateItem(idx, 'file', e.target.files[0])}
                    className="w-full text-xs text-gray-400 mb-2"
                  />
                  <label className="flex items-center gap-2 text-xs text-gray-400">
                    <input
                      type="checkbox"
                      checked={item.saveToCatalog}
                      onChange={(e) => updateItem(idx, 'saveToCatalog', e.target.checked)}
                    />
                    Save to reusable garment catalog
                  </label>
                </div>
              )}

              {/* Sizes */}
              <label className={labelClass}>Sizes & Quantities*</label>
              <div className="space-y-1.5 mb-2">
                {item.sizes.map((s, sIdx) => (
                  <div key={sIdx} className="flex gap-2">
                    <input
                      value={s.size_label}
                      onChange={(e) => updateSize(idx, sIdx, 'size_label', e.target.value)}
                      placeholder="Size (e.g. M)"
                      className="bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-2.5 py-1.5 flex-1 text-sm"
                    />
                    <input
                      value={s.quantity}
                      onChange={(e) => updateSize(idx, sIdx, 'quantity', e.target.value.replace(/\D/g, ''))}
                      inputMode="numeric"
                      placeholder="Qty"
                      className="bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-2.5 py-1.5 w-24 text-sm"
                    />
                    {item.sizes.length > 1 && (
                      <button type="button" onClick={() => removeSize(idx, sIdx)} className="text-red-400 text-sm px-2">✕</button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => addSize(idx)}
                className="text-brand-500 text-xs font-semibold mb-3"
              >
                + Add size
              </button>

              {/* Work Required */}
              <div className="mb-3">
                <label className={labelClass}>Work Required</label>
                <div className="flex flex-wrap gap-1.5">
                  {WORK_TYPES.map(w => (
                    <button
                      key={w.key}
                      type="button"
                      onClick={() => toggleWork(idx, w.key)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1 ${
                        item.plannedWork.includes(w.key)
                          ? 'bg-brand-600 border-brand-600 text-white'
                          : 'bg-gray-800 border-gray-700 text-gray-300'
                      }`}
                    >
                      <span>{w.icon}</span>
                      <span>{w.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Per-Garment Rate */}
              <div>
                <label className={labelClass}>Rate per piece (₹)</label>
                <input
                  value={item.pricePerPiece}
                  onChange={(e) => updateItem(idx, 'pricePerPiece', e.target.value.replace(/[^0-9.]/g, ''))}
                  inputMode="decimal"
                  placeholder="Base rate before GST"
                  className={inputClass}
                />
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addLineItem}
            className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-800 hover:border-brand-500/50 text-gray-300 hover:text-brand-400 font-semibold text-sm transition"
          >
            + Add Another Product to this Order
          </button>
        </div>

        {/* GST Slab Selection */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-5">
          <label className={labelClass}>GST Slab (Applied to Order Total)</label>
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

        {/* Batch Summary */}
        {grandTotalQty > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-4 space-y-2 text-sm">
            <div className="flex justify-between text-gray-300">
              <span>Total Items:</span>
              <span className="font-semibold text-gray-100">{items.length} styles ({grandTotalQty} pcs)</span>
            </div>

            {combinedSubtotal > 0 && (
              <>
                <div className="flex justify-between text-gray-300">
                  <span>Subtotal (Taxable):</span>
                  <span>₹{combinedSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-gray-400 text-xs">
                  <span>GST ({gstRate}%):</span>
                  <span>₹{gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="border-t border-gray-800 pt-2 mt-2 flex justify-between text-base font-bold text-gray-100">
                  <span>Grand Total:</span>
                  <span className="text-brand-400">
                    ₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-brand-600 hover:bg-brand-700 text-white rounded-xl py-3 font-semibold disabled:opacity-50"
        >
          {saving ? 'Creating Order Run...' : `Create Order (${items.length} Products)`}
        </button>
      </form>
    </div>
  )
}
