import { useEffect, useState } from 'react'
import { supabase, must, getSettings, saveSetting } from '../supabaseClient.js'
import { inputClass, labelClass } from '../components/Modal.jsx'
import { toast } from '../components/Toast.jsx'
import { WORK_TYPES } from '../workTypes.js'
import { sendTelegramMessage } from '../telegram.js'
import { inr } from '../production.js'
import ImportOldProject from '../components/ImportOldProject.jsx'

// Admin-only: pricing defaults, piece rates, admin PIN, Telegram test.
export default function Settings() {
  const [s, setS] = useState(null)
  const [rates, setRates] = useState([])
  const [edits, setEdits] = useState({})
  const [newPin, setNewPin] = useState('')
  const [busy, setBusy] = useState('')

  const load = async () => {
    setS(await getSettings(true))
    const { data, error } = await supabase.from('piece_rates').select('*').is('product_id', null)
    if (error) toast('Run migration_008 to enable piece rates and settings.', 'warn')
    setRates(data || [])
  }
  useEffect(() => { load() }, [])
  if (!s) return <p className="text-gray-500 text-center py-10">Loading…</p>

  const saveGeneral = async (e) => {
    e.preventDefault(); setBusy('general')
    try {
      for (const k of ['sample_fee', 'sample_gst', 'default_lead_days']) await saveSetting(k, Number(s[k]) || 0)
      toast('Settings saved', 'success')
    } catch (err) { toast(err.message, 'error') } finally { setBusy('') }
  }

  const saveRates = async () => {
    setBusy('rates')
    try {
      for (const [wt, v] of Object.entries(edits)) {
        const existing = rates.find(r => r.work_type === wt)
        if (v === '' || v == null) { if (existing) must(await supabase.from('piece_rates').delete().eq('id', existing.id), 'Removing rate') }
        else if (existing) must(await supabase.from('piece_rates').update({ rate: Number(v) }).eq('id', existing.id), 'Saving rate')
        else must(await supabase.from('piece_rates').insert({ work_type: wt, rate: Number(v), product_id: null }), 'Saving rate')
      }
      setEdits({}); toast('Piece rates saved', 'success'); load()
    } catch (err) { toast(err.message, 'error') } finally { setBusy('') }
  }

  const changePin = async (e) => {
    e.preventDefault()
    if (newPin.trim().length < 4) { toast('Use at least 4 digits', 'warn'); return }
    if (!confirm('Change the admin PIN? Use the new one next time you sign in.')) return
    setBusy('pin')
    try {
      const { error } = await supabase.rpc('ops_set_admin_pin', { p_new: newPin.trim() })
      if (error) throw error
      setNewPin(''); toast('Admin PIN changed', 'success')
    } catch (err) { toast(err.message, 'error') } finally { setBusy('') }
  }

  const card = 'bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-5'
  const rateVal = wt => edits[wt] ?? rates.find(r => r.work_type === wt)?.rate ?? ''

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-xl font-bold text-gray-100">Settings</h2>

      <ImportOldProject />

      <form onSubmit={saveGeneral} className={card}>
        <p className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-3">Orders</p>
        <div className="grid grid-cols-3 gap-2">
          <div><label className={labelClass}>Sample fee (₹)</label><input type="number" value={s.sample_fee} onChange={e => setS({ ...s, sample_fee: e.target.value })} className={inputClass} /></div>
          <div><label className={labelClass}>Sample GST %</label><input type="number" value={s.sample_gst} onChange={e => setS({ ...s, sample_gst: e.target.value })} className={inputClass} /></div>
          <div><label className={labelClass}>Default lead days</label><input type="number" value={s.default_lead_days} onChange={e => setS({ ...s, default_lead_days: e.target.value })} className={inputClass} /></div>
        </div>
        <p className="text-[11px] text-gray-500 mb-3">A sample order is billed {inr(s.sample_fee)} + {s.sample_gst}% GST = {inr(Number(s.sample_fee) * (1 + Number(s.sample_gst) / 100))}. New orders get a delivery date {s.default_lead_days} days out (you can change it per order).</p>
        <button disabled={busy === 'general'} className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-50">Save</button>
      </form>

      <div className={card}>
        <p className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-1">Piece rates</p>
        <p className="text-[11px] text-gray-500 mb-3">₹ per piece for staff paid per piece. Their pay = pieces logged × these rates (shown on their Team page and used by Payroll in Accounts). Leave blank if you don't pay per piece for that work.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
          {WORK_TYPES.filter(w => !['other', 'sample_change'].includes(w.key)).map(w => (
            <div key={w.key}>
              <label className={labelClass}>{w.icon} {w.label}</label>
              <input type="number" step="0.01" inputMode="decimal" value={rateVal(w.key)} onChange={e => setEdits(x => ({ ...x, [w.key]: e.target.value }))} placeholder="—" className={inputClass} />
            </div>
          ))}
        </div>
        <button onClick={saveRates} disabled={!Object.keys(edits).length || busy === 'rates'} className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-40">Save rates</button>
      </div>

      <form onSubmit={changePin} className={card}>
        <p className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-3">Admin PIN</p>
        <div className="flex gap-2">
          <input type="password" inputMode="numeric" value={newPin} onChange={e => setNewPin(e.target.value)} placeholder="New admin PIN" className={inputClass} />
          <button disabled={busy === 'pin'} className="mb-3 bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-4 text-xs font-bold whitespace-nowrap">Change PIN</button>
        </div>
        <p className="text-[11px] text-gray-500">Staff PINs are managed under Access. PINs are stored hashed — nobody can read them back, including you.</p>
      </form>

      <div className={card}>
        <p className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-2">Telegram</p>
        <p className="text-[11px] text-gray-500 mb-3">Order, edit and dispatch alerts and the 8 pm daily digest go through the <code>ops-notify</code> and <code>ops-daily-digest</code> Supabase functions (see the README for setup).</p>
        <button onClick={async () => { await sendTelegramMessage('✅ Test message from Needle Point ERP'); toast('Test sent — check the Telegram group (nothing arrives if the function or secrets are not set up yet).', 'info', 6000) }}
          className="bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-4 py-2 text-xs font-bold">Send test message</button>
      </div>
    </div>
  )
}
