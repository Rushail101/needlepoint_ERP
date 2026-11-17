// billing.js — read-only link to the accounts app (same Supabase project).
// Billing data comes from two views created by the accounts app's
// sql/integration/001_link_operations.sql. If they don't exist yet, every
// function here returns empty results so this app keeps working on its own.
import { supabase } from './supabaseClient.js'

// Must match accounts_erp.ops_order_key() and the accounts app's opsLink.js.
export function orderKeyOf(product) {
  const po = (product?.po_number || '').trim()
  return po ? `PO:${product.brand_id || 'none'}|${po.toUpperCase()}` : `P:${product.id}`
}

export async function loadOrderBilling() {
  const { data, error } = await supabase.from('order_billing').select('*')
  if (error) return {}
  return Object.fromEntries((data || []).map(r => [r.ops_order_key, r]))
}

export async function loadOrderDocuments(key) {
  const { data, error } = await supabase.from('order_documents').select('*').eq('ops_order_key', key).order('doc_date')
  if (error) return []
  return data || []
}

// Billing status of one order for a badge. `orderValue` is the order's
// value incl. GST as this app computes it.
export function billingBadge(b, orderValue) {
  if (!b) return null
  const received = Number(b.received || 0)
  const invoiced = Number(b.invoiced || 0)
  const base = Math.max(invoiced, Number(orderValue || 0))
  if (invoiced > 0 && received >= base - 0.5) return { text: 'Paid', cls: 'bg-emerald-950/80 border-emerald-800/60 text-emerald-300' }
  if (invoiced > 0) return { text: `Due ₹${Math.round(base - received).toLocaleString('en-IN')}`, cls: 'bg-amber-950/80 border-amber-800/60 text-amber-300' }
  if (received > 0) return { text: `Advance ₹${Math.round(received).toLocaleString('en-IN')}`, cls: 'bg-blue-950/80 border-blue-800/60 text-blue-300' }
  if (b.has_proforma) return { text: 'Proforma sent', cls: 'bg-purple-950/80 border-purple-800/60 text-purple-300' }
  return null
}

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh',
  'Chhattisgarh', 'Dadra and Nagar Haveli', 'Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
]
const STATE_BY_CODE = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
  '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli', '27': 'Maharashtra', '29': 'Karnataka',
  '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
}
export const stateFromGSTIN = g => STATE_BY_CODE[(g || '').slice(0, 2)] || ''

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
export function isGSTINValid(gstin) {
  const g = (gstin || '').trim().toUpperCase()
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(g)) return false
  let factor = 2, sum = 0
  for (let i = 13; i >= 0; i--) {
    const code = CHARS.indexOf(g[i]) * factor
    factor = factor === 2 ? 1 : 2
    sum += Math.floor(code / 36) + (code % 36)
  }
  return CHARS[(36 - (sum % 36)) % 36] === g[14]
}
