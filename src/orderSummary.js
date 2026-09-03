export function buildBatchSummaryText({ batch, brandName }) {
  const brand = brandName || batch.brands?.name || 'Independent'
  const totalQty = batch.items.reduce((acc, p) => {
    return acc + (p.product_sizes || []).reduce((qAcc, s) => qAcc + (Number(s.quantity) || 0), 0)
  }, 0)

  const grandTotal = batch.items.reduce((acc, p) => {
    if (p.total_amount != null) return acc + Number(p.total_amount)
    const pQty = (p.product_sizes || []).reduce((qAcc, s) => qAcc + (Number(s.quantity) || 0), 0)
    const pSub = p.price_per_piece ? Number(p.price_per_piece) * pQty : 0
    return acc + (pSub > 0 ? Math.round(pSub + (pSub * (p.gst_rate ?? 5)) / 100) : 0)
  }, 0)

  const productLines = batch.items.map((it, idx) => {
    const qty = (it.product_sizes || []).reduce((qAcc, s) => qAcc + (Number(s.quantity) || 0), 0)
    const sizes = (it.product_sizes || []).map(s => `${s.size_label}:${s.quantity}`).join(', ')
    const priceText = it.total_amount ? ` — ₹${Number(it.total_amount).toLocaleString('en-IN')}` : ''
    return `${idx + 1}. *${it.name}* (${qty} pcs)${priceText}\n   Sizes: [${sizes || 'Free Size'}]`
  }).join('\n\n')

  return `*NEEDLE POINT — PRODUCTION BATCH SUMMARY*
*PO Number:* ${batch.po_number}
*Brand:* ${brand}
*Total Items:* ${batch.items.length} styles (${totalQty} pcs)

*Styles Breakdown:*
${productLines}

------------------------------
*Grand Total:* ₹${grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export function buildOrderSummaryText({ product, brandName, sizes, subtotal, gstRate, gstAmount, grandTotal }) {
  const brand = brandName || product?.brands?.name || 'Independent'
  const styleCode = product?.style_code ? ` (${product.style_code})` : ''
  const validSizes = (sizes || []).filter(s => (Number(s.quantity) || 0) > 0)
  const totalQty = validSizes.reduce((sum, s) => sum + Number(s.quantity), 0)

  const rate = Number(product?.price_per_piece || 0)
  const rateTotal = subtotal != null ? subtotal : (rate > 0 && totalQty > 0 ? rate * totalQty : 0)
  const slab = gstRate != null ? Number(gstRate) : (product?.gst_rate != null ? Number(product.gst_rate) : 5)
  const tax = gstAmount != null ? gstAmount : (rateTotal > 0 ? (rateTotal * slab) / 100 : 0)
  const finalAmount = grandTotal != null ? grandTotal : (product?.total_amount != null ? Number(product.total_amount) : Math.round(rateTotal + tax))

  const sizeLines = validSizes.length > 0
    ? validSizes.map(s => `• ${s.size_label}: ${s.quantity} pcs`).join('\n')
    : '• Free Size'

  let pricingBlock = ''
  if (rate > 0 && totalQty > 0) {
    pricingBlock = `
*Pricing Breakdown:*
• Rate: ₹${rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })} / pc
• Subtotal: ₹${rateTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
• GST (${slab}%): ₹${tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
*Grand Total: ₹${finalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}*`
  }

  return `*NEEDLE POINT — ORDER SUMMARY*
*Product:* ${product?.name || 'Untitled'}${styleCode}
*Brand:* ${brand}
*Quantity:* ${totalQty} pcs

*Sizes:*
${sizeLines}${pricingBlock}`
}

export function buildWhatsAppUrl(text, phone) {
  const cleanPhone = (phone || '').replace(/\D/g, '')
  const encodedText = encodeURIComponent(text)
  return cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodedText}`
    : `https://api.whatsapp.com/send?text=${encodedText}`
}
