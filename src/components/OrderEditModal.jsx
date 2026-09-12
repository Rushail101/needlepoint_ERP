import { useEffect, useState } from 'react'
import { supabase, uploadPhoto } from '../supabaseClient.js'
import Modal, { FormActions, inputClass, labelClass } from './Modal.jsx'
import { sendTelegramMessage } from '../telegram.js'

// Fixed sample pricing rule: every sample is a flat ₹5,000 + 18% GST = ₹5,900,
// regardless of quantity. Production orders keep a normal price-per-piece × GST slab.
export const SAMPLE_FEE_BASE = 5000
export const SAMPLE_GST_RATE = 18

export default function OrderEditModal({ product, brands, onClose, onSaved, onDeleted }) {
  const [name, setName] = useState(product.name || '')
  const [styleCode, setStyleCode] = useState(product.style_code || '')
  const [brandId, setBrandId] = useState(product.brand_id || '')
  const [poNumber, setPoNumber] = useState(product.po_number || '')
  const [status, setStatus] = useState(product.status || 'in_production')
  const [file, setFile] = useState(null)
  const [pdfFile, setPdfFile] = useState(null)

  const isSample = status === 'sampling'
  const [pricePerPiece, setPricePerPiece] = useState(
    isSample ? '' : (product.price_per_piece != null ? String(product.price_per_piece) : '')
  )
  const [gstRate, setGstRate] = useState(product.gst_rate ?? 5)

  const [totalQty, setTotalQty] = useState(null)
  useEffect(() => {
    supabase.from('product_sizes').select('quantity').eq('product_id', product.id).then(({ data }) => {
      setTotalQty((data || []).reduce((sum, s) => sum + (Number(s.quantity) || 0), 0))
    })
  }, [product.id])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const previewTotal = isSample
    ? Math.round(SAMPLE_FEE_BASE * (1 + SAMPLE_GST_RATE / 100))
    : (pricePerPiece && totalQty ? Math.round(Number(pricePerPiece) * totalQty * (1 + Number(gstRate) / 100)) : null)

  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      let cover_photo_url = product.cover_photo_url || null
      if (file) cover_photo_url = await uploadPhoto(file, 'products')
      let tech_pack_url = product.tech_pack_url || null
      if (pdfFile) tech_pack_url = await uploadPhoto(pdfFile, 'garments')

      const finalPrice = isSample ? SAMPLE_FEE_BASE : (pricePerPiece ? Number(pricePerPiece) : null)
      const finalGst = isSample ? SAMPLE_GST_RATE : Number(gstRate)

      const payload = {
        name: name.trim(),
        style_code: styleCode.trim() || null,
        brand_id: brandId || null,
        po_number: poNumber.trim().toUpperCase() || null,
        status,
        cover_photo_url,
        tech_pack_url,
        price_per_piece: finalPrice,
        gst_rate: finalGst,
        total_amount: previewTotal,
      }

      const { error: err } = await supabase.from('products').update(payload).eq('id', product.id)
      if (err) throw err

      // Compile change log for Telegram notification
      const changes = []
      if (product.name !== payload.name) {
        changes.push(`• <b>Name:</b> <s>${product.name || 'None'}</s> ➔ <b>${payload.name}</b>`)
      }
      if ((product.style_code || '') !== (payload.style_code || '')) {
        changes.push(`• <b>Style Code:</b> <s>${product.style_code || 'None'}</s> ➔ <b>${payload.style_code || 'None'}</b>`)
      }
      if ((product.brand_id || '') !== (payload.brand_id || '')) {
        const oldBrand = brands.find((b) => b.id === product.brand_id)?.name || 'None'
        const newBrand = brands.find((b) => b.id === payload.brand_id)?.name || 'None'
        changes.push(`• <b>Brand:</b> <s>${oldBrand}</s> ➔ <b>${newBrand}</b>`)
      }
      if ((product.po_number || '') !== (payload.po_number || '')) {
        changes.push(`• <b>PO Number:</b> <s>${product.po_number || 'None'}</s> ➔ <b>${payload.po_number || 'None'}</b>`)
      }
      if (product.status !== payload.status) {
        changes.push(`• <b>Status:</b> <s>${product.status || 'None'}</s> ➔ <b>${payload.status}</b>`)
      }
      if (Number(product.price_per_piece || 0) !== Number(payload.price_per_piece || 0)) {
        changes.push(`• <b>Price:</b> <s>₹${product.price_per_piece ?? 0}</s> ➔ <b>₹${payload.price_per_piece ?? 0}</b>`)
      }
      if (file) changes.push(`• <b>Cover Photo:</b> Updated`)
      if (pdfFile) changes.push(`• <b>Tech Pack:</b> Updated`)

      if (changes.length > 0) {
        const brandName = brands.find((b) => b.id === (payload.brand_id || product.brand_id))?.name || 'No Brand'
        const telegramMessage = [
          `✏️ <b>GARMENT / ORDER UPDATED</b>`,
          `━━━━━━━━━━━━━━━━━━━━`,
          `<b>Garment:</b> ${payload.name}`,
          `<b>Brand:</b> ${brandName}`,
          `<b>Style Code:</b> ${payload.style_code || 'N/A'}`,
          `<b>PO Number:</b> ${payload.po_number || 'N/A'}`,
          ``,
          `<b>Modifications:</b>`,
          changes.join('\n'),
        ].join('\n')

        sendTelegramMessage(telegramMessage)
      }

      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm(`Delete "${product.name}"? This removes all its photos, sizes, and work history too.`)) return
    setSaving(true)
    try {
      await supabase.from('products').delete().eq('id', product.id)
      
      const brandName = brands.find((b) => b.id === product.brand_id)?.name || 'No Brand'
      const deleteMessage = [
        `🗑️ <b>GARMENT / ORDER DELETED</b>`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `<b>Garment:</b> ${product.name}`,
        `<b>Brand:</b> ${brandName}`,
        `<b>Style Code:</b> ${product.style_code || 'N/A'}`,
        `<b>PO Number:</b> ${product.po_number || 'N/A'}`,
      ].join('\n')
      
      sendTelegramMessage(deleteMessage)

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
        <h3 className="text-lg font-bold mb-4 text-gray-100">Edit Order</h3>

        <label className={labelClass}>Garment name*</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />

        <label className={labelClass}>Style code</label>
        <input value={styleCode} onChange={(e) => setStyleCode(e.target.value)} className={inputClass} />

        <label className={labelClass}>Brand</label>
        <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className={inputClass}>
          <option value="">No brand</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        <label className={labelClass}>PO Number</label>
        <input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} className={inputClass} placeholder="optional" />

        <label className={labelClass}>Order State</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
          <option value="in_production">In Production</option>
          <option value="sampling">Sampling</option>
          <option value="on_hold">On Hold</option>
        </select>

        <label className={labelClass}>Cover Photo</label>
        {product.cover_photo_url && !file && (
          <img src={product.cover_photo_url} className="w-full h-28 object-cover rounded-lg mb-2" />
        )}
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} className="w-full mb-3 text-sm text-gray-300" />

        <label className={labelClass}>Tech Pack / Mockup (PDF)</label>
        {product.tech_pack_url && !pdfFile && (
          <a href={product.tech_pack_url} target="_blank" rel="noreferrer" className="block text-brand-400 text-xs underline mb-2">📄 Current PDF — view</a>
        )}
        <input type="file" accept="application/pdf" onChange={(e) => setPdfFile(e.target.files[0])} className="w-full mb-4 text-sm text-gray-300" />

        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 mb-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Pricing</p>

          {isSample ? (
            <div className="bg-gray-950 border border-amber-800/60 rounded-xl px-3 py-2.5 flex items-center justify-between">
              <span className="text-xs text-amber-400 font-semibold">🧪 Sample Fee (fixed)</span>
              <span className="text-sm font-bold text-gray-100">
                ₹{SAMPLE_FEE_BASE.toLocaleString('en-IN')} + {SAMPLE_GST_RATE}% GST = ₹{previewTotal?.toLocaleString('en-IN')}
              </span>
            </div>
          ) : (
            <>
              <label className={labelClass}>Price per piece (₹)</label>
              <input
                type="text" inputMode="decimal" value={pricePerPiece}
                onChange={(e) => setPricePerPiece(e.target.value.replace(/[^0-9.]/g, ''))}
                className={inputClass} placeholder="Not set yet — set it whenever you're ready"
              />
              <label className={labelClass}>GST Slab</label>
              <select value={gstRate} onChange={(e) => setGstRate(Number(e.target.value))} className={inputClass}>
                <option value={0}>0%</option>
                <option value={5}>5%</option>
                <option value={18}>18%</option>
              </select>
              {previewTotal != null && totalQty != null && (
                <p className="text-xs text-gray-400">
                  {totalQty} pcs × ₹{pricePerPiece} + {gstRate}% GST = <span className="font-bold text-gray-100">₹{previewTotal.toLocaleString('en-IN')}</span>
                </p>
              )}
              {!pricePerPiece && (
                <p className="text-[11px] text-gray-500 mt-1">No price set yet — the client sees this as pending until you add one.</p>
              )}
            </>
          )}
        </div>

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <FormActions onCancel={onClose} saving={saving} onDelete={remove} />
      </form>
    </Modal>
  )
}
