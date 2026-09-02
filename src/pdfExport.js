import { jsPDF } from 'jspdf'

// Fetches an image URL and returns it as a base64 data URL, so jsPDF can embed it.
async function toDataUrl(url) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function exportProductPDF({ product, sizes, photos, logs, samples, workTypeLabel }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 40
  let y = 50

  doc.setFontSize(20)
  doc.text(product.name, margin, y)
  y += 22

  doc.setFontSize(11)
  doc.setTextColor(100)
  const subtitle = [product.brands?.name, product.style_code].filter(Boolean).join(' · ')
  if (subtitle) { doc.text(subtitle, margin, y); y += 16 }
  doc.setTextColor(0)

  // Cover photo
  if (product.cover_photo_url) {
    const dataUrl = await toDataUrl(product.cover_photo_url)
    if (dataUrl) {
      doc.addImage(dataUrl, 'JPEG', margin, y, 160, 160)
      y += 175
    }
  }

  // Sizes table
  doc.setFontSize(14)
  doc.text('Sizes & Quantities', margin, y); y += 18
  doc.setFontSize(10)
  if (sizes.length === 0) {
    doc.text('No sizes recorded.', margin, y); y += 14
  } else {
    sizes.forEach(s => {
      doc.text(`${s.size_label}: ${s.quantity} pcs`, margin, y)
      y += 14
    })
  }
  const totalQty = sizes.reduce((sum, s) => sum + (s.quantity || 0), 0)
  doc.setFont(undefined, 'bold')
  doc.text(`Total: ${totalQty} pcs`, margin, y)
  doc.setFont(undefined, 'normal')
  y += 24

  // Sample versions
  if (samples.length > 0) {
    doc.setFontSize(14)
    doc.text('Sample Versions', margin, y); y += 18
    doc.setFontSize(10)
    for (const s of samples) {
      if (y > 720) { doc.addPage(); y = 50 }
      doc.setFont(undefined, 'bold')
      doc.text(`Version ${s.version_number} — ${s.status}`, margin, y)
      doc.setFont(undefined, 'normal')
      y += 14
      if (s.change_description) {
        const lines = doc.splitTextToSize(s.change_description, pageWidth - margin * 2)
        doc.text(lines, margin, y)
        y += lines.length * 12 + 4
      }
      y += 6
    }
    y += 10
  }

  // Work history
  if (logs.length > 0) {
    if (y > 650) { doc.addPage(); y = 50 }
    doc.setFontSize(14)
    doc.text('Work History', margin, y); y += 18
    doc.setFontSize(10)
    for (const l of logs) {
      if (y > 760) { doc.addPage(); y = 50 }
      const label = workTypeLabel[l.work_type] || l.work_type
      const who = l.employees?.name || 'Unassigned'
      const qty = l.quantity ? ` · ${l.quantity} pcs` : ''
      doc.text(`${new Date(l.logged_at).toLocaleDateString()} — ${label} — ${who}${qty}`, margin, y)
      y += 14
    }
  }

  doc.save(`${product.name.replace(/[^a-z0-9]+/gi, '_')}_summary.pdf`)
}

export async function exportEmployeePDF({ employee, range, rangeLabel, logs, totalPieces, totalEntries, byType, costPerPiece, workTypeLabel }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 40
  let y = 50

  doc.setFontSize(20)
  doc.text(employee.name, margin, y)
  y += 22

  doc.setFontSize(11)
  doc.setTextColor(100)
  if (employee.role) { doc.text(employee.role, margin, y); y += 16 }
  doc.setTextColor(0)
  y += 6

  doc.setFontSize(12)
  doc.text(`Summary — ${rangeLabel}`, margin, y); y += 20

  doc.setFontSize(10)
  doc.text(`Work entries: ${totalEntries}`, margin, y); y += 14
  doc.text(`Total pieces: ${totalPieces}`, margin, y); y += 14
  if (employee.monthly_salary) {
    doc.text(`Monthly salary: Rs. ${employee.monthly_salary}`, margin, y); y += 14
  }
  if (costPerPiece != null) {
    doc.setFont(undefined, 'bold')
    doc.text(`Cost per piece: Rs. ${costPerPiece.toFixed(2)}`, margin, y)
    doc.setFont(undefined, 'normal')
    y += 14
  }
  y += 10

  if (Object.keys(byType).length > 0) {
    doc.setFontSize(12)
    doc.text('By Work Type', margin, y); y += 18
    doc.setFontSize(10)
    Object.entries(byType).forEach(([type, count]) => {
      doc.text(`${workTypeLabel[type] || type}: ${count}`, margin, y)
      y += 14
    })
    y += 10
  }

  if (logs.length > 0) {
    if (y > 650) { doc.addPage(); y = 50 }
    doc.setFontSize(12)
    doc.text('Work Log', margin, y); y += 18
    doc.setFontSize(10)
    for (const l of logs) {
      if (y > 760) { doc.addPage(); y = 50 }
      const type = workTypeLabel[l.work_type] || l.work_type
      const qty = l.quantity ? ` · ${l.quantity} pcs` : ''
      doc.text(`${new Date(l.logged_at).toLocaleDateString()} — ${l.products?.name || 'Unknown garment'} — ${type}${qty}`, margin, y)
      y += 14
    }
  }

  doc.save(`${employee.name.replace(/[^a-z0-9]+/gi, '_')}_${range}_summary.pdf`)
}
