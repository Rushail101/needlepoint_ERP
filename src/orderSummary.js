import { WORK_TYPE_LABEL } from './workTypes.js'

export function buildOrderSummaryText({ product, brandName, sizes }) {
  const totalQty = sizes.reduce((sum, s) => sum + (s.quantity || 0), 0)
  const totalValue = product.price_per_piece ? (product.price_per_piece * totalQty) : null

  const lines = []
  lines.push(`Order Summary — ${product.name}`)
  if (brandName) lines.push(`Brand: ${brandName}`)
  if (product.style_code) lines.push(`Style Code: ${product.style_code}`)
  lines.push('')
  lines.push('Sizes:')
  if (sizes.length === 0) {
    lines.push('  (none added yet)')
  } else {
    sizes.forEach(s => lines.push(`  ${s.size_label}: ${s.quantity} pcs`))
  }
  lines.push(`Total Qty: ${totalQty} pcs`)
  lines.push('')
  if (product.planned_work?.length) {
    lines.push('Work Required:')
    product.planned_work.forEach(w => lines.push(`  - ${WORK_TYPE_LABEL[w] || w}`))
    lines.push('')
  }
  if (product.price_per_piece) {
    lines.push(`Price per piece: ₹${product.price_per_piece}`)
    lines.push(`Total Order Value: ₹${totalValue?.toLocaleString('en-IN')}`)
  }
  return lines.join('\n')
}

// Builds a wa.me link. If a phone number is given, pre-fills the recipient too;
// otherwise it just opens WhatsApp's contact picker with the message ready to send.
export function buildWhatsAppUrl(text, phone) {
  const encoded = encodeURIComponent(text)
  let digits = (phone || '').replace(/\D/g, '')
  if (digits && digits.length === 10) digits = '91' + digits // assume Indian number if no country code given
  return digits ? `https://wa.me/${digits}?text=${encoded}` : `https://wa.me/?text=${encoded}`
}
