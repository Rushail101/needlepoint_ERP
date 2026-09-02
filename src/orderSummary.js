export function buildOrderSummaryText({ product, brandName, sizes, subtotal, gstRate, gstAmount, grandTotal }) {
  const brand = brandName || product?.brands?.name || 'No brand'
  const styleCode = product?.style_code ? ` (${product.style_code})` : ''
  const validSizes = (sizes || []).filter(s => (Number(s.quantity) || 0) > 0)
  const totalQty = validSizes.reduce((sum, s) => sum + Number(s.quantity), 0)

  // Fallback calculations if not explicitly passed
  const rate = Number(product?.price_per_piece || 0)
  const rateTotal = subtotal != null ? subtotal : (rate > 0 && totalQty > 0 ? rate * totalQty : 0)
  const slab = gstRate != null ? Number(gstRate) : (product?.gst_rate != null ? Number(product.gst_rate) : 5)
  const tax = gstAmount != null ? gstAmount : (rateTotal > 0 ? (rateTotal * slab) / 100 : 0)
  const finalAmount = grandTotal != null ? grandTotal : (product?.total_amount != null ? Number(product.total_amount) : Math.round(rateTotal + tax))

  // Size breakdown list
  const sizeLines = validSizes.length > 0
    ? validSizes.map(s => `• ${s.size_label}: ${s.quantity} pcs`).join('\n')
    : '• No sizes specified'

  // Work requirements list
  const workList = product?.planned_work?.length > 0
    ? `\n*Work Required:*\n${product.planned_work.map(w => `• ${w}`).join('\n')}\n`
    : ''

  // Pricing block
  let pricingBlock = ''
  if (rate > 0 && totalQty > 0) {
    pricingBlock = `
*Pricing Breakdown:*
• Rate per piece: ₹${rate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
• Subtotal: ₹${rateTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
• GST (${slab}%): ₹${tax.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
*Grand Total: ₹${finalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}*`
  }

  return `*ORDER SUMMARY*
*Product:* ${product?.name || 'Untitled'}${styleCode}
*Brand:* ${brand}
*Total Quantity:* ${totalQty} pcs

*Size Breakdown:*
${sizeLines}
${workList}${pricingBlock}`
}

export function buildWhatsAppUrl(text, phone) {
  const cleanPhone = (phone || '').replace(/\D/g, '')
  const encodedText = encodeURIComponent(text)
  return cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodedText}`
    : `https://api.whatsapp.com/send?text=${encodedText}`
}
