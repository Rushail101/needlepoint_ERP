// An order's accounts documents (proformas, invoices, challans) with a PDF
// button, plus "Make proforma" when the order has none yet.
import { useState } from 'react'
import { toast } from './Toast.jsx'
import { createOrderProforma, printOrderDocument } from '../proforma.js'

const inr = n => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const day = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : ''

export default function OrderDocs({ orderKey, docs, canMake, onChanged, title = 'Billing (from accounts)' }) {
  const [busy, setBusy] = useState(null)
  const live = docs.filter(d => d.kind === 'invoice' && d.status !== 'cancelled')

  const make = async () => {
    setBusy('make')
    try {
      const pf = await createOrderProforma(orderKey)
      toast(pf.existing ? `This order already has proforma ${pf.number}` : `Proforma ${pf.number} made: ${inr(pf.total)}${pf.missing_rates ? '. Some garments had no rate, so check it in Accounts' : ''}`, pf.existing ? 'info' : 'success', 6000)
      await onChanged?.()
      await printOrderDocument(pf.id)
    } catch (e) { toast(e.message, 'error', 8000) }
    setBusy(null)
  }
  const print = async (id) => {
    setBusy(id)
    try { await printOrderDocument(id) } catch (e) { toast(e.message, 'error', 8000) }
    setBusy(null)
  }

  if (!docs.length && !canMake) return null
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-xl p-3 mb-4">
      <div className="flex items-center justify-between mb-2 gap-2">
        <p className="text-xs uppercase font-bold text-gray-300 tracking-wider">{title}</p>
        {canMake && live.length === 0 && (
          <button onClick={make} disabled={!!busy}
            className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-3 py-1.5 text-[11px] font-bold disabled:opacity-50">
            {busy === 'make' ? 'Making…' : '📋 Make proforma'}
          </button>
        )}
      </div>
      {docs.length === 0 && <p className="text-[11px] text-gray-500">No proforma or invoice yet. "Make proforma" fills in HSN and GST and uses the next PI number, same as Accounts.</p>}
      {docs.map(d => (
        <div key={d.id} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-gray-800 last:border-0">
          <span className="text-gray-300 min-w-0">
            <span className="font-mono text-brand-400">{d.number}</span>{' '}
            <span className="text-gray-500">{d.kind === 'challan' ? 'challan' : d.status === 'proforma' ? 'proforma' : d.status === 'cancelled' ? 'cancelled' : 'invoice'} · {day(d.doc_date)}</span>
          </span>
          <span className="flex items-center gap-2 shrink-0">
            <span className="text-gray-200 font-semibold">
              {inr(d.total)}{Number(d.paid) > 0 && <span className="text-emerald-400"> · paid {inr(d.paid)}</span>}
            </span>
            {d.kind === 'invoice' && (
              <button onClick={() => print(d.id)} disabled={!!busy} title="Download / print, in the same format as Accounts"
                className="bg-gray-800 border border-gray-700 hover:border-gray-500 text-gray-200 rounded-lg px-2 py-1 text-[11px] font-semibold disabled:opacity-50">
                {busy === d.id ? '…' : '🖨 PDF'}
              </button>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}
