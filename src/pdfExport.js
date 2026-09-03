import jsPDF from 'jspdf'

const inr = (n) => `INR ${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

// 1. Single Product PDF
export async function exportProductPDF({ product, sizes }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()

  // Header Banner
  doc.setFillColor(15, 23, 42) // Slate 900
  doc.rect(0, 0, pageWidth, 75, 'F')
  doc.setFillColor(234, 88, 12) // Brand Orange
  doc.rect(0, 75, pageWidth, 4, 'F')

  // Header Text
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('NEEDLE POINT', 40, 42)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(203, 213, 225)
  doc.text('PRODUCTION JOB SHEET', 40, 58)

  doc.setFont('helvetica', 'bold')
  doc.text(product.po_number ? `PO: ${product.po_number}` : `ID: ${product.id.slice(0, 8)}`, pageWidth - 40, 42, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, pageWidth - 40, 58, { align: 'right' })

  // Summary Card
  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(226, 232, 240)
  doc.roundedRect(40, 95, pageWidth - 80, 65, 6, 6, 'FD')

  doc.setTextColor(15, 23, 42)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(product.name || 'Untitled Garment', 55, 120)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  doc.text(`Brand: ${product.brands?.name || 'Independent'}   |   Style: ${product.style_code || 'N/A'}   |   Stage: ${(product.stage || 'CUTTING').toUpperCase()}`, 55, 136)

  const totalQty = (sizes || []).reduce((sum, s) => sum + (Number(s.quantity) || 0), 0)
  const grandTotal = product.total_amount != null ? product.total_amount : 0

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(234, 88, 12)
  doc.text(`Quantity: ${totalQty} pcs       Total: ${inr(grandTotal)}`, 55, 150)

  // Sizes Table
  let y = 185
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text('SIZE & QUANTITY BREAKDOWN', 40, y)
  y += 12

  // Table Header
  doc.setFillColor(15, 23, 42)
  doc.rect(40, y, pageWidth - 80, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9)
  doc.text('Size Label', 50, y + 15)
  doc.text('Quantity', pageWidth - 50, y + 15, { align: 'right' })
  y += 22

  // Table Rows
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(15, 23, 42)
  ;(sizes || []).forEach((s, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252)
      doc.rect(40, y, pageWidth - 80, 20, 'F')
    }
    doc.text(String(s.size_label), 50, y + 14)
    doc.text(`${s.quantity} pcs`, pageWidth - 50, y + 14, { align: 'right' })
    y += 20
  })

  // Financial Summary
  if (product.price_per_piece) {
    y += 25
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text('FINANCIAL SUMMARY', 40, y)
    y += 12

    const rate = Number(product.price_per_piece)
    const subtotal = rate * totalQty
    const slab = product.gst_rate ?? 5
    const tax = (subtotal * slab) / 100

    const finRows = [
      ['Rate per piece (Excl. GST)', inr(rate)],
      ['Subtotal (Taxable Value)', inr(subtotal)],
      [`GST (${slab}%)`, inr(tax)],
      ['Grand Total', inr(grandTotal || Math.round(subtotal + tax))],
    ]

    finRows.forEach(([lbl, val], idx) => {
      doc.setFillColor(idx % 2 === 0 ? 255 : 248, 250, 252)
      doc.rect(40, y, pageWidth - 80, 20, 'F')
      doc.setFont('helvetica', idx === 3 ? 'bold' : 'normal')
      doc.setTextColor(idx === 3 ? 234 : 71, idx === 3 ? 88 : 85, idx === 3 ? 12 : 105)
      doc.text(lbl, 50, y + 14)
      doc.text(val, pageWidth - 50, y + 14, { align: 'right' })
      y += 20
    })
  }

  doc.save(`${(product.name || 'Order').replace(/\s+/g, '_')}_Job_Sheet.pdf`)
}

// 2. Multi-Product Batch PDF
export async function exportBatchOrderPDF({ batch, brandName }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()

  // Header Banner
  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, pageWidth, 80, 'F')
  doc.setFillColor(234, 88, 12)
  doc.rect(0, 80, pageWidth, 4, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text('NEEDLE POINT', 40, 44)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(203, 213, 225)
  doc.text('CONSOLIDATED PRODUCTION BATCH SHEET', 40, 62)

  doc.setFont('helvetica', 'bold')
  doc.text(`PO: ${batch.po_number}`, pageWidth - 40, 44, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, pageWidth - 40, 62, { align: 'right' })

  // Summary Details
  const totalQty = (batch.items || []).reduce((acc, p) => {
    return acc + (p.product_sizes || []).reduce((qAcc, s) => qAcc + (Number(s.quantity) || 0), 0)
  }, 0)

  const combinedGrandTotal = (batch.items || []).reduce((acc, p) => {
    if (p.total_amount != null) return acc + Number(p.total_amount)
    const pQty = (p.product_sizes || []).reduce((qAcc, s) => qAcc + (Number(s.quantity) || 0), 0)
    const pSub = p.price_per_piece ? Number(p.price_per_piece) * pQty : 0
    return acc + (pSub > 0 ? Math.round(pSub + (pSub * (p.gst_rate ?? 5)) / 100) : 0)
  }, 0)

  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(226, 232, 240)
  doc.roundedRect(40, 100, pageWidth - 80, 50, 6, 6, 'FD')

  doc.setTextColor(15, 23, 42)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(`Client Brand: ${brandName || 'Independent'}`, 55, 122)
  doc.text(`Styles: ${batch.items?.length || 0}   |   Volume: ${totalQty} pcs`, 55, 137)

  doc.setTextColor(234, 88, 12)
  doc.text(`Batch Total: ${inr(combinedGrandTotal)}`, pageWidth - 55, 130, { align: 'right' })

  // Batch Table Header
  let y = 170
  doc.setFillColor(15, 23, 42)
  doc.rect(40, y, pageWidth - 80, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('Garment Style', 50, y + 15)
  doc.text('Stage', 230, y + 15)
  doc.text('Sizes (Breakdown)', 330, y + 15)
  doc.text('Qty', 450, y + 15, { align: 'right' })
  doc.text('Total', pageWidth - 50, y + 15, { align: 'right' })
  y += 22

  // Batch Table Rows
  ;(batch.items || []).forEach((it, idx) => {
    const qty = (it.product_sizes || []).reduce((qAcc, s) => qAcc + (Number(s.quantity) || 0), 0)
    const sizeSummary = (it.product_sizes || []).map(s => `${s.size_label}:${s.quantity}`).join(', ') || 'Free'
    const totalAmt = it.total_amount ? inr(it.total_amount) : (it.price_per_piece ? inr(it.price_per_piece * qty) : '-')

    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252)
      doc.rect(40, y, pageWidth - 80, 24, 'F')
    }

    doc.setTextColor(15, 23, 42)
    doc.setFont('helvetica', 'bold')
    doc.text(it.name, 50, y + 16)

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    doc.text((it.stage || 'CUTTING').toUpperCase(), 230, y + 16)
    doc.text(sizeSummary.slice(0, 24), 330, y + 16)
    doc.text(`${qty} pcs`, 450, y + 16, { align: 'right' })

    doc.setTextColor(234, 88, 12)
    doc.setFont('helvetica', 'bold')
    doc.text(totalAmt, pageWidth - 50, y + 16, { align: 'right' })
    y += 24
  })

  doc.save(`PO_${batch.po_number}_Batch_Sheet.pdf`)
}
