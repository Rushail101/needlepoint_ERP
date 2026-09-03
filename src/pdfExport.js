import jsPDF from 'jspdf'
import 'jspdf-autotable'

// Helper to format currency
const inr = (n) => `INR ${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

// 1. Colorful Single Product PDF
export async function exportProductPDF({ product, sizes, photos, logs, workTypeLabel }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  
  // Header Banner
  doc.setFillColor(15, 23, 42) // Slate 900
  doc.rect(0, 0, pageWidth, 75, 'F')

  // Accent Line
  doc.setFillColor(234, 88, 12) // Brand Orange
  doc.rect(0, 75, pageWidth, 4, 'F')

  // Title & Brand
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('NEEDLE POINT', 40, 42)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(203, 213, 225)
  doc.text('PRODUCTION JOB SHEET & SPECIFICATION', 40, 58)

  // Top Right Meta Info
  doc.setFont('helvetica', 'bold')
  doc.text(product.po_number ? `PO: ${product.po_number}` : `ORDER: ${product.id.slice(0, 8)}`, pageWidth - 40, 42, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, pageWidth - 40, 58, { align: 'right' })

  // Summary Card Box
  doc.setFillColor(248, 250, 252) // Slate 50
  doc.setDrawColor(226, 232, 240)
  doc.roundedRect(40, 95, pageWidth - 80, 70, 6, 6, 'FD')

  doc.setTextColor(15, 23, 42)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(product.name || 'Untitled Garment', 55, 120)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  doc.text(`Brand: ${product.brands?.name || 'Independent'}    |    Style Code: ${product.style_code || 'N/A'}    |    Stage: ${product.stage?.toUpperCase() || 'CUTTING'}`, 55, 138)

  const totalQty = (sizes || []).reduce((sum, s) => sum + (Number(s.quantity) || 0), 0)
  const grandTotal = product.total_amount != null ? product.total_amount : 0

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(234, 88, 12)
  doc.text(`Total Quantity: ${totalQty} pcs       Grand Total: ${inr(grandTotal)}`, 55, 154)

  let startY = 180

  // Sizes Table
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text('SIZE & QUANTITY BREAKDOWN', 40, startY)

  const sizeRows = (sizes || []).map(s => [s.size_label, `${s.quantity} pcs`])
  doc.autoTable({
    startY: startY + 8,
    margin: { left: 40, right: 40 },
    head: [['Size Label', 'Quantity']],
    body: sizeRows.length > 0 ? sizeRows : [['No sizes listed', '-']],
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  })

  startY = doc.lastAutoTable.finalY + 25

  // Financial Breakdown Table (If pricing exists)
  if (product.price_per_piece) {
    const rate = Number(product.price_per_piece)
    const subtotal = rate * totalQty
    const slab = product.gst_rate ?? 5
    const tax = (subtotal * slab) / 100

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('FINANCIAL SUMMARY', 40, startY)

    doc.autoTable({
      startY: startY + 8,
      margin: { left: 40, right: 40 },
      body: [
        ['Rate per piece (Excl. GST)', inr(rate)],
        ['Subtotal (Taxable Value)', inr(subtotal)],
        [`GST (${slab}%)`, inr(tax)],
        ['Grand Total (Rounded)', inr(grandTotal || Math.round(subtotal + tax))],
      ],
      columnStyles: { 0: { fontStyle: 'bold', textColor: [71, 85, 105] }, 1: { halign: 'right', fontStyle: 'bold' } },
      theme: 'grid',
    })

    startY = doc.lastAutoTable.finalY + 25
  }

  // Work Log & Planned Work
  if (product.planned_work?.length > 0) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text('PLANNED OPERATIONS', 40, startY)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    doc.text(product.planned_work.map(w => `• ${w}`).join('    '), 40, startY + 15)
  }

  doc.save(`${product.name.replace(/\s+/g, '_')}_Job_Sheet.pdf`)
}

// 2. Multi-Product Batch PDF (For entire PO Runs)
export async function exportBatchOrderPDF({ batch, brandName }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()

  // Header
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

  // Batch Overview
  const totalQty = batch.items.reduce((acc, p) => {
    return acc + (p.product_sizes || []).reduce((qAcc, s) => qAcc + (Number(s.quantity) || 0), 0)
  }, 0)

  const combinedGrandTotal = batch.items.reduce((acc, p) => {
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
  doc.text(`Total Styles: ${batch.items.length}    |    Total Volume: ${totalQty} pcs`, 55, 137)

  doc.setTextColor(234, 88, 12)
  doc.text(`Batch Total: ${inr(combinedGrandTotal)}`, pageWidth - 55, 130, { align: 'right' })

  // Items Table
  const tableRows = batch.items.map((it, idx) => {
    const qty = (it.product_sizes || []).reduce((qAcc, s) => qAcc + (Number(s.quantity) || 0), 0)
    const sizeSummary = (it.product_sizes || []).map(s => `${s.size_label}:${s.quantity}`).join(', ') || 'Free Size'
    const totalAmt = it.total_amount ? inr(it.total_amount) : (it.price_per_piece ? inr(it.price_per_piece * qty) : '-')

    return [
      idx + 1,
      `${it.name}\n${it.style_code ? `Style: ${it.style_code}` : ''}`,
      it.stage?.toUpperCase() || 'CUTTING',
      sizeSummary,
      `${qty} pcs`,
      it.price_per_piece ? inr(it.price_per_piece) : '-',
      totalAmt,
    ]
  })

  doc.autoTable({
    startY: 165,
    margin: { left: 40, right: 40 },
    head: [['#', 'Garment Style', 'Stage', 'Sizes Breakdown', 'Qty', 'Rate', 'Total']],
    body: tableRows,
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { fontStyle: 'bold' },
      4: { halign: 'center', fontStyle: 'bold' },
      6: { halign: 'right', fontStyle: 'bold', textColor: [234, 88, 12] },
    },
  })

  doc.save(`PO_${batch.po_number}_Batch_Sheet.pdf`)
}
