import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, uploadPhoto } from '../supabaseClient.js'
import Modal, { FormActions, inputClass, labelClass } from '../components/Modal.jsx'

export default function Employees() {
  const [employees, setEmployees] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = async () => {
    const { data } = await supabase.from('employees').select('*').eq('active', true).order('name')
    setEmployees(data || [])
  }
  useEffect(() => { load() }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-100">Team</h2>
        <button onClick={() => setShowForm(true)} className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-4 py-2 font-semibold text-sm">+ Add Person</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {employees.map(e => (
          <div key={e.id} className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl p-3 flex items-center gap-3 relative">
            <button
              onClick={() => setEditing(e)}
              className="absolute top-1.5 right-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
              aria-label="Edit team member"
            >✎</button>
            <Link to={`/employees/${e.id}`} className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-12 h-12 rounded-full bg-gray-800 overflow-hidden flex-shrink-0">
                {e.photo_url ? <img src={e.photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xl">🧑</div>}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate text-gray-100">{e.name}</p>
                {e.role && <p className="text-xs text-gray-400 truncate">{e.role}</p>}
              </div>
            </Link>
          </div>
        ))}
        {employees.length === 0 && <p className="text-gray-500 text-sm col-span-full">No team members added yet.</p>}
      </div>
      {showForm && <EmployeeForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
      {editing && <EmployeeForm employee={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </div>
  )
}

function EmployeeForm({ employee, onClose, onSaved }) {
  const isEdit = !!employee
  const [name, setName] = useState(employee?.name || '')
  const [role, setRole] = useState(employee?.role || '')
  const [phone, setPhone] = useState(employee?.phone || '')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      let photo_url = employee?.photo_url || null
      if (file) photo_url = await uploadPhoto(file, 'employees')
      const payload = { name: name.trim(), role: role.trim() || null, phone: phone.trim() || null, photo_url }
      if (isEdit) {
        await supabase.from('employees').update(payload).eq('id', employee.id)
      } else {
        await supabase.from('employees').insert(payload)
      }
      onSaved()
    } catch (err) {
      alert('Could not save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // "Delete" for people marks them inactive rather than hard-deleting, so past
  // work history logged against them stays intact.
  const remove = async () => {
    if (!confirm(`Remove "${employee.name}" from the team? Their past work history is kept.`)) return
    setSaving(true)
    try {
      await supabase.from('employees').update({ active: false }).eq('id', employee.id)
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
        <h3 className="text-lg font-bold mb-4 text-gray-100">{isEdit ? 'Edit Team Member' : 'Add Team Member'}</h3>
        {employee?.photo_url && !file && <img src={employee.photo_url} className="w-16 h-16 object-cover rounded-full mb-2" />}
        <label className={labelClass}>Photo</label>
        <input type="file" accept="image/*" capture="user" onChange={(e) => setFile(e.target.files[0])} className="w-full mb-3 text-sm text-gray-300" />
        <label className={labelClass}>Name*</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
        <label className={labelClass}>Role</label>
        <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Embroidery Operator" className={inputClass} />
        <label className={labelClass}>Phone</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
        <FormActions onCancel={onClose} saving={saving} onDelete={isEdit ? remove : null} saveLabel={isEdit ? 'Save' : 'Add'} />
      </form>
    </Modal>
  )
}
