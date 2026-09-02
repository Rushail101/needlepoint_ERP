import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { exportEmployeePDF } from '../pdfExport.js'

const WORK_TYPE_LABEL = {
  screen_printing: 'Screen Printing',
  embroidery: 'Embroidery',
  sampling: 'Sampling',
  sample_change: 'Sample Change',
  stitching: 'Stitching',
  other: 'Other',
}

const RANGES = [
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All Time' },
]

const AVG_WEEKS_PER_MONTH = 4.345

export default function EmployeeSummary() {
  const { id } = useParams()
  const [employee, setEmployee] = useState(null)
  const [logs, setLogs] = useState([])
  const [range, setRange] = useState('week')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: e } = await supabase.from('employees').select('*').eq('id', id).single()
      const { data: l } = await supabase
        .from('work_logs')
        .select('*, products(name, cover_photo_url)')
        .eq('employee_id', id)
        .order('logged_at', { ascending: false })
      setEmployee(e); setLogs(l || [])
    }
    load()
  }, [id])

  if (!employee) return <p className="text-gray-500 text-center py-10">Loading...</p>

  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  startOfWeek.setHours(0, 0, 0, 0)

  const filtered = logs.filter(l => {
    if (range === 'all') return true
    const d = new Date(l.logged_at)
    if (range === 'week') return d >= startOfWeek
    if (range === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    return true
  })

  const totalPieces = filtered.reduce((sum, l) => sum + (l.quantity || 0), 0)
  const byType = {}
  filtered.forEach(l => { byType[l.work_type] = (byType[l.work_type] || 0) + 1 })

  // Cost per piece, using the fixed monthly salary as the base.
  let costPerPiece = null
  let costNote = ''
  if (employee.monthly_salary && totalPieces > 0) {
    if (range === 'month') {
      costPerPiece = employee.monthly_salary / totalPieces
      costNote = 'monthly salary ÷ pieces this month'
    } else if (range === 'week') {
      costPerPiece = (employee.monthly_salary / AVG_WEEKS_PER_MONTH) / totalPieces
      costNote = 'estimated weekly share of salary ÷ pieces this week'
    } else {
      const firstLogDate = filtered.length ? new Date(filtered[filtered.length - 1].logged_at) : now
      const monthsSpan = Math.max(1, Math.ceil((now - firstLogDate) / (1000 * 60 * 60 * 24 * 30)))
      costPerPiece = (employee.monthly_salary * monthsSpan) / totalPieces
      costNote = `estimated salary over ~${monthsSpan} month${monthsSpan > 1 ? 's' : ''} ÷ pieces all time`
    }
  }

  const rangeLabel = RANGES.find(r => r.key === range)?.label || range

  const doExport = async () => {
    setExporting(true)
    try {
      await exportEmployeePDF({
        employee, range, rangeLabel, logs: filtered, totalPieces,
        totalEntries: filtered.length, byType, costPerPiece, workTypeLabel: WORK_TYPE_LABEL,
      })
    } catch (err) {
      alert('Could not export PDF: ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <Link to="/employees" className="text-brand-500 text-sm font-medium">← Back to Team</Link>

      <div className="flex items-center gap-3 mt-3 mb-4">
        <div className="w-16 h-16 rounded-full bg-gray-800 overflow-hidden flex-shrink-0">
          {employee.photo_url ? <img src={employee.photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-2xl">🧑</div>}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-gray-100">{employee.name}</h2>
          {employee.role && <p className="text-sm text-gray-400">{employee.role}</p>}
        </div>
        <button onClick={doExport} disabled={exporting}
          className="bg-gray-800 border border-gray-700 hover:border-gray-600 text-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 flex-shrink-0">
          {exporting ? 'Exporting...' : '📄 Export PDF'}
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        {RANGES.map(r => (
          <button key={r.key} onClick={() => setRange(r.key)}
            className={`px-3 py-1.5 rounded-full text-sm ${range === r.key ? 'bg-brand-600 text-white' : 'bg-gray-800 border border-gray-700 text-gray-300'}`}>
            {r.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-2xl font-bold text-gray-100">{filtered.length}</p>
          <p className="text-xs text-gray-400 mt-1">Work entries</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-2xl font-bold text-gray-100">{totalPieces}</p>
          <p className="text-xs text-gray-400 mt-1">Total pieces</p>
        </div>
      </div>

      {employee.monthly_salary ? (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-lg font-bold text-gray-100">₹{employee.monthly_salary}</p>
            <p className="text-xs text-gray-400 mt-1">Monthly salary</p>
          </div>
          <div className="bg-gray-900 border border-yellow-900/50 rounded-xl p-4">
            <p className="text-lg font-bold text-yellow-400">{costPerPiece != null ? `₹${costPerPiece.toFixed(2)}` : '—'}</p>
            <p className="text-xs text-gray-400 mt-1">Cost per piece</p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-600 mb-6">No monthly salary set — add one from the Team tab to see cost per piece.</p>
      )}
      {costNote && <p className="text-[11px] text-gray-600 -mt-4 mb-6">{costNote}</p>}

      {Object.keys(byType).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {Object.entries(byType).map(([type, count]) => (
            <span key={type} className="text-xs px-3 py-1.5 rounded-full bg-gray-800 text-gray-300">
              {WORK_TYPE_LABEL[type] || type}: {count}
            </span>
          ))}
        </div>
      )}

      <h3 className="text-sm font-bold text-gray-500 mb-2 uppercase tracking-wide">Work Log</h3>
      <div className="space-y-2">
        {filtered.map(l => (
          <div key={l.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-800 overflow-hidden flex-shrink-0">
              {l.products?.cover_photo_url && <img src={l.products.cover_photo_url} className="w-full h-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate text-gray-100">{l.products?.name}</p>
              <p className="text-xs text-gray-400">{WORK_TYPE_LABEL[l.work_type] || l.work_type} {l.quantity ? `· ${l.quantity} pcs` : ''}</p>
            </div>
            <p className="text-[11px] text-gray-600 flex-shrink-0">{new Date(l.logged_at).toLocaleDateString()}</p>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-gray-500 text-sm">No work logged in this range.</p>}
      </div>
    </div>
  )
}
