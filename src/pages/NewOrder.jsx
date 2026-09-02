import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase, uploadPhoto } from '../supabaseClient.js'
import { inputClass, labelClass } from '../components/Modal.jsx'
import { WORK_TYPES } from '../workTypes.js'

export default function NewOrder() {
  const navigate = useNavigate()
  const [brands, setBrands] = useState([])
  const [savedGarments, setSavedGarments] = useState([])
  const [pickedGarmentId, setPickedGarmentId] = useState('') // '' = typing a new one

  const [brandId, setBrandId] = useState('')
  const [name, setName] = useState('')
  const [styleCode, setStyleCode] = useState('')
  const [coverPhotoUrl, setCoverPhotoUrl] = useState(null) // carried over when a saved garment is picked
  const [file, setFile] = useState(null)
  const [saveToCatalog, setSaveToCatalog] = useState(true)

  const [sizes, setSizes] = useState([{ size_label: '', quantity: '' }])
  const [plannedWork, setPlannedWork] = useState([])
  const [pricePerPiece, setPricePerPiece] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('brands').select('*').order('name').then(({ data }) => setBrands(data || []))
    supabase.from('garments').select('*').order('name').then(({ data }) => setSavedGarments(data || []))
  }, [])

  const pickGarment = (id) => {
    setPickedGarmentId(id)
    if (!id) {
      setName(''); setStyleCode(''); setBrandId(''); setCoverPhotoUrl(null); setFile(null)
      return
    }
    const g = savedGarments.find(sg => sg.id === id)
    if (g) {
      setName(g.name); setStyleCode(g.style_code || ''); setBrandId(g.brand_id || '')
      setCoverPhotoUrl(g.cover_photo_url || null); setFile(null)
    }
  }

  const updateSize = (i, field, value) => {
    setSizes(sizes.map((s, idx) => idx === i ? { ...s, [field]: value } : s))
  }
  const addSizeRow = () => setSizes([...sizes, { size_label: '', quantity: '' }])
  const removeSizeRow = (i) => setSizes(sizes.filter((_, idx) => idx !== i))

  const toggleWork = (key) => {
    setPlannedWork(prev => prev.includes(key) ? prev.filter(w => w !== key) : [...prev, key])
  }

  const validSizes = sizes.filter(s => s.size_label.trim() && Number(s.quantity) > 0)
  const totalQty = validSizes.reduce((sum, s) => sum + Number(s.quantity), 0)
  const totalValue = pricePerPiece ? Number(pricePerPiece) * totalQty : null

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

      // If this is a fresh (not-picked-from-catalog) garment and the admin wants it
      // saved for next time, create the catalog entry now and link this order to it.
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
    <div>
      <Link to="/" className="text-brand-500 text-sm font-medium">← Back to Orders</Link>
      <h2 className="text-xl font-bold text-gray-100 mt-3 mb-4">New Order</h2>

      <form onSubmit={submit}>
        {savedGarments.length > 0 && (
          <>
            <label className={labelClass}>Garment</label>
            <select value={pickedGarmentId} onChange={(e) => pickGarment(e.target.value)} className={inputClass}>
              <option value="">— Type a new garment below —</option>
              {savedGarments.map(g => <option key={g.id} value={g.id}>{g.name}{g.style_code ? ` (${g.style_code})` : ''}</option>)}
            </select>
          </>
        )}

        {coverPhotoUrl && !file && (
          <img src={coverPhotoUrl} className="w-full h-32 object-cover rounded-lg mb-2" />
        )}

        <label className={labelClass}>Brand</label>
        <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className={inputClass} disabled={!!pickedGarmentId}>
          <option value="">No brand</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        <label className={labelClass}>Garment name*</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass}
          placeholder="e.g. Oversized Hoodie - Navy" disabled={!!pickedGarmentId} required />

        <label className={labelClass}>Style code</label>
        <input value={styleCode} onChange={(e) => setStyleCode(e.target.value)} className={inputClass}
          placeholder="optional" disabled={!!pickedGarmentId} />

        {!pickedGarmentId && (
          <>
            <label className={labelClass}>Photo</label>
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} className="w-full mb-3 text-sm text-gray-300" />
            <label className="flex items-center gap-2 mb-4 text-sm text-gray-300">
              <input type="checkbox" checked={saveToCatalog} onChange={(e) => setSaveToCatalog(e.target.checked)} />
              Save this as a garment for future repeat orders
            </label>
          </>
        )}

        <label className={labelClass}>Sizes & Quantities*</label>
        <div className="space-y-2 mb-2">
          {sizes.map((s, i) => (
            <div key={i} className="flex gap-2">
              <input value={s.size_label} onChange={(e) => updateSize(i, 'size_label', e.target.value)}
                placeholder="Size (e.g. M)" className="bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 flex-1 text-sm" />
              <input value={s.quantity} onChange={(e) => updateSize(i, 'quantity', e.target.value.replace(/\D/g, ''))}
                inputMode="numeric" placeholder="Qty" className="bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 w-24 text-sm" />
              {sizes.length > 1 && (
                <button type="button" onClick={() => removeSizeRow(i)} className="text-red-400 text-sm px-2">✕</button>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={addSizeRow} className="text-brand-500 text-sm font-medium mb-4">+ Add another size</button>

        <label className={labelClass}>Work required</label>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {WORK_TYPES.map(w => (
            <button key={w.key} type="button" onClick={() => toggleWork(w.key)}
              className={`border rounded-xl p-3 flex flex-col items-center gap-1 ${plannedWork.includes(w.key) ? 'bg-brand-600 text-white border-brand-600' : 'bg-gray-900 border-gray-800 text-gray-200'}`}>
              <span className="text-xl">{w.icon}</span>
              <span className="text-xs font-medium text-center">{w.label}</span>
            </button>
          ))}
        </div>

        <label className={labelClass}>Price per piece (₹)</label>
        <input value={pricePerPiece} onChange={(e) => setPricePerPiece(e.target.value.replace(/[^0-9.]/g, ''))}
          inputMode="decimal" className={inputClass} placeholder="optional — used for the order summary" />

        {(totalQty > 0 || totalValue) && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
            <p className="text-sm text-gray-300">Total Qty: <span className="font-semibold text-gray-100">{totalQty} pcs</span></p>
            {totalValue != null && (
              <p className="text-sm text-gray-300 mt-1">Total Order Value: <span className="font-semibold text-gray-100">₹{totalValue.toLocaleString('en-IN')}</span></p>
            )}
          </div>
        )}

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <button type="submit" disabled={saving}
          className="w-full bg-brand-600 hover:bg-brand-700 text-white rounded-xl py-3 font-semibold disabled:opacity-50">
          {saving ? 'Creating...' : 'Create Order'}
        </button>
      </form>
    </div>
  )
}
