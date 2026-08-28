import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import Modal, { FormActions, inputClass, labelClass } from '../components/Modal.jsx'

const ROLE_LABEL = {
  floor_manager: { text: 'Floor Manager', color: 'bg-blue-900/50 text-blue-300' },
  worker: { text: 'Worker', color: 'bg-gray-800 text-gray-400' },
}

export default function Access() {
  const [people, setPeople] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = async () => {
    const { data } = await supabase.from('access_pins').select('*').order('created_at', { ascending: false })
    setPeople(data || [])
  }
  useEffect(() => { load() }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold text-gray-100">Access</h2>
        <button onClick={() => setShowForm(true)} className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-4 py-2 font-semibold text-sm">+ Add Person</button>
      </div>
      <p className="text-sm text-gray-500 mb-4">Give someone a PIN and role. Share the PIN with them directly — that's all they need to log in.</p>

      <div className="space-y-2">
        {people.map(p => (
          <button key={p.id} onClick={() => setEditing(p)}
            className={`w-full bg-gray-900 border rounded-xl p-3 flex items-center gap-3 text-left ${p.active ? 'border-gray-800 hover:border-gray-700' : 'border-gray-800 opacity-50'}`}>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm text-gray-100">{p.name}</p>
              <p className="text-xs text-gray-500 font-mono">PIN: {p.pin}</p>
            </div>
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${ROLE_LABEL[p.role]?.color || 'bg-gray-800 text-gray-400'}`}>
              {ROLE_LABEL[p.role]?.text || p.role}
            </span>
            {!p.active && <span className="text-[11px] text-gray-600">Inactive</span>}
          </button>
        ))}
        {people.length === 0 && <p className="text-gray-500 text-sm">No floor managers or workers added yet.</p>}
      </div>

      {showForm && <AccessForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
      {editing && <AccessForm person={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </div>
  )
}

function AccessForm({ person, onClose, onSaved }) {
  const isEdit = !!person
  const [name, setName] = useState(person?.name || '')
  const [pin, setPin] = useState(person?.pin || '')
  const [role, setRole] = useState(person?.role || 'worker')
  const [active, setActive] = useState(person?.active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async (e) => {
    e.preventDefault()
    if (!name.trim() || !pin.trim()) return
    setSaving(true)
    setError('')
    try {
      const payload = { name: name.trim(), pin: pin.trim(), role, active }
      if (isEdit) {
        const { error: err } = await supabase.from('access_pins').update(payload).eq('id', person.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('access_pins').insert(payload)
        if (err) throw err
      }
      onSaved()
    } catch (err) {
      setError(err.message.includes('duplicate') ? 'That PIN is already in use — pick a different one.' : err.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm(`Remove access for "${person.name}"? Their PIN will stop working immediately.`)) return
    setSaving(true)
    try {
      await supabase.from('access_pins').delete().eq('id', person.id)
      onSaved()
    } catch (err) {
      alert('Could not remove: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <form onSubmit={save}>
        <h3 className="text-lg font-bold mb-4 text-gray-100">{isEdit ? 'Edit Access' : 'Add Person'}</h3>
        <label className={labelClass}>Name*</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
        <label className={labelClass}>PIN*</label>
        <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} inputMode="numeric"
          className={inputClass} placeholder="e.g. 4521" required />
        <label className={labelClass}>Role</label>
        <select value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
          <option value="floor_manager">Floor Manager — logs & edits work, updates garment stage</option>
          <option value="worker">Worker — view garments and brands only</option>
        </select>
        {isEdit && (
          <label className="flex items-center gap-2 mb-3 text-sm text-gray-300">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active (uncheck to temporarily block this PIN without deleting it)
          </label>
        )}
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <FormActions onCancel={onClose} saving={saving} onDelete={isEdit ? remove : null} />
      </form>
    </Modal>
  )
}
