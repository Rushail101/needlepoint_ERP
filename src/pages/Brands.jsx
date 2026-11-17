import { useEffect, useState } from 'react'
import { supabase, uploadPhoto } from '../supabaseClient.js'
import { toast } from '../components/Toast.jsx'
import Modal, { FormActions, inputClass, labelClass } from '../components/Modal.jsx'
import { useAuth } from '../components/PinGate.jsx'
import { can } from '../permissions.js'
import { INDIAN_STATES, stateFromGSTIN, isGSTINValid } from '../billing.js'

export default function Brands() {
  const { user } = useAuth()
  const canEdit = can(user, 'manage_brands')
  const [brands, setBrands] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)

  // Client parties in the accounts app (view ops.billing_parties, from the
  // accounts link SQL). null = accounts app not linked yet → no link chips.
  const [parties, setParties] = useState(null)
  const load = async () => {
    const [{ data }, bp] = await Promise.all([
      supabase.from('brands').select('*').order('name'),
      supabase.from('billing_parties').select('*').order('name'),
    ])
    setBrands(data || [])
    setParties(bp.error ? null : (bp.data || []))
  }
  const partyOf = id => parties?.find(p => p.brand_id === id)
  const unlinkedCount = parties ? brands.filter(b => !partyOf(b.id)).length : 0
  useEffect(() => { load() }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-100">Brands</h2>
          {canEdit && unlinkedCount > 0 && (
            <p className="text-xs text-amber-300 mt-0.5">{unlinkedCount} not linked to a party in Accounts yet: link them in Accounts → Parties → Brand links</p>
          )}
        </div>
        {canEdit && (
          <button
            onClick={() => setShowForm(true)}
            className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-4 py-2 font-semibold text-sm"
          >
            + Add Brand
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {brands.map(b => (
          <div
            key={b.id}
            onClick={canEdit ? () => setEditing(b) : undefined}
            className={`bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center gap-3 text-left ${
              canEdit ? 'hover:border-gray-700 cursor-pointer' : ''
            }`}
          >
            <div className="w-12 h-12 rounded-lg bg-gray-800 overflow-hidden flex-shrink-0">
              {b.logo_url ? (
                <img src={b.logo_url} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xl">🏷️</div>
              )}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate text-gray-100">{b.name}</p>
              {b.contact_person && <p className="text-xs text-gray-400 truncate">{b.contact_person}</p>}
              <div className="flex flex-wrap gap-1 mt-1">
                {b.portal_active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-950 border border-brand-800/60 text-brand-300">🔑 Portal on</span>}
                {canEdit && parties && (partyOf(b.id)
                  ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-900 text-emerald-300 truncate max-w-full" title="Invoices for this brand are made out to this party in the accounts app">🔗 {partyOf(b.id).name}</span>
                  : <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-900 text-amber-300">not in Accounts</span>)}
                {b.gstin ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-mono">{b.gstin}</span>
                  : <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-900 text-amber-300">no GSTIN</span>}
              </div>
            </div>
          </div>
        ))}
        {brands.length === 0 && <p className="text-gray-500 text-sm col-span-full">No brands yet.</p>}
      </div>

      {canEdit && showForm && (
        <BrandForm parties={parties} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />
      )}
      {canEdit && editing && (
        <BrandForm brand={editing} linkedParty={partyOf(editing.id)} parties={parties} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
      )}
    </div>
  )
}

function BrandForm({ brand, linkedParty, parties, onClose, onSaved }) {
  const isEdit = !!brand
  // New brand: optionally start from a client you already bill in Accounts —
  // fills the details in and links the two, instead of making a duplicate party.
  const freeParties = (parties || []).filter(p => !p.brand_id)
  const [fromParty, setFromParty] = useState('')
  const [name, setName] = useState(brand?.name || '')
  const [contact, setContact] = useState(brand?.contact_person || '')
  const [phone, setPhone] = useState(brand?.contact_phone || '')
  // Portal passwords are write-only now (hashed in the database, migration 008).
  const [portalPassword, setPortalPassword] = useState('')
  const [hasPassword, setHasPassword] = useState(false)
  const [portalActive, setPortalActive] = useState(brand?.portal_active ?? false)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (brand?.id) supabase.rpc('ops_has_portal_password', { p_brand_id: brand.id }).then(({ data }) => setHasPassword(!!data))
  }, [brand?.id])
  const generate = () => {
    const words = ['cotton', 'denim', 'stitch', 'thread', 'linen', 'velvet', 'indigo', 'button']
    setPortalPassword(`${words[Math.floor(Math.random() * words.length)]}-${Math.floor(1000 + Math.random() * 9000)}`)
  }
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  // Billing details — synced to the client party in the accounts app
  const [gstin, setGstin] = useState(brand?.gstin || '')
  const [state, setState] = useState(brand?.state || '')
  const [pan, setPan] = useState(brand?.pan || '')
  const [email, setEmail] = useState(brand?.email || '')
  const [address, setAddress] = useState(brand?.billing_address || '')
  const [terms, setTerms] = useState(brand?.payment_terms_days ?? '')
  const gstinBad = gstin.trim().length > 0 && !isGSTINValid(gstin)
  const onGstin = (v) => {
    const g = v.toUpperCase().replace(/\s/g, '')
    setGstin(g)
    if (g.length === 15) {
      if (!state) setState(stateFromGSTIN(g))
      if (!pan) setPan(g.slice(2, 12))
    }
  }

  const pickParty = (id) => {
    setFromParty(id)
    const p = freeParties.find(x => x.id === id)
    if (!p) return
    setName(p.name || ''); setPhone(p.phone || ''); setEmail(p.email || ''); setAddress(p.address || '')
    setGstin(p.gstin || ''); setState(p.state || (p.gstin ? stateFromGSTIN(p.gstin) : '')); setPan(p.pan || (p.gstin?.length === 15 ? p.gstin.slice(2, 12) : ''))
  }

  const handleCopy = async () => {
    if (!portalPassword) return
    await navigator.clipboard.writeText(portalPassword)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      let logo_url = brand?.logo_url || null
      if (file) logo_url = await uploadPhoto(file, 'brands')
      
      const payload = {
        name: name.trim(),
        contact_person: contact.trim() || null,
        contact_phone: phone.trim() || null,
        portal_active: portalActive,
        logo_url,
      }
      Object.assign(payload, {
        gstin: gstin.trim() || null, state: state || null, pan: pan.trim() || null,
        email: email.trim() || null, billing_address: address.trim() || null,
        payment_terms_days: terms === '' ? null : Number(terms),
      })

      let targetId = brand?.id
      if (!isEdit && fromParty) {
        // creates the brand already linked to that party (accounts link SQL)
        const { data: newId, error: linkErr } = await supabase.schema('accounts_erp')
          .rpc('create_brand_from_party', { p_party: fromParty, p_brand_name: name.trim() })
        if (linkErr) throw new Error(linkErr.message)
        targetId = newId
      }
      const { data: saved, error } = targetId
        ? await supabase.from('brands').update(payload).eq('id', targetId).select().single()
        : await supabase.from('brands').insert(payload).select().single()
      if (!error && portalPassword.trim()) {
        const { error: pwErr } = await supabase.rpc('ops_set_portal_password', { p_brand_id: saved.id, p_password: portalPassword.trim() })
        if (pwErr) throw new Error('Brand saved, but the portal password was not: ' + pwErr.message)
        toast(`Portal password set for ${saved.name} — share it with them now; it can't be shown again.`, 'success', 7000)
      }
      if (error) throw new Error(error.message)
      onSaved()
    } catch (err) {
      toast('Could not save: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm(`Delete "${brand.name}"? Garments under this brand will be kept but unlinked from it.`)) return
    setSaving(true)
    try {
      const { error } = await supabase.from('brands').delete().eq('id', brand.id)
      if (error) throw error
      onSaved()
    } catch (err) {
      toast('Could not delete: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <form onSubmit={save}>
        <h3 className="text-lg font-bold mb-4 text-gray-100">{isEdit ? 'Edit Brand' : 'Add Brand'}</h3>

        {!isEdit && freeParties.length > 0 && (
          <div className="mb-4 p-3 rounded-xl bg-gray-950 border border-gray-800">
            <label className={labelClass}>Already a client in Accounts?</label>
            <select value={fromParty} onChange={e => pickParty(e.target.value)} className={inputClass + ' !mb-1'}>
              <option value="">No, new client</option>
              {freeParties.map(p => <option key={p.id} value={p.id}>{p.name}{p.gstin ? ` · ${p.gstin}` : ''}</option>)}
            </select>
            <p className="text-[11px] text-gray-500">Picking one fills in their details and links the brand to that party, so invoices go to the right client.</p>
          </div>
        )}
        {isEdit && parties && (
          <p className={`text-xs mb-4 px-3 py-2 rounded-lg border ${linkedParty ? 'bg-emerald-950/40 border-emerald-900 text-emerald-300' : 'bg-amber-950/40 border-amber-900 text-amber-300'}`}>
            {linkedParty
              ? <>🔗 Billed as <b>{linkedParty.name}</b> in Accounts. GSTIN, address and contact details stay in sync both ways.</>
              : <>Not linked to a client in Accounts yet. Link it in Accounts → Parties → Brand links.</>}
          </p>
        )}
        
        {brand?.logo_url && !file && (
          <img src={brand.logo_url} className="w-16 h-16 object-cover rounded-lg mb-2" />
        )}
        
        <label className={labelClass}>Logo / photo</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files[0])}
          className="w-full mb-3 text-sm text-gray-300"
        />

        <label className={labelClass}>Brand name*</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          required
        />

        <label className={labelClass}>Contact person</label>
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          className={inputClass}
        />

        <label className={labelClass}>Phone</label>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={inputClass}
        />

        {/* Billing details — used on invoices and kept in sync with the accounts app */}
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-3.5 mb-4">
          <p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">Billing details</p>
          <label className={labelClass}>GSTIN</label>
          <input value={gstin} maxLength={15} onChange={(e) => onGstin(e.target.value)} placeholder="07AABCC1234D1Z2"
            className={`${inputClass} ${gstinBad && gstin.length >= 15 ? 'border-red-500' : ''}`} />
          {gstin.length === 15 && (
            <p className={`text-[11px] -mt-2 mb-2 ${gstinBad ? 'text-red-400' : 'text-emerald-400'}`}>
              {gstinBad ? '⚠ GSTIN fails the checksum — check for a typo' : '✓ Valid — state and PAN filled from it'}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>State (place of supply)</label>
              <select value={state} onChange={(e) => setState(e.target.value)} className={inputClass}>
                <option value="">Select…</option>
                {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>PAN</label>
              <input value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Billing email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Payment terms (days)</label>
              <input type="number" min="0" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="e.g. 15" className={inputClass} />
            </div>
          </div>
          <label className={labelClass}>Billing address</label>
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className={inputClass} />
        </div>

        {/* Client portal: password is set here and never shown again */}
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-3.5 mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-gray-300 uppercase tracking-wider">Client portal</label>
            <span className={`text-[11px] font-semibold ${hasPassword ? 'text-emerald-400' : 'text-gray-500'}`}>{hasPassword ? '✓ password set' : 'no password yet'}</span>
          </div>
          <div className="flex gap-2 mb-1">
            <input type="text" value={portalPassword} onChange={(e) => setPortalPassword(e.target.value)} autoComplete="off"
              placeholder={hasPassword ? 'Type a new password to replace it' : 'Set a password (6+ characters)'} className={inputClass} />
            <button type="button" onClick={generate} className="mb-3 px-3 rounded-xl bg-gray-800 border border-gray-700 text-gray-200 text-xs whitespace-nowrap">Generate</button>
            {portalPassword && <button type="button" onClick={handleCopy} className="mb-3 px-3 rounded-xl bg-gray-800 border border-gray-700 text-brand-300 text-xs whitespace-nowrap">{copied ? '✓' : 'Copy'}</button>}
          </div>
          {portalPassword && <p className="text-[11px] text-amber-300 mb-2">Copy it now and send it to the brand — after saving it can't be viewed again.</p>}
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input type="checkbox" checked={portalActive} onChange={(e) => setPortalActive(e.target.checked)}
              className="rounded border-gray-700 bg-gray-900 text-brand-600 focus:ring-brand-500" />
            <span>Portal login enabled (brand name + password)</span>
          </label>
        </div>

        <FormActions onCancel={onClose} saving={saving} onDelete={isEdit ? remove : null} />
      </form>
    </Modal>
  )
}
