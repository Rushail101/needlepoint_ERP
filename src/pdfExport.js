// Helpers
function sanitizeForFilename(s) {
  return String(s || '').trim().replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '');
}

function r(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fd(d) {
  return d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

function showPrintModal({ title, subtitle, icon, html, fileName }) {
  const blob = new Blob([html], { type: 'text/html' });
  const burl = URL.createObjectURL(blob);

  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;z-index:9999;font-family:sans-serif;backdrop-filter:blur(3px)';
  const bx = document.createElement('div');
  bx.style.cssText = 'background:#1a1a1a;border:1px solid #333;border-radius:14px;padding:28px 32px;text-align:center;color:#e8e6df;min-width:320px;box-shadow:0 8px 32px rgba(0,0,0,.6)';
  bx.innerHTML = `
    <div style="font-size:26px;margin-bottom:8px">${icon || '📄'}</div>
    <div style="font-size:15px;font-weight:700;margin-bottom:3px">${title}</div>
    <div style="font-size:12px;color:#888;margin-bottom:20px">${subtitle}</div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <button id="pp" style="padding:11px 20px;background:#ea580c;color:#fff;border:none;font-weight:700;border-radius:8px;cursor:pointer;font-size:13px;width:100%">🖨 Print / Save as PDF</button>
      <a href="${burl}" download="${fileName}.html" style="display:block;padding:9px 20px;background:transparent;color:#bbb;border:1px solid #333;border-radius:8px;text-decoration:none;font-size:12px">⬇ Download HTML File</a>
      <button id="pc" style="padding:7px;background:transparent;color:#666;border:none;cursor:pointer;font-size:12px">Close</button>
    </div>`;
  ov.appendChild(bx);
  document.body.appendChild(ov);

  bx.querySelector('#pc').onclick = () => {
    document.body.removeChild(ov);
    URL.revokeObjectURL(burl);
  };

  bx.querySelector('#pp').onclick = () => {
    const ifr = document.createElement('iframe');
    ifr.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:900px;height:700px;border:none';
    ifr.src = burl;
    document.body.appendChild(ifr);

    const prevTitle = document.title;
    ifr.onload = () => {
      setTimeout(() => {
        document.title = fileName;
        ifr.contentWindow.print();
      }, 500);
      setTimeout(() => {
        document.body.removeChild(ifr);
        URL.revokeObjectURL(burl);
        document.title = prevTitle;
      }, 5000);
    };
    document.body.removeChild(ov);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Single Product Job Card / Production Sheet
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 1. Single Product Job Card / Production Sheet
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// 1. Single Product Floor Job Sheet (2x Scale, Zero Financials)
// ─────────────────────────────────────────────────────────────────────────────
export async function exportProductPDF({ product, sizes }) {
  const brandName = product.brands?.name || 'Independent';
  const totalQty = (sizes || []).reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
  const docId = product.po_number || `JOB-${product.id.slice(0, 8).toUpperCase()}`;
  const fileName = `JOB_${sanitizeForFilename(docId)}_${sanitizeForFilename(product.name)}`;

  // Mobile logging URL & higher resolution 2x QR code
  const logUrl = `${window.location.origin}/products/${product.id}`;
  const qrCodeImg = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(logUrl)}`;

  const sizeRows = (sizes || []).map((s, i) => `
    <tr>
      <td style="text-align:center">${i + 1}</td>
      <td style="font-weight:700">${s.size_label}</td>
      <td style="text-align:right;font-weight:900;color:#0f172a">${s.quantity} pcs</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${fileName}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:20px;color:#111;background:#fff;padding:32px}
.page{max-width:980px;margin:0 auto}

/* Header */
.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:5px solid #ea580c;margin-bottom:24px}
.biz-name{font-size:42px;font-weight:900;letter-spacing:-1px;color:#0f172a;line-height:1}
.biz-sub{font-size:18px;text-transform:uppercase;color:#ea580c;font-weight:800;letter-spacing:1.5px;margin-top:6px}
.doc-right{text-align:right}
.doc-right h1{font-size:36px;font-weight:900;color:#0f172a;letter-spacing:0.5px;line-height:1.1}
.doc-right .meta-val{font-size:24px;font-weight:800;color:#ea580c;margin-top:6px;font-family:monospace}

/* Meta Grid */
.meta-grid{display:grid;grid-template-columns:repeat(4,1fr);border:2px solid #cbd5e1;background:#f8fafc;margin-bottom:24px;border-radius:12px;overflow:hidden}
.mc{padding:14px 18px;border-right:2px solid #cbd5e1}
.mc:last-child{border-right:none}
.mc .lbl{font-size:15px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;font-weight:700}
.mc .val{font-size:22px;font-weight:900;color:#0f172a}

/* Garment & 2X Photo & 2X QR */
.garment-box{display:flex;align-items:center;gap:28px;border:2px solid #cbd5e1;padding:24px;border-radius:12px;margin-bottom:24px;background:#fff}
.img-container{width:220px;height:240px;border-radius:12px;overflow:hidden;border:2px solid #cbd5e1;background:#f8fafc;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.garment-img{max-width:100%;max-height:100%;object-fit:contain}
.garment-info{flex:1;min-width:0}
.garment-info h2{font-size:32px;font-weight:900;color:#0f172a;margin-bottom:8px;line-height:1.2}
.garment-info p{font-size:20px;color:#334155;line-height:1.6}
.chips{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
.chip{padding:6px 14px;border-radius:8px;font-size:16px;font-weight:800;background:#f1f5f9;color:#334155;border:2px solid #cbd5e1}
.chip-orange{background:#fff7ed;color:#c2410c;border-color:#fdba74}

/* QR Code Section (2x) */
.qr-box{text-align:center;padding-left:24px;border-left:2px dashed #cbd5e1;flex-shrink:0}
.qr-box img{width:160px;height:160px;display:block;margin:0 auto 8px auto;border-radius:6px}
.qr-lbl{font-size:15px;font-weight:900;color:#0f172a;text-transform:uppercase;letter-spacing:0.05em}
.qr-sub{font-size:13px;color:#64748b;font-weight:600}

/* Sizes Table */
table{width:100%;border-collapse:collapse;margin-bottom:24px;border:2px solid #cbd5e1;border-radius:12px;overflow:hidden}
thead th{background:#0f172a;color:#fff;padding:14px 18px;text-align:left;font-size:18px;letter-spacing:.05em;text-transform:uppercase}
tbody td{padding:14px 18px;border-bottom:2px solid #e2e8f0;font-size:20px}
tbody tr:nth-child(even){background:#f8fafc}
tfoot td{padding:16px 18px;font-size:22px;font-weight:900;background:#f1f5f9;border-top:3px solid #0f172a}

/* Floor Instructions */
.floor-note{border:2px solid #cbd5e1;background:#f8fafc;border-radius:12px;padding:16px 20px}
.floor-note h4{font-size:16px;text-transform:uppercase;color:#64748b;font-weight:800;margin-bottom:6px}
.floor-note p{font-size:17px;color:#334155;line-height:1.5}

@media print{
  body{padding:0}
  .page{max-width:100%}
  @page { margin: 12mm; }
}
</style></head><body><div class="page">

<div class="header">
  <div>
    <div class="biz-name">NEEDLE POINT</div>
    <div class="biz-sub">Apparel Manufacturing & Operations</div>
  </div>
  <div class="doc-right">
    <h1>FLOOR JOB SHEET</h1>
    <div class="meta-val">${docId}</div>
  </div>
</div>

<div class="meta-grid">
  <div class="mc"><div class="lbl">Brand</div><div class="val">${brandName}</div></div>
  <div class="mc"><div class="lbl">Date</div><div class="val">${fd(new Date())}</div></div>
  <div class="mc"><div class="lbl">Current Stage</div><div class="val">${(product.stage || 'CUTTING').toUpperCase()}</div></div>
  <div class="mc"><div class="lbl">Total Quantity</div><div class="val" style="color:#ea580c">${totalQty} pcs</div></div>
</div>

<div class="garment-box">
  ${product.cover_photo_url ? `
    <div class="img-container">
      <img src="${product.cover_photo_url}" class="garment-img" />
    </div>
  ` : ''}

  <div class="garment-info">
    <h2>${product.name}</h2>
    <p>Style Code: <strong>${product.style_code || 'N/A'}</strong></p>
    <p>Status: <strong>${(product.status || 'In Production').toUpperCase()}</strong></p>
    <div class="chips">
      <span class="chip chip-orange">${totalQty} Total Pieces</span>
      ${product.planned_work && product.planned_work.length > 0 ? product.planned_work.map(w => `<span class="chip">${w}</span>`).join('') : ''}
    </div>
  </div>

  <div class="qr-box">
    <img src="${qrCodeImg}" alt="Log QR" />
    <div class="qr-lbl">Scan to Log</div>
    <div class="qr-sub">Update Stage & Tailor Work</div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th style="width:60px;text-align:center">#</th>
      <th>Size Label</th>
      <th style="text-align:right">Planned Quantity</th>
    </tr>
  </thead>
  <tbody>
    ${sizeRows || '<tr><td colspan="3" style="text-align:center;color:#64748b">No sizes assigned</td></tr>'}
  </tbody>
  <tfoot>
    <tr>
      <td colspan="2">TOTAL RUN VOLUME</td>
      <td style="text-align:right;color:#ea580c">${totalQty} pcs</td>
    </tr>
  </tfoot>
</table>

<div class="floor-note">
  <h4>Floor Supervisor Instructions</h4>
  <p>Attach this sheet directly to the cutting lot bundle. Scan the QR code with any mobile device to record completed operations, assign tailors, or advance to stitching/finishing.</p>
</div>

</div></body></html>`;

  showPrintModal({
    title: product.name,
    subtitle: `Floor Job Sheet · ${totalQty} pcs`,
    icon: '🏷️',
    html,
    fileName,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Multi-Product Batch Run PDF (Consolidated PO Sheet)
// ─────────────────────────────────────────────────────────────────────────────
export async function exportBatchOrderPDF({ batch, brandName }) {
  const brand = brandName || batch.brands?.name || 'Independent';
  const totalQty = (batch.items || []).reduce((acc, p) => {
    return acc + (p.product_sizes || []).reduce((qAcc, s) => qAcc + (Number(s.quantity) || 0), 0);
  }, 0);

  const grandTotal = (batch.items || []).reduce((acc, p) => {
    if (p.total_amount != null) return acc + Number(p.total_amount);
    const pQty = (p.product_sizes || []).reduce((qAcc, s) => qAcc + (Number(s.quantity) || 0), 0);
    const pSub = p.price_per_piece ? Number(p.price_per_piece) * pQty : 0;
    return acc + (pSub > 0 ? Math.round(pSub + (pSub * (p.gst_rate ?? 5)) / 100) : 0);
  }, 0);

  const fileName = `BATCH_${sanitizeForFilename(batch.po_number)}_${sanitizeForFilename(brand)}`;

  const itemRows = (batch.items || []).map((it, idx) => {
    const qty = (it.product_sizes || []).reduce((qAcc, s) => qAcc + (Number(s.quantity) || 0), 0);
    const sizes = (it.product_sizes || []).map(s => `${s.size_label}:${s.quantity}`).join(', ') || 'Free';
    const totalAmt = it.total_amount ? r(it.total_amount) : (it.price_per_piece ? r(it.price_per_piece * qty) : '—');

    return `
      <tr>
        <td style="text-align:center">${idx + 1}</td>
        <td>
          <div style="font-weight:700;color:#0f172a">${it.name}</div>
          ${it.style_code ? `<div style="font-size:9.5px;color:#64748b">Style: ${it.style_code}</div>` : ''}
        </td>
        <td><span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700;background:#f1f5f9;color:#334155">${(it.stage || 'CUTTING').toUpperCase()}</span></td>
        <td style="font-size:10px;color:#475569">${sizes}</td>
        <td style="text-align:right;font-weight:700">${qty} pcs</td>
        <td style="text-align:right">${it.price_per_piece ? r(it.price_per_piece) : '—'}</td>
        <td style="text-align:right;font-weight:700;color:#ea580c">${totalAmt}</td>
      </tr>
    `;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${fileName}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#111;background:#fff;padding:24px}
.page{max-width:850px;margin:0 auto}
.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;border-bottom:2.5px solid #ea580c;margin-bottom:14px}
.biz-name{font-size:24px;font-weight:900;color:#0f172a;letter-spacing:-.5px}
.biz-sub{font-size:10px;text-transform:uppercase;color:#ea580c;font-weight:700;letter-spacing:1px}
.doc-right{text-align:right}
.doc-right h1{font-size:22px;font-weight:800;color:#0f172a;letter-spacing:0.5px}
.doc-right .meta-val{font-size:13px;font-weight:700;color:#ea580c;margin-top:2px}
.meta-grid{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #cbd5e1;background:#f8fafc;margin-bottom:14px;border-radius:6px;overflow:hidden}
.mc{padding:8px 10px;border-right:1px solid #cbd5e1}
.mc:last-child{border-right:none}
.mc .lbl{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px}
.mc .val{font-size:11px;font-weight:700;color:#0f172a}
table{width:100%;border-collapse:collapse;margin-bottom:14px;border:1px solid #cbd5e1;border-radius:6px;overflow:hidden}
thead th{background:#0f172a;color:#fff;padding:8px 10px;text-align:left;font-size:10px;letter-spacing:.04em;text-transform:uppercase}
thead th.r{text-align:right}
tbody td{padding:6.5px 10px;border-bottom:1px solid #e2e8f0;font-size:10.5px}
tbody tr:nth-child(even){background:#f8fafc}
.totals-wrap{display:flex;justify-content:flex-end;margin-top:8px}
.amounts-col{min-width:260px;border:1px solid #cbd5e1;border-radius:6px;overflow:hidden;background:#fff}
.amounts-col table{border:none;margin:0}
.amounts-col td{padding:6px 12px;border-bottom:1px solid #f1f5f9}
.amounts-col .r{text-align:right}
.amounts-col .grand-row td{font-weight:800;font-size:13px;background:#0f172a;color:#fff;border-bottom:none}
@media print{body{padding:0}.page{max-width:100%}}
</style></head><body><div class="page">

<div class="header">
  <div>
    <div class="biz-name">NEEDLE POINT</div>
    <div class="biz-sub">Apparel Manufacturing & Operations</div>
  </div>
  <div class="doc-right">
    <h1>BATCH PRODUCTION RUN</h1>
    <div class="meta-val">PO: ${batch.po_number}</div>
  </div>
</div>

<div class="meta-grid">
  <div class="mc"><div class="lbl">Client / Brand</div><div class="val">${brand}</div></div>
  <div class="mc"><div class="lbl">Date</div><div class="val">${fd(new Date())}</div></div>
  <div class="mc"><div class="lbl">Total Styles</div><div class="val">${batch.items?.length || 0} Garments</div></div>
  <div class="mc"><div class="lbl">Total Pieces</div><div class="val">${totalQty} pcs</div></div>
</div>

<table>
  <thead>
    <tr>
      <th style="width:30px;text-align:center">#</th>
      <th>Garment Style</th>
      <th>Stage</th>
      <th>Size Breakdown</th>
      <th class="r">Quantity</th>
      <th class="r">Rate</th>
      <th class="r">Total</th>
    </tr>
  </thead>
  <tbody>
    ${itemRows}
  </tbody>
</table>

<div class="totals-wrap">
  <div class="amounts-col">
    <table>
      <tr><td>Total Garments</td><td class="r">${batch.items?.length || 0} styles</td></tr>
      <tr><td>Total Units</td><td class="r">${totalQty} pcs</td></tr>
      <tr class="grand-row"><td>Batch Grand Total</td><td class="r">${r(grandTotal)}</td></tr>
    </table>
  </div>
</div>

</div></body></html>`;

  showPrintModal({
    title: `Batch: ${batch.po_number}`,
    subtitle: `${batch.items?.length || 0} Styles · ${totalQty} pcs · ${r(grandTotal)}`,
    icon: '📦',
    html,
    fileName,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Employee Work & Payout Summary PDF
// ─────────────────────────────────────────────────────────────────────────────
export async function exportEmployeePDF({ employee, logs, dateRange, totalPieces, totalEarnings, WORK_TYPE_LABEL }) {
  const empName = employee?.name || 'Employee';
  const role = employee?.role ? employee.role.toUpperCase() : 'TAILOR / WORKER';
  const rangeText = dateRange?.from && dateRange?.to
    ? `${fd(dateRange.from)} - ${fd(dateRange.to)}`
    : `All Time (as of ${fd(new Date())})`;

  const fileName = `PAYOUT_${sanitizeForFilename(empName)}_${sanitizeForFilename(new Date().toISOString().slice(0, 10))}`;

  const logRows = (logs || []).map((l, idx) => {
    const wt = WORK_TYPE_LABEL?.[l.work_type] || l.work_type || 'General Work';
    const garment = l.products?.name || 'Garment Lot';
    const rate = l.rate_per_piece ? r(l.rate_per_piece) : '—';
    const lineTotal = l.total_amount ? r(l.total_amount) : (l.rate_per_piece && l.pieces ? r(l.rate_per_piece * l.pieces) : '—');

    return `
      <tr>
        <td style="text-align:center">${idx + 1}</td>
        <td>${fd(l.created_at)}</td>
        <td style="font-weight:700;color:#0f172a">${garment}</td>
        <td><span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700;background:#f1f5f9;color:#334155">${wt}</span></td>
        <td style="text-align:right;font-weight:700">${l.pieces || 0} pcs</td>
        <td style="text-align:right">${rate}</td>
        <td style="text-align:right;font-weight:700;color:#ea580c">${lineTotal}</td>
      </tr>
    `;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${fileName}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#111;background:#fff;padding:24px}
.page{max-width:850px;margin:0 auto}
.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;border-bottom:2.5px solid #ea580c;margin-bottom:14px}
.biz-name{font-size:24px;font-weight:900;color:#0f172a;letter-spacing:-.5px}
.biz-sub{font-size:10px;text-transform:uppercase;color:#ea580c;font-weight:700;letter-spacing:1px}
.doc-right{text-align:right}
.doc-right h1{font-size:22px;font-weight:800;color:#0f172a;letter-spacing:0.5px}
.doc-right .meta-val{font-size:12px;font-weight:700;color:#475569;margin-top:2px}
.meta-grid{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #cbd5e1;background:#f8fafc;margin-bottom:14px;border-radius:6px;overflow:hidden}
.mc{padding:8px 10px;border-right:1px solid #cbd5e1}
.mc:last-child{border-right:none}
.mc .lbl{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px}
.mc .val{font-size:11px;font-weight:700;color:#0f172a}
table{width:100%;border-collapse:collapse;margin-bottom:14px;border:1px solid #cbd5e1;border-radius:6px;overflow:hidden}
thead th{background:#0f172a;color:#fff;padding:8px 10px;text-align:left;font-size:10px;letter-spacing:.04em;text-transform:uppercase}
thead th.r{text-align:right}
tbody td{padding:6.5px 10px;border-bottom:1px solid #e2e8f0;font-size:10.5px}
tbody tr:nth-child(even){background:#f8fafc}
.totals-wrap{display:flex;justify-content:flex-end;margin-top:8px}
.amounts-col{min-width:260px;border:1px solid #cbd5e1;border-radius:6px;overflow:hidden;background:#fff}
.amounts-col table{border:none;margin:0}
.amounts-col td{padding:6px 12px;border-bottom:1px solid #f1f5f9}
.amounts-col .r{text-align:right}
.amounts-col .grand-row td{font-weight:800;font-size:13px;background:#0f172a;color:#fff;border-bottom:none}
@media print{body{padding:0}.page{max-width:100%}}
</style></head><body><div class="page">

<div class="header">
  <div>
    <div class="biz-name">NEEDLE POINT</div>
    <div class="biz-sub">Apparel Manufacturing & Operations</div>
  </div>
  <div class="doc-right">
    <h1>WORK LOG & PAYOUT SHEET</h1>
    <div class="meta-val">${empName}</div>
  </div>
</div>

<div class="meta-grid">
  <div class="mc"><div class="lbl">Employee / Tailor</div><div class="val">${empName}</div></div>
  <div class="mc"><div class="lbl">Role</div><div class="val">${role}</div></div>
  <div class="mc"><div class="lbl">Period</div><div class="val">${rangeText}</div></div>
  <div class="mc"><div class="lbl">Total Completed</div><div class="val">${totalPieces || 0} pcs</div></div>
</div>

<table>
  <thead>
    <tr>
      <th style="width:30px;text-align:center">#</th>
      <th>Date</th>
      <th>Garment Style</th>
      <th>Operation</th>
      <th class="r">Pieces</th>
      <th class="r">Rate / Pc</th>
      <th class="r">Amount</th>
    </tr>
  </thead>
  <tbody>
    ${logRows || '<tr><td colspan="7" style="text-align:center;color:#64748b">No logged work entries found</td></tr>'}
  </tbody>
</table>

<div class="totals-wrap">
  <div class="amounts-col">
    <table>
      <tr><td>Logged Entries</td><td class="r">${(logs || []).length} logs</td></tr>
      <tr><td>Total Stitched / Cut</td><td class="r">${totalPieces || 0} pcs</td></tr>
      <tr class="grand-row"><td>Total Payable</td><td class="r">${r(totalEarnings)}</td></tr>
    </table>
  </div>
</div>

</div></body></html>`;

  showPrintModal({
    title: `Payout: ${empName}`,
    subtitle: `${totalPieces || 0} pcs · ${r(totalEarnings)}`,
    icon: '👤',
    html,
    fileName,
  });
}
