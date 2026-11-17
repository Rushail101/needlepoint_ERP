// Proformas made from the operations app. The database builds them with the
// same rules as Accounts → Production Orders (HSN, GST split, numbering), so
// they are real accounts documents, and prints them in the accounts layout.
import { supabase } from './supabaseClient.js'
import { normRole } from './permissions.js'
import { printInvoice } from './accountsPdf.js'

const accounts = () => supabase.schema('accounts_erp')

export const canMakeProforma = user => ['admin', 'manager'].includes(normRole(user?.role))

function friendly(error) {
  const m = error?.message || String(error)
  if (/Could not find the function|PGRST202|schema must be one of|PGRST106/i.test(m)) {
    return 'The database needs the proforma update: run ADD_order_proformas.sql (or the latest INVOICE_ERP_COMPLETE.sql) in Supabase.'
  }
  return m
}

// Returns { id, number, total, existing, missing_rates }.
export async function createOrderProforma(orderKey) {
  const { data, error } = await accounts().rpc('create_order_proforma', { p_order_key: orderKey })
  if (error) throw new Error(friendly(error))
  return data
}

// Opens the same download / print dialog the accounts app shows.
export async function printOrderDocument(invoiceId) {
  const { data, error } = await accounts().rpc('order_document_print', { p_invoice: invoiceId })
  if (error) throw new Error(friendly(error))
  printInvoice(data.invoice, data.items || [], data.party || {}, data.business || {}, data.payments || [])
}

// Client parties from the accounts app (null when the link isn't set up).
export async function loadLinkedBrandIds() {
  const { data, error } = await supabase.from('billing_parties').select('brand_id')
  if (error) return null
  return new Set((data || []).map(p => p.brand_id).filter(Boolean))
}
