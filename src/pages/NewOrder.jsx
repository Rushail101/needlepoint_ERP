import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase, uploadPhoto } from '../supabaseClient.js'
import { inputClass, labelClass } from '../components/Modal.jsx'
import { WORK_TYPES } from '../workTypes.js'

export default function NewOrder() {
  const navigate = useNavigate()
  const [brands, setBrands] = useState([])
  const [savedGarments, setSavedGarments] = useState([])
  const [pickedGarmentId, setPickedGarmentId] = useState('')

  const [brandId, setBrandId] = useState('')
  const [name, setName] = useState('')
  const [styleCode, setStyleCode] = useState('')
  const [coverPhotoUrl, setCoverPhotoUrl] = useState(null)
  const [file, setFile] = useState(null)
  const [saveToCatalog, setSaveToCatalog] = useState(true)

  const [sizes, setSizes] = useState([{ size_label: '', quantity: '' }])
  const [plannedWork, setPlannedWork] = useState([])
  const [pricePerPiece, setPricePerPiece] = useState('')
  const [gstRate, setGstRate] = useState(5)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('brands').select('*').order('name').then(({ data }) => setBrands(data || []))
    supabase.from('garments').select('*').order('name').then(({ data }) => setSavedGarments(data || []))
  }, [])

  const handleBrandChange = (newBrandId) => {
    setBrandId(newBrandId)
    if (pickedGarmentId) {
      const current = savedGarments.find(g => g.id === pickedGarmentId)
      if (current && newBrandId && current.brand_id !== newBrandId) {
        pickGarment('')
      }
    }
  }

  const pickGarment = (id) => {
    setPickedGarmentId(id)
    if (!id) {
      setName('')
      setStyleCode('')
      setCoverPhotoUrl(null)
      setFile(null)
      return
    }
    const g = savedGarments.find(sg => sg.id === id)
    if (g) {
      setName(g.name)
      setStyleCode(g.style_code || '')
      if (g.brand_id) setBrandId(g.brand_id)
      setCoverPhotoUrl(g.cover_photo_url || null)
      setFile(null)
    }
  }

  const updateSize = (i, field, value) => {
    setSizes(sizes.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)))
  }
  const addSizeRow = () => setSizes([...sizes, { size_label: '', quantity: '' }])
  const removeSizeRow = (i) => setSizes(sizes.filter((_, idx) => idx !== i))

  const toggleWork = (key) => {
    setPlannedWork(prev => (prev.includes(key) ? prev.filter(w => w !== key) : [...prev, key]))
  }

  const validSizes = sizes.filter(s => s.size_label.trim() && Number(s.quantity) > 0)
  const totalQty = validSizes.reduce((sum, s) => sum + Number(s.quantity), 0)
  const subtotal = pricePerPiece ? Number(pricePerPiece) * totalQty : null
  const gstAmount = subtotal ? (subtotal * Number(gstRate)) / 100 : 0
  const hasPricing = Boolean(pricePerPiece && !isNaN(Number(pricePerPiece)) && totalQty > 0)
  const subtotal = hasPricing ? Number(pricePerPiece) * totalQty : 0
  const gstAmount = hasPricing ? (subtotal * Number(gstRate)) / 100 : 0

  // Round to the nearest ₹1
  const finalTotal = hasPricing ? Math.round(subtotal + gstAmount) : 0

  const visibleGarments = brandId
    ? savedGarments.filter(g => g.brand_id === brandId)
    : savedGarments

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim()) { setError('Garment name is required.'); return }
    if (validSizes.length === 0) { setError('Add at least one size with a quantity.'); return }
    setError('')
    setSaving(true)
    try {
      let finalPhotoUrl = coverPhotoUrl
      if (file) finalPhotoUrl = await uploadPhoto(file, 'products')

      let garmentId = pickedGarmentId || null

      if (!garmentId && saveToCatalog) {
        const { data: newGarment, error: gErr } = await supabase.from('garments').insert({
          name: name.trim(),
          style_code: styleCode.trim() || null,
          brand_id: brandId || null,
          cover_photo_url: finalPhotoUrl,
        }).select().single()
        if (gErr) throw gErr
        garmentId = newGarment.id
      }

      const { data: order, error: orderErr } = await supabase.from('products').insert({
        garment_id: garmentId,
        name: name.trim(),
        style_code: styleCode.trim() || null,
        brand_id: brandId || null,
        status: 'in_production',
        stage: 'cutting',
        price_per_piece: pricePerPiece ? Number(pricePerPiece) : null,
        gst_rate: Number(gstRate),
        total_amount: finalTotal,
        planned_work: plannedWork,
        cover_photo_url: finalPhotoUrl,
      }).select().single()
      if (orderErr) throw orderErr

      const sizeRows = validSizes.map(s => ({
        product_id: order.id,
        size_label: s.size_label.trim(),
        quantity: Number(s.quantity),
      }))
      const { error: sizeErr } = await supabase.from('product_sizes').insert(sizeRows)
      if (sizeErr) throw sizeErr

      navigate(`/products/${order.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto pb-10">
      <Link to="/" className="text-brand-500 text-sm font-medium">← Back to Orders</Link>
      <h2 className="text-xl font-bold text-gray-100 mt-3 mb-4">New Order</h2>

      <form onSubmit={submit}>
        {/* Brand Selector */}
        <label className={labelClass}>Brand</label>
        <select
          value={brandId}
          onChange={(e) => handleBrandChange(e.target.value)}
          className={`${inputClass} mb-4`}
        >
          <option value="">All Brands / No brand</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        {/* Visual Garment Selector */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <label className={labelClass}>Select Existing Garment</label>
            {pickedGarmentId && (
              <button
                type="button"
                onClick={() => pickGarment('')}
                className="text-xs text-brand-400 hover:underline"
              >
                Clear Selection (Create New)
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-64 overflow-y-auto p-1 bg-gray-950/40 rounded-xl border border-gray-800">
            <button
              type="button"
              onClick={() => pickGarment('')}
              className={`p-2.5 rounded-lg border text-left flex flex-col items-center justify-center text-center transition ${
                !pickedGarmentId
                  ? 'border-brand-500 bg-brand-950/20 text-brand-300'
                  : 'border-gray-800 bg-gray-900/60 text-gray-400 hover:border-gray-700'
              }`}
            >
              <span className="text-2xl mb-1">✍️</span>
              <span className="text-xs font-semibold leading-tight">New / Custom Garment</span>
            </button>

            {visibleGarments.map(g => {
              const isSelected = pickedGarmentId === g.id
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => pickGarment(isSelected ? '' : g.id)}
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

          {visibleGarments.length === 0 && (
            <p className="text-xs text-gray-500 mt-1">No catalog garments found for this brand.</p>
          )}
        </div>

        {/* Selected Photo Display */}
        {coverPhotoUrl && !file && (
          <div className="mb-4">
            <label className={labelClass}>Garment Image</label>
            <div className="w-40 aspect-square rounded-xl overflow-hidden border border-gray-800 bg-gray-900 flex items-center justify-center">
              <img src={coverPhotoUrl} alt="Preview" className="w-full h-full object-cover" />
            </div>
          </div>
        )}

        <label className={labelClass}>Garment name*</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          placeholder="e.g. Oversized Hoodie - Navy"
          disabled={!!pickedGarmentId}
          required
        />

        <label className={labelClass}>Style code</label>
        <input
          value={styleCode}
          onChange={(e) => setStyleCode(e.target.value)}
          className={inputClass}
          placeholder="optional"
          disabled={!!pickedGarmentId}
        />

        {!pickedGarmentId && (
          <>
            <label className={labelClass}>Photo</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files[0])}
              className="w-full mb-3 text-sm text-gray-300"
            />
            <label className="flex items-center gap-2 mb-4 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={saveToCatalog}
                onChange={(e) => setSaveToCatalog(e.target.checked)}
              />
              Save this as a garment for future repeat orders
            </label>
          </>
        )}

        {/* Sizes */}
        <label className={labelClass}>Sizes & Quantities*</label>
        <div className="space-y-2 mb-2">
          {sizes.map((s, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={s.size_label}
                onChange={(e) => updateSize(i, 'size_label', e.target.value)}
                placeholder="Size (e.g. M)"
                className="bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 flex-1 text-sm"
              />
              <input
                value={s.quantity}
                onChange={(e) => updateSize(i, 'quantity', e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                placeholder="Qty"
                className="bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 w-24 text-sm"
              />
              {sizes.length > 1 && (
                <button type="button" onClick={() => removeSizeRow(i)} className="text-red-400 text-sm px-2">✕</button>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={addSizeRow} className="text-brand-500 text-sm font-medium mb-4">+ Add another size</button>

        {/* Work Required */}
        <label className={labelClass}>Work required</label>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {WORK_TYPES.map(w => (
            <button
              key={w.key}
              type="button"
              onClick={() => toggleWork(w.key)}
              className={`border rounded-xl p-3 flex flex-col items-center gap-1 ${
                plannedWork.includes(w.key)
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-gray-900 border-gray-800 text-gray-200'
              }`}
            >
              <span className="text-xl">{w.icon}</span>
              <span className="text-xs font-medium text-center">{w.label}</span>
            </button>
          ))}
        </div>

        {/* Pricing & GST */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelClass}>Price per piece (₹)</label>
            <input
              value={pricePerPiece}
              onChange={(e) => setPricePerPiece(e.target.value.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              className={inputClass}
              placeholder="Base rate before GST"
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
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition ${
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

        {/* Order Breakdown */}
        {(totalQty > 0 || subtotal != null) && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4 space-y-2 text-sm">
            <div className="flex justify-between text-gray-300">
              <span>Total Quantity:</span>
              <span className="font-semibold text-gray-100">{totalQty} pcs</span>
            </div>

            {subtotal != null && (
              <>
                <div className="flex justify-between text-gray-300">
                  <span>Subtotal (Taxable):</span>
                  <span>₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>

                <div className="flex justify-between text-gray-400 text-xs">
                  <span>GST ({gstRate}%):</span>
                  <span>₹{gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>

                <div className="border-t border-gray-800 pt-2 mt-2 flex justify-between text-base font-bold text-gray-100">
                  <span>Grand Total:</span>
                  <span className="text-brand-400">
                    ₹{(finalTotal ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
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
          {saving ? 'Creating...' : 'Create Order'}
        </button>
      </form>
    </div>
  )
}
