import { useEffect, useState } from 'react'
import { supabase, uploadPhoto } from '../supabaseClient.js'
import Modal, { FormActions, inputClass, labelClass } from '../components/Modal.jsx'
import { useAuth } from '../components/PinGate.jsx'
import { can } from '../permissions.js'

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
        {canEdit && <button onClick={() => setShowForm(true)} className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-4 py-2 font-semibold text-sm">+ Add Brand</button>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {brands.map(b => (
          <div key={b.id} onClick={canEdit ? () => setEditing(b) : undefined}
            className={`bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center gap-3 text-left ${canEdit ? 'hover:border-gray-700 cursor-pointer' : ''}`}>
            <div className="w-12 h-12 rounded-lg bg-gray-800 overflow-hidden flex-shrink-0">
              {b.logo_url ? <img src={b.logo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xl">🏷️</div>}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate text-gray-100">{b.name}</p>
              {b.contact_person && <p className="text-xs text-gray-400 truncate">{b.contact_person}</p>}
            </div>
          </div>
        ))}
        {brands.length === 0 && <p className="text-gray-500 text-sm col-span-full">No brands yet.</p>}
      </div>
      {canEdit && showForm && <BrandForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
      {canEdit && editing && <BrandForm brand={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </div>
  )
}

function BrandForm({ brand, onClose, onSaved }) {
  const isEdit = !!brand
  const [name, setName] = useState(brand?.name || '')
  const [contact, setContact] = useState(brand?.contact_person || '')
  const [phone, setPhone] = useState(brand?.contact_phone || '')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      let logo_url = brand?.logo_url || null
      if (file) logo_url = await uploadPhoto(file, 'brands')
      const payload = { name: name.trim(), contact_person: contact.trim() || null, contact_phone: phone.trim() || null, logo_url }
      if (isEdit) {
        await supabase.from('brands').update(payload).eq('id', brand.id)
      } else {
        await supabase.from('brands').insert(payload)
      }
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
      await supabase.from('brands').delete().eq('id', brand.id)
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
        {brand?.logo_url && !file && <img src={brand.logo_url} className="w-16 h-16 object-cover rounded-lg mb-2" />}
        <label className={labelClass}>Logo / photo</label>
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} className="w-full mb-3 text-sm text-gray-300" />
        <label className={labelClass}>Brand name*</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
        <label className={labelClass}>Contact person</label>
        <input value={contact} onChange={(e) => setContact(e.target.value)} className={inputClass} />
        <label className={labelClass}>Phone</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
        <FormActions onCancel={onClose} saving={saving} onDelete={isEdit ? remove : null} />
      </form>
    </Modal>
  )
}
