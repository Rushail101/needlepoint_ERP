import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase, uploadPhoto } from '../supabaseClient.js'
import { inputClass, labelClass } from '../components/Modal.jsx'
import { useAuth } from '../components/PinGate.jsx'

const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL']

export default function NewOrder() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isClient = user?.role === 'client'

  const [brands, setBrands] = useState([])
  const [savedGarments, setSavedGarments] = useState([])
  const [brandId, setBrandId] = useState(isClient ? user.brandId : '')
  const [poNumber, setPoNumber] = useState('')
  const [status, setStatus] = useState('in_production')
  const [submitting, setSubmitting] = useState(false)

  const [items, setItems] = useState([
    {
      id: 1,
      pickedGarmentId: '',
      name: '',
      styleCode: '',
      coverPhotoUrl: null,
      file: null,
      pdfFile: null,
      techPackUrl: null,
      saveToCatalog: false,
      pricePerPiece: '',
      gstRate: 5,
      plannedWork: ['cutting', 'stitching', 'finishing'],
      sizes: DEFAULT_SIZES.map((sz) => ({ size_label: sz, quantity: '' })),
    },
  ])

  useEffect(() => {
    const loadPrerequisites = async () => {
      try {
        if (isClient && user?.brandId) {
          setBrandId(user.brandId)
          const [{ data: b }, { data: gList }] = await Promise.all([
            supabase.from('brands').select('*').eq('id', user.brandId).maybeSingle(),
            supabase.from('garments').select('*').eq('brand_id', user.brandId).order('name'),
          ])
          if (b) setBrands([b])
          setSavedGarments(gList || [])
        } else {
          const [{ data: brs }, { data: gList }] = await Promise.all([
            supabase.from('brands').select('*').order('name'),
            supabase.from('garments').select('*').order('name'),
          ])
          setBrands(brs || [])
          setSavedGarments(gList || [])
        }
      } catch (err) {
        console.error('Failed loading prerequisites:', err)
      }
    }
    loadPrerequisites()
  }, [isClient, user?.brandId])

  const pickGarment = (idx, gId) => {
    const g = savedGarments.find((x) => x.id === gId)
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it
        if (!gId || !g) {
          return {
            ...it,
            pickedGarmentId: '',
            name: '',
            styleCode: '',
            coverPhotoUrl: null,
            file: null,
            pdfFile: null,
            techPackUrl: null,
            pricePerPiece: '',
          }
        }
        return {
          ...it,
          pickedGarmentId: g.id,
          name: g.name,
          styleCode: g.style_code || '',
          coverPhotoUrl: g.cover_photo_url || null,
          techPackUrl: g.tech_pack_url || null,
          file: null,
          pdfFile: null,
          pricePerPiece: g.default_price_per_piece != null ? String(g.default_price_per_piece) : it.pricePerPiece,
        }
      })
    )
  }

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: Date.now(),
        pickedGarmentId: '',
        name: '',
        styleCode: '',
        coverPhotoUrl: null,
        file: null,
        pdfFile: null,
        techPackUrl: null,
        saveToCatalog: false,
        pricePerPiece: '',
        gstRate: 5,
        plannedWork: ['cutting', 'stitching', 'finishing'],
        sizes: DEFAULT_SIZES.map((sz) => ({ size_label: sz, quantity: '' })),
      },
    ])
  }

  const removeItem = (idx) => {
    if (items.length <= 1) return
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    for (const it of items) {
      if (!it.name.trim()) {
        alert('Please provide a name for all garments in this order.')
        return
      }
    }

    setSubmitting(true)
    try {
      const finalBrandId = isClient ? user.brandId : (brandId || null)
      const cleanPo = poNumber.trim().toUpperCase() || null

      for (const it of items) {
        let finalPhoto = it.coverPhotoUrl || null
        if (it.file) {
          finalPhoto = await uploadPhoto(it.file, 'products')
        }

        let finalPdfUrl = it.techPackUrl || null
        if (it.pdfFile) {
          finalPdfUrl = await uploadPhoto(it.pdfFile, 'garments')
        }

        let garmentId = it.pickedGarmentId ? it.pickedGarmentId : null

        if (!garmentId && it.saveToCatalog) {
          const { data: newG, error: gErr } = await supabase
            .from('garments')
            .insert({
              name: it.name.trim(),
              style_code: it.styleCode.trim() || null,
              brand_id: finalBrandId,
              cover_photo_url: finalPhoto,
              tech_pack_url: finalPdfUrl,
              default_price_per_piece: !isClient && it.pricePerPiece ? Number(it.pricePerPiece) : null,
            })
            .select()
            .single()
          if (gErr) throw gErr
          garmentId = newG.id
        }

        const validSizes = it.sizes.filter((s) => parseInt(s.quantity, 10) > 0)
        const totalUnits = validSizes.reduce((sum, s) => sum + parseInt(s.quantity, 10), 0)
        const rate = it.pricePerPiece ? Number(it.pricePerPiece) : null
        const sub = rate && totalUnits > 0 ? rate * totalUnits : 0
        const slab = Number(it.gstRate || 5)
        const grand = sub > 0 ? Math.round(sub + (sub * slab) / 100) : null

        const productPayload = {
          name: it.name.trim(),
          style_code: it.styleCode.trim() || null,
          brand_id: finalBrandId,
          po_number: cleanPo,
          status: isClient ? 'in_production' : status,
          stage: 'cutting',
          planned_work: it.plannedWork || ['cutting', 'stitching', 'finishing'],
          cover_photo_url: finalPhoto,
          tech_pack_url: finalPdfUrl,
          garment_id: garmentId,
          price_per_piece: rate,
          gst_rate: slab,
          total_amount: grand,
        }

        const { data: prod, error: pErr } = await supabase
          .from('products')
          .insert(productPayload)
          .select()
          .single()

        if (pErr) {
          console.error('Supabase Product Insert Error:', pErr)
          throw new Error(pErr.message || 'Error creating product record')
        }

        if (validSizes.length > 0) {
          const sizeInserts = validSizes.map((s) => ({
            product_id: prod.id,
            size_label: s.size_label.trim().toUpperCase(),
            quantity: parseInt(s.quantity, 10),
          }))
          const { error: sErr } = await supabase.from('product_sizes').insert(sizeInserts)
          if (sErr) throw sErr
        }
      }

      navigate('/orders')
    } catch (err) {
      console.error('Submit Error:', err)
      alert('Could not place order: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/orders" className="text-brand-500 hover:text-brand-400 text-sm font-semibold">
          ← Cancel
        </Link>
        <h2 className="text-xl font-bold text-gray-100">
          {isClient ? 'Place New Production Order' : 'Create Order / Run'}
        </h2>
        <div className="w-12" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Client Brand*</label>
            {isClient ? (
              <input
                disabled
                value={user.name}
                className="w-full bg-gray-950 border border-gray-800 text-gray-400 rounded-xl px-3 py-2 text-sm font-semibold cursor-not-allowed"
              />
            ) : (
              <select
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                className={inputClass}
                required
              >
                <option value="">Select Brand</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className={labelClass}>Purchase Order (PO) Number</label>
            <input
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              placeholder="e.g. PO-2026-001"
              className={inputClass}
            />
          </div>

          {!isClient && (
            <div>
              <label className={labelClass}>Order State</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
                <option value="in_production">In Production</option>
                <option value="sampling">Sampling</option>
                <option value="on_hold">On Hold</option>
              </select>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {items.map((it, idx) => (
            <div key={it.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-5 relative space-y-3">
              <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                <span className="text-xs uppercase font-bold text-brand-400 tracking-wider">
                  Garment #{idx + 1}
                </span>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="text-xs text-red-400 hover:text-red-300 font-semibold"
                  >
                    Remove Garment
                  </button>
                )}
              </div>

              {savedGarments.length > 0 && (
                <div>
                  <label className={labelClass}>Pick Existing Style from Catalog</label>
                  <select
                    value={it.pickedGarmentId}
                    onChange={(e) => pickGarment(idx, e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Custom / New Garment</option>
                    {savedGarments.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} {g.style_code ? `(${g.style_code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Garment Name*</label>
                  <input
                    value={it.name}
                    onChange={(e) => {
                      const v = e.target.value
                      setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, name: v } : x)))
                    }}
                    placeholder="e.g. Heavyweight Boxy Tee"
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className={labelClass}>Style Code</label>
                  <input
                    value={it.styleCode}
                    onChange={(e) => {
                      const v = e.target.value
                      setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, styleCode: v } : x)))
                    }}
                    placeholder="e.g. NP-BOX-01"
                    className={inputClass}
                  />
                </div>
              </div>

              {!isClient ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Price per piece (₹)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={it.pricePerPiece}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9.]/g, '')
                        setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, pricePerPiece: v } : x)))
                      }}
                      placeholder="Rate before GST"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>GST Slab</label>
                    <select
                      value={it.gstRate}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, gstRate: v } : x)))
                      }}
                      className={inputClass}
                    >
                      <option value={0}>0%</option>
                      <option value={5}>5%</option>
                      <option value={18}>18%</option>
                    </select>
                  </div>
                </div>
              ) : (
                it.pricePerPiece && (
                  <div className="bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs flex justify-between items-center">
                    <span className="text-gray-400">Agreed Unit Rate:</span>
                    <span className="font-bold text-brand-400">
                      ₹{Number(it.pricePerPiece).toLocaleString('en-IN')} / pc
                    </span>
                  </div>
                )
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className={labelClass}>Cover Photo</label>
                  {it.coverPhotoUrl && !it.file && (
                    <div className="w-16 h-16 rounded-lg overflow-hidden border border-gray-800 mb-2">
                      <img src={it.coverPhotoUrl} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files[0]
                      setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, file: f } : x)))
                    }}
                    className="w-full text-xs text-gray-400"
                  />
                </div>

                <div>
                  <label className={labelClass}>Tech Pack / Mockup (PDF)</label>
                  {it.techPackUrl && !it.pdfFile && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-gray-300">📄 PDF attached</span>
                      <a
                        href={it.techPackUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-400 text-xs font-semibold hover:underline"
                      >
                        View
                      </a>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => {
                      const f = e.target.files[0]
                      setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, pdfFile: f } : x)))
                    }}
                    className="w-full text-xs text-gray-400"
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Sizes & Quantities</label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {it.sizes.map((s, sIdx) => (
                    <div key={sIdx} className="bg-gray-950 border border-gray-800 rounded-xl p-2 text-center">
                      <span className="block text-xs font-bold text-gray-300 mb-1">{s.size_label}</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={s.quantity}
                        onChange={(e) => {
                          const v = e.target.value
                          setItems((prev) =>
                            prev.map((x, i) => {
                              if (i !== idx) return x
                              const newSizes = [...x.sizes]
                              newSizes[sIdx].quantity = v
                              return { ...x, sizes: newSizes }
                            })
                          )
                        }}
                        className="w-full bg-gray-900 border border-gray-700 text-gray-100 text-center text-xs font-bold rounded-lg py-1 px-1 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {!it.pickedGarmentId && (
                <label className="flex items-center gap-2 text-xs text-gray-300 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={it.saveToCatalog}
                    onChange={(e) => {
                      const c = e.target.checked
                      setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, saveToCatalog: c } : x)))
                    }}
                    className="rounded border-gray-700 bg-gray-950 text-brand-600 focus:ring-brand-500"
                  />
                  <span>Save this style to reusable catalog for future orders</span>
                </label>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={addItem}
            className="w-full py-3 bg-gray-900 border border-dashed border-gray-700 hover:border-gray-500 text-gray-300 rounded-2xl text-xs font-bold transition"
          >
            + Add Another Garment to this Order
          </button>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-3.5 rounded-2xl text-sm transition disabled:opacity-50"
        >
          {submitting ? 'Placing Order...' : 'Submit Order'}
        </button>
      </form>
    </div>
  )
}
