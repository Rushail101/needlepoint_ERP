// Proforma / invoice PDF — the SAME layout as the accounts app (copied from
// accounts_app/src/lib/pdf.js → printInvoice). If you change the invoice
// design there, copy the printInvoice function here too.
// Only difference: the UPI QR is drawn with the `qrcode` package this app
// already uses, instead of `qrcode-generator`.
import QRCode from 'qrcode'

const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

function numWords(n) {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const t = Math.floor(n); const p = Math.round((n - t) * 100);
  function hw(x) {
    if (x === 0) return '';
    if (x < 20) return a[x] + ' ';
    if (x < 100) return b[Math.floor(x / 10)] + ' ' + (x % 10 ? a[x % 10] + ' ' : '');
    if (x < 1000) return a[Math.floor(x / 100)] + ' Hundred ' + (x % 100 ? hw(x % 100) : '');
    if (x < 100000) return hw(Math.floor(x / 1000)) + 'Thousand ' + hw(x % 1000);
    if (x < 10000000) return hw(Math.floor(x / 100000)) + 'Lakh ' + hw(x % 100000);
    return hw(Math.floor(x / 10000000)) + 'Crore ' + hw(x % 10000000);
  }
  return 'Indian Rupee ' + (t ? hw(t).trim() : 'Zero') + (p ? ' and ' + hw(p).trim() + ' Paise Only' : ' Only');
}

function qrSvgDataUrl(text) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size, data = qr.modules.data
  let path = ''
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (data[r * n + c]) path += `M${c} ${r}h1v1h-1z`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

// Shared filename convention: doc number + client name, e.g. "PI-26-27/1012"
// for "Cayani" → "PI_26_27_1012_Cayani". Used both for the HTML download
// name and the print-to-PDF title (which browsers use as the suggested
// filename in the Save-as-PDF dialog).
function sanitizeForFilename(s) {
  return String(s || '').trim().replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '');
}
function docFileName(docNum, clientName) {
  const c = sanitizeForFilename(clientName);
  return `${sanitizeForFilename(docNum)}${c ? '_' + c : ''}`;
}

export function printInvoice(invoice, items, party, biz, invPayments, isCreditNote = false, documentType = 'invoice') {
  const calc = items.map(it => {
    const base = Number(it.quantity) * Number(it.unit_price);
    const discAmt = base * (Number(it.discount_percent || 0) / 100);
    // Use the taxable value that was actually saved with the line (it.taxable_amount).
    // For "GST already included" lines this is the rate backed out of the
    // gross price, not base - discAmt — falling back to base - discAmt only
    // covers old rows saved before that column existed.
    const taxable = it.taxable_amount != null ? Number(it.taxable_amount) : (base - discAmt);
    const cgst = Number(it.cgst_amount || 0);
    const sgst = Number(it.sgst_amount || 0);
    const igst = Number(it.igst_amount || 0);
    const tax = cgst + sgst + igst;
    return { ...it, base, discAmt, taxable, cgst, sgst, igst, tax, lineTotal: taxable + tax };
  });

  const subtotal = calc.reduce((s, i) => s + i.taxable, 0);
  const totalCGST = calc.reduce((s, i) => s + i.cgst, 0);
  const totalSGST = calc.reduce((s, i) => s + i.sgst, 0);
  const totalIGST = calc.reduce((s, i) => s + i.igst, 0);
  const totalTax = totalCGST + totalSGST + totalIGST;
  const preDiscGrand = subtotal + totalTax;
  const lineDiscTotal = calc.reduce((s, i) => s + i.discAmt, 0);
  const invLevelDisc = Number(invoice.discount_amount || 0);
  const invLevelDiscPct = Number(invoice.discount_percent || 0);
  const grandExact = preDiscGrand - invLevelDisc;
  // invoice.total is the authoritative payable amount (it's what was saved,
  // and may have round-off applied) — use it for the printed total, and
  // surface any gap from the exact figure as its own "Round Off" line.
  const grand = invoice.total != null ? Number(invoice.total) : grandExact;
  const roundOffAmt = grand - grandExact;
  const discTotal = lineDiscTotal; // line-item discounts (already baked into taxable)
  const totalPaid = (invPayments || []).reduce((s, p) => s + Number(p.amount), 0);
  const balance = grand - totalPaid;
  const isIntrastate = totalCGST > 0;
  const isPF = invoice.status === 'proforma';
  const isCN = isCreditNote;
  const isDN = documentType === 'debit_note';
  const isCommercialCN = isCN && invoice.note_type === 'commercial';
  const documentNumber = invoice.invoice_number || invoice.cn_number || invoice.dn_number || '';

  // GST groups for totals section
  const gstGroups = {};
  calc.forEach(it => {
    const r = Number(it.tax_percent || 0);
    if (r > 0) {
      if (!gstGroups[r]) gstGroups[r] = { cgst: 0, sgst: 0, igst: 0 };
      gstGroups[r].cgst += it.cgst;
      gstGroups[r].sgst += it.sgst;
      gstGroups[r].igst += it.igst;
    }
  });

  const upiData = biz.upi_id
    ? `upi://pay?pa=${encodeURIComponent(biz.upi_id)}&pn=${encodeURIComponent(biz.name || '')}&am=${grand.toFixed(2)}&cu=INR&tn=${encodeURIComponent(documentNumber)}`
    : null;
  // QR is generated locally (no UPI ID / amount is sent to a third-party service) and
  // embedded as an SVG data URI, so the downloaded invoice file is fully self-contained.
  let qrUrl = null;
  if (upiData) {
    try { qrUrl = qrSvgDataUrl(upiData); } catch (_) { qrUrl = null; }
  }

  const titleMap = { proforma: 'PROFORMA INVOICE', draft: 'TAX INVOICE', sent: 'TAX INVOICE', paid: 'TAX INVOICE', partially_paid: 'TAX INVOICE', overdue: 'TAX INVOICE', cancelled: 'TAX INVOICE' };
  const docTitle = isDN ? 'DEBIT NOTE' : (isCN ? (isCommercialCN ? 'COMMERCIAL CREDIT NOTE' : 'CREDIT NOTE') : (titleMap[invoice.status] || 'TAX INVOICE'));
  const fileName = docFileName(documentNumber, party?.name);

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${fileName}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#111;background:#fff;padding:20px}
.page{max-width:800px;margin:0 auto}
.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;border-bottom:2.5px solid #111;margin-bottom:12px}
.biz-name{font-size:22px;font-weight:800;margin-bottom:4px;letter-spacing:-.3px}
.biz-info{font-size:10px;color:#444;line-height:1.65}
.doc-title{text-align:right}
.doc-title h1{font-size:28px;font-weight:800;letter-spacing:1.5px;color:${isCN ? '#b00' : '#111'}}
.doc-title .sub{font-size:9.5px;color:#888;margin-top:2px}
.meta-grid{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #ccc;margin-bottom:10px}
.mc{padding:5px 9px;font-size:10px;border-right:1px solid #ccc;border-bottom:1px solid #ccc}
.mc:nth-child(3n){border-right:none}.mc:nth-last-child(-n+3){border-bottom:none}
.mc .lbl{color:#888;margin-bottom:1px;font-size:9px;text-transform:uppercase;letter-spacing:.04em}.mc .val{font-weight:700}
.party{display:grid;grid-template-columns:1fr 1fr;border:1px solid #ccc;margin-bottom:10px}
.pc{padding:8px 10px;font-size:10px}.pc:first-child{border-right:1px solid #ccc}
.pc h4{font-weight:700;margin-bottom:4px;padding-bottom:3px;border-bottom:1px solid #e0e0e0;font-size:9.5px;color:#555;text-transform:uppercase;letter-spacing:.05em}
.pc p{line-height:1.65}
table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:0}
thead th{background:#111;color:#fff;padding:6px 8px;text-align:left;font-weight:600;font-size:9.5px;letter-spacing:.04em}
thead th.r{text-align:right}
tbody td{padding:4.5px 8px;border-bottom:1px solid #eee;vertical-align:top}
tbody td.r{text-align:right}
tbody tr:nth-child(even) td{background:#fafafa}
.bottom{display:flex;border:1px solid #ccc;border-top:none}
.words-col{flex:1;padding:9px;border-right:1px solid #ccc;font-size:10px}
.words-col .lbl{color:#888;margin-bottom:2px;font-size:9px}.words-col .val{font-style:italic}
.words-col .partial-note{color:#b45309;margin-top:3px;font-weight:500;font-size:9.5px}
.tots-col{min-width:220px}
.tots-col table{font-size:10px}
.tots-col td{padding:3.5px 9px;border-bottom:1px solid #eee}
.tots-col td.r{text-align:right}
.tots-col .grand-row td{font-weight:700;font-size:12px;background:#111;color:#fff;border-bottom:none}
.tots-col .grand-row td.r{text-align:right}
.tots-col .bal-row td{font-weight:700;color:#b00;font-size:11px}
.gst-detail{display:flex;gap:12px;font-size:9.5px;color:#666;margin-top:3px;flex-wrap:wrap}
.gst-chip{padding:1px 5px;border-radius:3px;font-size:9px}
.gst-igst{background:#fff8e8;color:#7a4500;border:1px solid #e0c080}
.gst-cgst{background:#e8f0ff;color:#1a3a8a;border:1px solid #b0c8f0}
.gst-sgst{background:#e8fff8;color:#005a40;border:1px solid #80d0b8}
.footer{display:grid;grid-template-columns:1fr 1fr;border:1px solid #ccc;margin-top:10px}
.fc{padding:9px}.fc:first-child{border-right:1px solid #ccc}
.fc h4{font-size:9.5px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px}
.bd-row{display:flex;justify-content:space-between;font-size:9.5px;padding:2px 0;border-bottom:1px solid #f0f0f0}
.bd-row:last-child{border-bottom:none}
.bd-row span:first-child{color:#777}
.qr-wrap{text-align:center}
.note{margin-top:8px;padding:6px 9px;background:#f8f8f8;border:1px solid #e5e5e5;font-size:9.5px;color:#666;border-radius:3px}
.disc-amt{font-size:9px;color:#888;font-style:italic}
@media print{body{padding:0}.page{max-width:100%}button{display:none!important}}
</style></head><body><div class="page">

<div class="header">
  <div>
    ${biz.logo_url ? `<img src="${biz.logo_url}" style="height:40px;margin-bottom:5px;display:block">` : ''}
    <div class="biz-name">${biz.name || ''}</div>
    <div class="biz-info">
      ${(biz.address || '').replace(/\n/g, '<br>')}
      ${biz.gstin ? `<br><strong>GSTIN:</strong> ${biz.gstin}` : ''}
      ${biz.state ? ` &nbsp;|&nbsp; <strong>State:</strong> ${biz.state}` : ''}
      <br>${biz.phone || ''} &nbsp;|&nbsp; ${biz.email || ''}
    </div>
  </div>
  <div class="doc-title">
    <h1>${docTitle}</h1>
    ${isPF ? '<div class="sub">Not valid for GST input credit</div>' : ''}
    ${isDN ? '<div class="sub">Debit Note against original supply</div>' : (isCN ? `<div class="sub">${isCommercialCN ? 'No GST adjustment' : 'Credit Note'}</div>` : '')}
    ${isIntrastate ? '<div class="sub" style="color:#1a3a8a">Intra-state supply · CGST + SGST</div>' : '<div class="sub" style="color:#7a4500">Inter-state supply · IGST</div>'}
  </div>
</div>

<div class="meta-grid">
  <div class="mc"><div class="lbl">${isDN ? 'DN Number' : (isCN ? 'CN Number' : 'Invoice #')}</div><div class="val">${documentNumber}</div></div>
  <div class="mc"><div class="lbl">Date</div><div class="val">${fmtDate(invoice.issue_date || invoice.cn_date)}</div></div>
  <div class="mc"><div class="lbl">Place of Supply</div><div class="val">${party.state || ''}</div></div>
  ${!isCN && !isDN ? `<div class="mc"><div class="lbl">Due Date</div><div class="val">${fmtDate(invoice.due_date)}</div></div>` : ''}
  ${!isCN && !isDN ? `<div class="mc"><div class="lbl">Terms</div><div class="val">${invoice.notes || 'Due on Receipt'}</div></div>` : ''}
  <div class="mc"><div class="lbl">Status</div><div class="val">${(invoice.status || 'CREDIT NOTE').toUpperCase()}</div></div>
</div>

<div class="party">
  <div class="pc"><h4>Bill To</h4>
    <p><strong>${party.name || ''}</strong><br>
    ${(party.address || '').replace(/\n/g, '<br>')}
    ${party.phone ? `<br>${party.phone}` : ''}
    ${party.gstin ? `<br><strong>GSTIN:</strong> ${party.gstin}` : ''}</p>
  </div>
  <div class="pc"><h4>Ship To</h4>
    <p>${(invoice.ship_to_address || party.address || '').replace(/\n/g, '<br>')}
    ${party.phone ? `<br>${party.phone}` : ''}</p>
  </div>
</div>

<table>
  <thead><tr>
    <th style="width:24px">#</th>
    <th>Item & Description</th>
    <th>HSN</th>
    <th class="r">Qty</th>
    <th class="r">Rate</th>
    ${discTotal > 0 ? '<th class="r">Disc%</th>' : ''}
    <th class="r">Taxable</th>
    <th class="r">GST%</th>
    ${isIntrastate ? '<th class="r">CGST</th><th class="r">SGST</th>' : '<th class="r">IGST</th>'}
    <th class="r">Amount</th>
  </tr></thead>
  <tbody>
  ${calc.map((it, i) => `<tr>
    <td>${i + 1}</td>
    <td>${it.description || ''}</td>
    <td style="font-family:monospace;font-size:9px">${it.hsn_code || ''}</td>
    <td class="r">${Number(it.quantity).toFixed(2)}</td>
    <td class="r">${Number(it.unit_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
    ${discTotal > 0 ? `<td class="r"><span class="disc-amt">${it.discount_percent || 0}%</span></td>` : ''}
    <td class="r">${it.taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
    <td class="r">${it.tax_percent}%</td>
    ${isIntrastate
      ? `<td class="r">${it.cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td class="r">${it.sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>`
      : `<td class="r">${it.igst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>`}
    <td class="r"><strong>${it.lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
  </tr>`).join('')}
  </tbody>
</table>

<div class="bottom">
  <div class="words-col">
    <div class="lbl">Total In Words</div>
    <div class="val">${numWords(grand)}</div>
    ${totalPaid > 0 && totalPaid < grand - 0.01 ? `<div class="partial-note">Partial payment of ₹${totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })} received. Balance: ₹${balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>` : ''}
    <div class="gst-detail">
      ${isIntrastate
        ? `<span class="gst-chip gst-cgst">CGST: ₹${totalCGST.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span><span class="gst-chip gst-sgst">SGST: ₹${totalSGST.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>`
        : `<span class="gst-chip gst-igst">IGST: ₹${totalIGST.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>`}
    </div>
  </div>
  <div class="tots-col">
    <table>
      <tr><td>Subtotal (Taxable)</td><td class="r">${subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
      ${discTotal > 0 ? `<tr><td>Item Discounts</td><td class="r" style="color:#b00">-${discTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>` : ''}
      ${Object.entries(gstGroups).sort(([a], [b]) => Number(a) - Number(b)).map(([r, g]) =>
        isIntrastate
          ? `<tr><td>CGST @ ${Number(r) / 2}%</td><td class="r">${g.cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
             <tr><td>SGST @ ${Number(r) / 2}%</td><td class="r">${g.sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>`
          : `<tr><td>IGST @ ${r}%</td><td class="r">${g.igst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>`
      ).join('')}
      ${invLevelDisc > 0 ? `<tr><td>Discount${invLevelDiscPct > 0 ? ` (${invLevelDiscPct.toFixed(2)}%)` : ''}</td><td class="r" style="color:#b00">-${invLevelDisc.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>` : ''}
      ${Math.abs(roundOffAmt) > 0.004 ? `<tr><td>Round Off</td><td class="r">${roundOffAmt >= 0 ? '+' : '-'}${Math.abs(roundOffAmt).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>` : ''}
      <tr class="grand-row"><td><strong>Total</strong></td><td class="r"><strong>₹${grand.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td></tr>
      ${totalPaid > 0 ? `<tr><td>Paid</td><td class="r">-₹${totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>` : ''}
      <tr class="bal-row"><td>Balance Due</td><td class="r">₹${balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>
    </table>
  </div>
</div>

<div class="footer">
  <div class="fc">
    <h4>Bank Details</h4>
    ${biz.bank_account ? `<div class="bd-row"><span>Ac No.</span><span>${biz.bank_account}</span></div>` : ''}
    ${biz.ifsc_code ? `<div class="bd-row"><span>IFSC</span><span>${biz.ifsc_code}</span></div>` : ''}
    ${biz.bank_name ? `<div class="bd-row"><span>Bank</span><span>${biz.bank_name}</span></div>` : ''}
    ${biz.upi_id ? `<div class="bd-row"><span>UPI ID</span><span>${biz.upi_id}</span></div>` : ''}
    ${!biz.bank_account && !biz.upi_id ? `<p style="color:#bbb;font-size:9.5px">Add bank details in ⚙ Business Settings</p>` : ''}
  </div>
  <div class="fc qr-wrap">
    <h4>Scan to Pay (UPI)</h4>
    ${qrUrl ? `<img src="${qrUrl}" style="width:95px;height:95px;margin-top:3px"><div class="bd-row" style="justify-content:center;margin-top:3px;font-size:9px;color:#666">${biz.upi_id}</div>` : `<p style="color:#bbb;font-size:9.5px;margin-top:4px">Add UPI ID in Business Settings</p>`}
  </div>
</div>
<div class="note">This is a computer-generated document.${isDN ? ' This debit note increases the amount due against the linked original invoice.' : (isCN ? (isCommercialCN ? ' This commercial/goodwill credit note does not adjust GST liability.' : ' This credit note reduces the amount due on the linked invoice.') : ' It does not require a physical signature unless otherwise required by law or the recipient.' )}</div>
</div></body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const burl = URL.createObjectURL(blob);
  const docNum = documentNumber || 'doc';

  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;z-index:9999;font-family:sans-serif;backdrop-filter:blur(3px)';
  const bx = document.createElement('div');
  bx.style.cssText = 'background:#1a1a1a;border:1px solid #333;border-radius:14px;padding:28px 32px;text-align:center;color:#e8e6df;min-width:320px;box-shadow:0 8px 32px rgba(0,0,0,.6)';
  bx.innerHTML = `<div style="font-size:24px;margin-bottom:8px">${isDN ? '↗' : (isCN ? '🔄' : '📄')}</div>
    <div style="font-size:15px;font-weight:700;margin-bottom:3px">${docNum}</div>
    <div style="font-size:12px;color:#888;margin-bottom:20px">${docTitle} · ₹${grand.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <a href="${burl}" download="${fileName}.html" style="display:block;padding:10px 20px;background:#c8f064;color:#0d0d0d;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px">⬇ Download HTML → Print to PDF</a>
      <button id="pp" style="padding:10px 20px;background:transparent;color:#5ca0ff;border:1px solid #1a3a55;border-radius:8px;cursor:pointer;font-size:13px;width:100%">🖨 Print directly</button>
      <button id="pc" style="padding:7px;background:transparent;color:#555;border:none;cursor:pointer;font-size:12px">Close</button>
    </div>`;
  ov.appendChild(bx); document.body.appendChild(ov);
  bx.querySelector('#pc').onclick = () => { document.body.removeChild(ov); URL.revokeObjectURL(burl); };
  bx.querySelector('#pp').onclick = () => {
    const ifr = document.createElement('iframe');
    ifr.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:900px;height:700px;border:none';
    ifr.src = burl; document.body.appendChild(ifr);
    // Chrome's "Save as PDF" dialog suggests a filename from the TOP-LEVEL
    // document's title, not the iframe's — even though it's the iframe that
    // gets printed. Swap the app's title to the sanitized doc name for the
    // duration of the print dialog, then restore it once the iframe is torn
    // down (print() itself blocks until the dialog closes, so this is safe).
    const prevTitle = document.title;
    ifr.onload = () => {
      setTimeout(() => { document.title = fileName; ifr.contentWindow.print(); }, 600);
      setTimeout(() => { document.body.removeChild(ifr); URL.revokeObjectURL(burl); document.title = prevTitle; }, 5000);
    };
    document.body.removeChild(ov);
  };
}

