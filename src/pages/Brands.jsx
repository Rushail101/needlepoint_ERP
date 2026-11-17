import { useEffect, useState } from 'react'
import { supabase, uploadPhoto } from '../supabaseClient.js'
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

  const load = async () => {
    const { data } = await supabase.from('brands').select('*').order('name')
    setBrands(data || [])
  }
  useEffect(() => { load() }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-100">Brands</h2>
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
              {b.portal_password && (
                <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-brand-950 border border-brand-800/60 text-brand-300 font-mono">
                  🔑 Portal Set
                </span>
              )}
            </div>
          </div>
        ))}
        {brands.length === 0 && <p className="text-gray-500 text-sm col-span-full">No brands yet.</p>}
      </div>

      {canEdit && showForm && (
        <BrandForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />
      )}
      {canEdit && editing && (
        <BrandForm brand={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
      )}
    </div>
  )
}

function BrandForm({ brand, onClose, onSaved }) {
  const isEdit = !!brand
  const [name, setName] = useState(brand?.name || '')
  const [contact, setContact] = useState(brand?.contact_person || '')
  const [phone, setPhone] = useState(brand?.contact_phone || '')
  const [portalPassword, setPortalPassword] = useState(brand?.portal_password || '')
  const [portalActive, setPortalActive] = useState(brand?.portal_active ?? true)
  const [showPassword, setShowPassword] = useState(false)
  const [copied, setCopied] = useState(false)
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
        portal_password: portalPassword.trim() || null,
        portal_active: portalActive,
        logo_url,
      }
      // Billing fields exist once the accounts link SQL has been run; only send
      // them when filled in (or already present) so saving works either way.
      const billing = {
        gstin: gstin.trim() || null, state: state || null, pan: pan.trim() || null,
        email: email.trim() || null, billing_address: address.trim() || null,
        payment_terms_days: terms === '' ? null : Number(terms),
      }
      const hasBilling = Object.values(billing).some(v => v != null) || (brand && 'gstin' in brand)
      if (hasBilling) Object.assign(payload, billing)

      // supabase-js reports failures in { error } rather than throwing — they
      // used to be ignored, so a failed save looked like it worked.
      const { error } = isEdit
        ? await supabase.from('brands').update(payload).eq('id', brand.id)
        : await supabase.from('brands').insert(payload)
      if (error) throw new Error(/column .* does not exist|schema cache/i.test(error.message)
        ? `${error.message} — run the accounts link SQL (sql/integration/001_link_operations.sql) to enable billing fields.`
        : error.message)
      onSaved()
    } catch (err) {
      alert('Could not save: ' + err.message)
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
      alert('Could not delete: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <form onSubmit={save}>
        <h3 className="text-lg font-bold mb-4 text-gray-100">{isEdit ? 'Edit Brand' : 'Add Brand'}</h3>
        
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

        {/* Client Portal Password & Access Controls */}
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-3.5 mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-gray-300 uppercase tracking-wider">
              Client Portal Password
            </label>
            {portalPassword && (
              <button
                type="button"
                onClick={handleCopy}
                className="text-[11px] text-brand-400 hover:text-brand-300 font-semibold"
              >
                {copied ? '✓ Copied!' : '📋 Copy'}
              </button>
            )}
          </div>

          <div className="relative mb-2">
            <input
              type={showPassword ? 'text' : 'password'}
              value={portalPassword}
              onChange={(e) => setPortalPassword(e.target.value)}
              placeholder="No password set yet"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-2.5 text-xs text-gray-400 hover:text-gray-200"
            >
              {showPassword ? 'Hide' : 'View'}
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input
              type="checkbox"
              checked={portalActive}
              onChange={(e) => setPortalActive(e.target.checked)}
              className="rounded border-gray-700 bg-gray-900 text-brand-600 focus:ring-brand-500"
            />
            <span>Portal Login Enabled</span>
          </label>
        </div>

        <FormActions onCancel={onClose} saving={saving} onDelete={isEdit ? remove : null} />
      </form>
    </Modal>
  )
}
