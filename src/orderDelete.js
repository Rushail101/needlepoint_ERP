// Deleting an order (or some garments of it). The database checks Accounts
// first: an invoiced/challaned order or a proforma with an advance is refused;
// a plain proforma is marked cancelled (number kept) after you confirm.
import { supabase } from './supabaseClient.js'
import { normRole } from './permissions.js'
import { sendTelegramMessage } from './telegram.js'

export const canDeleteOrders = user => normRole(user?.role) === 'admin'

// products: [{ id, name, po_number, style_code }], brandName for the alert.
// Returns the result, or null if you backed out.
export async function deleteOrder(products, { brandName = '', whole = true } = {}) {
  const ids = products.map(p => p.id)
  const what = products.length === 1 ? `"${products[0].name}"` : `this order (${products.length} garments)`
  if (!confirm(`Delete ${what}?\n\nThis removes ${products.length === 1 ? 'its' : 'their'} sizes, photos, work logs, dispatches and samples. It can't be undone.`)) return null

  let { data, error } = await supabase.rpc('ops_delete_order', { p_product_ids: ids, p_cancel_proformas: false })
  if (error) throw new Error(friendly(error))
  if (data?.needs_confirm) {
    const list = data.proformas.join(', ')
    if (!confirm(`This order has proforma ${list} in Accounts.\n\nDelete the order and mark the proforma cancelled? Its number is kept, the same as Cancel in Accounts.`)) return null
    ;({ data, error } = await supabase.rpc('ops_delete_order', { p_product_ids: ids, p_cancel_proformas: true }))
    if (error) throw new Error(friendly(error))
  }

  const po = products.find(p => p.po_number)?.po_number
  sendTelegramMessage([
    `🗑️ <b>${whole && products.length > 1 ? 'ORDER' : 'GARMENT'} DELETED</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `<b>Brand:</b> ${brandName || '—'}`,
    `<b>PO Number:</b> ${po || 'N/A'}`,
    ...products.map(p => `• ${p.name}${p.style_code ? ` (${p.style_code})` : ''}`),
    ...(data?.cancelled?.length ? [`<b>Proforma cancelled:</b> ${data.cancelled.join(', ')}`] : []),
  ].join('\n'))
  return data
}

function friendly(error) {
  const m = error?.message || String(error)
  if (/Could not find the function|PGRST202/i.test(m)) return 'The database needs the latest update: run UPDATE_orders.sql (or the latest INVOICE_ERP_COMPLETE.sql) in Supabase.'
  return m.replace(/^ERROR:\s*/, '')
}
