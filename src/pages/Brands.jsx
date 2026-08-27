import { useEffect, useState } from 'react'
import { supabase, uploadPhoto } from '../supabaseClient.js'

export default function Brands() {
  const [brands, setBrands] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null) // brand object being edited, or null

  const load = async () => {
    const { data } = await supabase.from('brands').select('*').order('name')
    setBrands(data || [])
  }
  useEffect(() => { load() }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold font-display">Brands</h2>
        <button onClick={() => setShowForm(true)} className="bg-thread-500 hover:bg-thread-600 text-ink-950 rounded-xl px-4 py-2 font-semibold text-sm transition-colors">+ Add Brand</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {brands.map(b => (
          <div key={b.id} className="relative bg-ink-900 seam-top border border-ink-700 rounded-xl p-3 flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-ink-800 overflow-hidden flex-shrink-0">
              {b.logo_url ? <img src={b.logo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xl">🏷️</div>}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate text-paper-100">{b.name}</p>
              {b.contact_person && <p className="text-xs text-paper-400 truncate">{b.contact_person}</p>}
            </div>
            <button
              onClick={() => setEditing(b)}
              aria-label={`Edit ${b.name}`}
              className="absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-full bg-ink-800/90 border border-ink-700 text-xs text-paper-300 hover:text-thread-500 hover:border-thread-500 transition-colors"
            >✏️</button>
          </div>
        ))}
        {brands.length === 0 && <p className="text-paper-400 text-sm col-span-full">No brands yet.</p>}
      </div>
      {showForm && <BrandForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
      {editing && (
        <BrandForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

function BrandForm({ initial, onClose, onSaved }) {
  const isEdit = !!initial
  const [name, setName] = useState(initial?.name || '')
  const [contact, setContact] = useState(initial?.contact_person || '')
  const [phone, setPhone] = useState(initial?.contact_phone || '')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      let logo_url = initial?.logo_url ?? null
      if (file) logo_url = await uploadPhoto(file, 'brands')
      const payload = { name: name.trim(), contact_person: contact.trim() || null, contact_phone: phone.trim() || null, logo_url }
      if (isEdit) {
        await supabase.from('brands').update(payload).eq('id', initial.id)
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

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-30">
      <form onSubmit={save} className="bg-ink-900 seam-top border border-ink-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5">
        <h3 className="text-lg font-bold font-display mb-4">{isEdit ? 'Edit Brand' : 'Add Brand'}</h3>
        <label className="block text-sm font-medium mb-1 text-paper-300">Logo / photo</label>
        {isEdit && initial.logo_url && !file && (
          <img src={initial.logo_url} className="w-12 h-12 rounded-lg object-cover mb-2" />
        )}
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} className="w-full mb-3 text-sm text-paper-300" />
        <label className="block text-sm font-medium mb-1 text-paper-300">Brand name*</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-ink-800 border border-ink-700 text-paper-100 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:border-thread-500" required />
        <label className="block text-sm font-medium mb-1 text-paper-300">Contact person</label>
        <input value={contact} onChange={(e) => setContact(e.target.value)} className="w-full bg-ink-800 border border-ink-700 text-paper-100 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:border-thread-500" />
        <label className="block text-sm font-medium mb-1 text-paper-300">Phone</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-ink-800 border border-ink-700 text-paper-100 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:border-thread-500" />
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 border border-ink-700 text-paper-100 hover:bg-ink-800 rounded-xl py-2.5 font-semibold transition-colors">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 bg-thread-500 hover:bg-thread-600 text-ink-950 rounded-xl py-2.5 font-semibold disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
