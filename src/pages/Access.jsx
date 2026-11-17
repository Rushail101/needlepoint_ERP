import { useEffect, useState } from 'react'
import { supabase, must } from '../supabaseClient.js'
import { toast } from '../components/Toast.jsx'
import Modal, { FormActions, inputClass, labelClass } from '../components/Modal.jsx'

const ROLE_LABEL = {
  floor_manager: { text: 'Floor Manager', color: 'bg-blue-900/50 text-blue-300' },
  worker: { text: 'Worker', color: 'bg-gray-800 text-gray-400' },
}

// PINs are stored hashed (migration 008) and set through ops_set_pin, which
// also refuses a PIN someone else already uses. They can't be shown back.
async function setPin(id, pin) {
  const { error } = await supabase.rpc('ops_set_pin', { p_pin_id: id, p_pin: pin })
  if (error) throw new Error(error.message)
}

export default function Access() {
  const [people, setPeople] = useState([])
  const [employees, setEmployees] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = async () => {
    const { data: p } = await supabase.from('access_pins').select('*, employees(photo_url)').order('created_at', { ascending: false })
    const { data: e } = await supabase.from('employees').select('*').eq('active', true).order('name')
    setPeople(p || []); setEmployees(e || [])
  }
  useEffect(() => { load() }, [])

  // Team members who don't already have an access login — these are what the
  // "From Team" picker offers, so you can't accidentally create a duplicate.
  const linkedEmployeeIds = new Set(people.filter(p => p.employee_id).map(p => p.employee_id))
  const availableEmployees = employees.filter(e => !linkedEmployeeIds.has(e.id))

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold text-gray-100">Access</h2>
        <button onClick={() => setShowForm(true)} className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-4 py-2 font-semibold text-sm">+ Add Person</button>
      </div>
      <p className="text-sm text-gray-500 mb-4">Give someone a PIN and role, and tell them the PIN yourself. PINs are stored scrambled, so they can't be looked up later — if someone forgets theirs, set a new one. Link the login to a Team member so Work Log picks them automatically.</p>

      <div className="space-y-2">
        {people.map(p => (
          <button key={p.id} onClick={() => setEditing(p)}
            className={`w-full bg-gray-900 border rounded-xl p-3 flex items-center gap-3 text-left ${p.active ? 'border-gray-800 hover:border-gray-700' : 'border-gray-800 opacity-50'}`}>
            <div className="w-9 h-9 rounded-full bg-gray-800 overflow-hidden flex-shrink-0">
              {p.employees?.photo_url ? <img src={p.employees.photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-sm">🧑</div>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm text-gray-100">{p.name}</p>
              <p className="text-xs text-gray-500">{p.employee_id ? 'Linked to Team · ' : ''}PIN set · tap to change</p>
            </div>
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${ROLE_LABEL[p.role]?.color || 'bg-gray-800 text-gray-400'}`}>
              {ROLE_LABEL[p.role]?.text || p.role}
            </span>
            {!p.active && <span className="text-[11px] text-gray-600">Inactive</span>}
          </button>
        ))}
        {people.length === 0 && <p className="text-gray-500 text-sm">No floor managers or workers added yet.</p>}
      </div>

      {showForm && <AccessForm employees={availableEmployees} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
      {editing && <AccessForm person={editing} employees={employees} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </div>
  )
}

function AccessForm({ person, employees, onClose, onSaved }) {
  const isEdit = !!person
  const [source, setSource] = useState(person?.employee_id ? 'team' : (employees.length > 0 && !isEdit ? 'team' : 'custom'))
  const [employeeId, setEmployeeId] = useState(person?.employee_id || employees[0]?.id || '')
  const [customName, setCustomName] = useState(isEdit && !person?.employee_id ? person.name : '')
  const [pin, setPinValue] = useState('')
  const [role, setRole] = useState(person?.role || 'floor_manager')
  const [active, setActive] = useState(person?.active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const resolvedName = source === 'team'
    ? employees.find(e => e.id === employeeId)?.name || ''
    : customName.trim()

  const save = async (e) => {
    e.preventDefault()
    if (!resolvedName || (!isEdit && pin.trim().length < 4)) { setError('Name and a PIN of at least 4 digits are needed'); return }
    setSaving(true)
    setError('')
    let createdId = null
    try {
      const payload = {
        name: resolvedName,
        role,
        active,
        employee_id: source === 'team' ? employeeId : (isEdit ? person.employee_id : null),
      }
      if (isEdit) {
        must(await supabase.from('access_pins').update(payload).eq('id', person.id), 'Saving')
        if (pin.trim()) await setPin(person.id, pin.trim())
      } else {
        const row = must(await supabase.from('access_pins').insert(payload).select().single(), 'Saving')
        createdId = row.id
        await setPin(row.id, pin.trim())
      }
      toast(isEdit ? `${resolvedName} updated` : `${resolvedName} can now sign in with their PIN`, 'success')
      onSaved()
    } catch (err) {
      // don't leave a login behind without a working PIN
      if (createdId) await supabase.from('access_pins').delete().eq('id', createdId)
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm(`Remove access for "${person.name}"? Their PIN will stop working immediately.`)) return
    setSaving(true)
    try {
      must(await supabase.from('access_pins').delete().eq('id', person.id), 'Removing')
      onSaved()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <form onSubmit={save}>
        <h3 className="text-lg font-bold mb-4 text-gray-100">{isEdit ? 'Edit Access' : 'Add Person'}</h3>

        {!isEdit && employees.length > 0 && (
          <div className="flex gap-2 mb-3">
            <button type="button" onClick={() => setSource('team')}
              className={`flex-1 rounded-lg py-2 text-sm font-medium ${source === 'team' ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-300 border border-gray-700'}`}>
              From Team
            </button>
            <button type="button" onClick={() => setSource('custom')}
              className={`flex-1 rounded-lg py-2 text-sm font-medium ${source === 'custom' ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-300 border border-gray-700'}`}>
              Not on Team
            </button>
          </div>
        )}

        {source === 'team' && !isEdit ? (
          <>
            <label className={labelClass}>Select from Team*</label>
            {employees.length === 0 ? (
              <p className="text-sm text-gray-500 mb-3">No available team members — everyone already has access, or Team is empty.</p>
            ) : (
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputClass} required>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}{e.role ? ` — ${e.role}` : ''}</option>)}
              </select>
            )}
          </>
        ) : isEdit && person?.employee_id ? (
          <>
            <label className={labelClass}>Name</label>
            <p className="text-gray-200 mb-3">{person.name} <span className="text-xs text-gray-500">(linked to Team)</span></p>
          </>
        ) : (
          <>
            <label className={labelClass}>Name*</label>
            <input value={customName} onChange={(e) => setCustomName(e.target.value)} className={inputClass} required />
          </>
        )}

        <label className={labelClass}>{isEdit ? 'New PIN (leave blank to keep the current one)' : 'PIN*'}</label>
        <input value={pin} onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ''))} inputMode="numeric" autoComplete="off"
          className={inputClass} placeholder={isEdit ? '••••' : 'at least 4 digits'} required={!isEdit} />
        <label className={labelClass}>Role</label>
        <select value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
          <option value="floor_manager">Floor Manager — logs & edits work, updates garment stage</option>
          <option value="worker">Worker — sees orders and logs their own work</option>
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
