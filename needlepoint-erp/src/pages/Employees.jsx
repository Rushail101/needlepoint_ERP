import { useEffect, useState } from 'react'
import { supabase, uploadPhoto } from '../supabaseClient.js'

export default function Employees() {
  const [employees, setEmployees] = useState([])
  const [showForm, setShowForm] = useState(false)

  const load = async () => {
    const { data } = await supabase.from('employees').select('*').eq('active', true).order('name')
    setEmployees(data || [])
  }
  useEffect(() => { load() }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Team</h2>
        <button onClick={() => setShowForm(true)} className="bg-brand-600 text-white rounded-xl px-4 py-2 font-semibold text-sm">+ Add Person</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {employees.map(e => (
          <div key={e.id} className="bg-white border rounded-xl p-3 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gray-100 overflow-hidden flex-shrink-0">
              {e.photo_url ? <img src={e.photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xl">🧑</div>}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{e.name}</p>
              {e.role && <p className="text-xs text-gray-500 truncate">{e.role}</p>}
            </div>
          </div>
        ))}
        {employees.length === 0 && <p className="text-gray-400 text-sm col-span-full">No team members added yet.</p>}
      </div>
      {showForm && <EmployeeForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
    </div>
  )
}

function EmployeeForm({ onClose, onSaved }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [phone, setPhone] = useState('')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      let photo_url = null
      if (file) photo_url = await uploadPhoto(file, 'employees')
      await supabase.from('employees').insert({ name: name.trim(), role: role.trim() || null, phone: phone.trim() || null, photo_url })
      onSaved()
    } catch (err) {
      alert('Could not save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-30">
      <form onSubmit={save} className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5">
        <h3 className="text-lg font-bold mb-4">Add Team Member</h3>
        <label className="block text-sm font-medium mb-1">Photo</label>
        <input type="file" accept="image/*" capture="user" onChange={(e) => setFile(e.target.files[0])} className="w-full mb-3 text-sm" />
        <label className="block text-sm font-medium mb-1">Name*</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded-lg px-3 py-2 mb-3" required />
        <label className="block text-sm font-medium mb-1">Role</label>
        <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Embroidery Operator" className="w-full border rounded-lg px-3 py-2 mb-3" />
        <label className="block text-sm font-medium mb-1">Phone</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full border rounded-lg px-3 py-2 mb-4" />
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 border rounded-xl py-2.5 font-semibold">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 bg-brand-600 text-white rounded-xl py-2.5 font-semibold disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
