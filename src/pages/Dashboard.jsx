import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { STAGES, stageInfo } from '../stages.js'
import { WORK_TYPE_LABEL } from '../workTypes.js'
import { useAuth } from '../components/PinGate.jsx'
import { can } from '../permissions.js'
import { deliveryStatus, isDone, todayISO, addDays, fmtDay, daysBetween } from '../production.js'
import { pendingCount } from '../offlineQueue.js'

// Home for staff: what's late, what's due, what happened today, and where
// time goes between stages.
export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState([])
  const [logs, setLogs] = useState([])
  const [history, setHistory] = useState([])
  const [samples, setSamples] = useState([])
  const [jobs, setJobs] = useState([])

  useEffect(() => {
    (async () => {
      const since30 = new Date(Date.now() - 30 * 86400000).toISOString()
      const since90 = new Date(Date.now() - 90 * 86400000).toISOString()
      const [p, l, h, s, j] = await Promise.all([
        supabase.from('products').select('id, name, po_number, stage, status, due_date, cover_photo_url, brands(name), product_sizes(quantity)'),
        supabase.from('work_logs').select('id, product_id, employee_id, work_type, quantity, rejected_qty, reject_reason, responsible_employee_id, logged_at, products(name, cover_photo_url), employees!work_logs_employee_id_fkey(name)').gte('logged_at', since30).order('logged_at', { ascending: false }),
        supabase.from('stage_history').select('product_id, stage, changed_at').gte('changed_at', since90).order('changed_at'),
        supabase.from('sample_versions').select('id, product_id, version_number, created_at, status, products(name)').eq('status', 'pending'),
        supabase.from('job_work').select('id, qty_sent, qty_returned, qty_rejected, expected_back, work_type, vendors(name), products(name)'),
      ])
      setProducts(p.data || []); setLogs(l.data || []); setHistory(h.data || []); setSamples(s.data || []); setJobs(j.data || [])
      setLoading(false)
    })()
  }, [])

  const today = todayISO()
  const active = products.filter(p => !isDone(p) && p.status !== 'on_hold')
  const withStatus = active.map(p => ({ ...p, ds: deliveryStatus(p) }))
  const late = withStatus.filter(p => p.ds?.key === 'late').sort((a, b) => a.due_date.localeCompare(b.due_date))
  const risk = withStatus.filter(p => p.ds?.key === 'risk')
  const dueWeek = withStatus.filter(p => p.due_date && p.due_date >= today && p.due_date <= addDays(today, 7)).sort((a, b) => a.due_date.localeCompare(b.due_date))
  const noDate = active.filter(p => !p.due_date)
  const todayLogs = logs.filter(l => new Date(l.logged_at).toDateString() === new Date().toDateString())
  const todayByType = {}; todayLogs.forEach(l => { todayByType[l.work_type] = (todayByType[l.work_type] || 0) + (Number(l.quantity) || 0) })
  const rejectedToday = todayLogs.reduce((s, l) => s + (Number(l.rejected_qty) || 0), 0)
  const staleSamples = samples.filter(s => daysBetween((s.created_at || '').slice(0, 10), today) >= 7)
  const jobsOut = jobs.filter(j => j.qty_sent - j.qty_returned - j.qty_rejected > 0)
  const jobsLate = jobsOut.filter(j => j.expected_back && j.expected_back < today)
  const queued = pendingCount()

  // Average days spent in each stage (last 90 days of moves).
  const leadTimes = useMemo(() => {
    const by = {}; history.forEach(h => { (by[h.product_id] ||= []).push(h) })
    const acc = {}
    Object.values(by).forEach(rows => rows.forEach((h, i) => {
      const next = rows[i + 1]; if (!next) return
      const d = (new Date(next.changed_at) - new Date(h.changed_at)) / 86400000
      ;(acc[h.stage] ||= []).push(d)
    }))
    return STAGES.filter(s => s.key !== 'packed').map(s => ({ ...s, avg: acc[s.key]?.length ? acc[s.key].reduce((a, b) => a + b, 0) / acc[s.key].length : null, n: acc[s.key]?.length || 0 }))
  }, [history])

  // QC: rejection rate by the person whose work it was (last 30 days).
  const qcByPerson = useMemo(() => {
    const m = {}
    logs.filter(l => l.work_type === 'qc' && l.rejected_qty && l.responsible_employee_id).forEach(l => { m[l.responsible_employee_id] = (m[l.responsible_employee_id] || 0) + Number(l.rejected_qty) })
    const made = {}
    logs.filter(l => ['stitching', 'embroidery', 'screen_printing'].includes(l.work_type)).forEach(l => { made[l.employee_id] = (made[l.employee_id] || 0) + Number(l.quantity || 0) })
    const names = Object.fromEntries(logs.filter(l => l.employee_id).map(l => [l.employee_id, l.employees?.name]))
    return Object.entries(m).map(([id, r]) => ({ id, name: names[id] || 'Unknown', rejected: r, made: made[id] || 0, rate: made[id] ? r / made[id] : null })).sort((a, b) => b.rejected - a.rejected).slice(0, 5)
  }, [logs])

  const stageCounts = Object.fromEntries(STAGES.map(s => [s.key, active.filter(p => (p.stage || 'cutting') === s.key).length]))

  if (loading) return <p className="text-gray-500 text-center py-10">Loading…</p>

  const attention = [
    late.length && { tone: 'red', text: `${late.length} order${late.length === 1 ? '' : 's'} past delivery date`, to: '/orders?view=late' },
    risk.length && { tone: 'amber', text: `${risk.length} due within 5 days but not yet in stitching`, to: '/orders?view=risk' },
    jobsLate.length && { tone: 'amber', text: `${jobsLate.length} job-work batch${jobsLate.length === 1 ? '' : 'es'} overdue from vendors`, to: '/jobwork' },
    staleSamples.length && { tone: 'blue', text: `${staleSamples.length} sample${staleSamples.length === 1 ? '' : 's'} waiting 7+ days for approval`, to: `/products/${staleSamples[0].product_id}` },
    noDate.length && { tone: 'gray', text: `${noDate.length} active order${noDate.length === 1 ? ' has' : 's have'} no delivery date`, to: '/orders?view=nodate' },
    queued && { tone: 'amber', text: `${queued} work log${queued === 1 ? '' : 's'} saved offline on this phone, not sent yet`, to: '/worklog' },
  ].filter(Boolean)
  const toneDot = { red: 'bg-red-500', amber: 'bg-amber-500', blue: 'bg-blue-500', gray: 'bg-gray-500' }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-100">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}{user?.name && user.name !== 'Admin' ? `, ${user.name.split(' ')[0]}` : ''}</h2>
          <p className="text-xs text-gray-500">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to="/worklog" className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-3 py-2 text-xs font-semibold">+ Log work</Link>
          {can(user, 'create_orders') && <Link to="/orders/new" className="bg-gray-800 border border-gray-700 text-gray-200 rounded-xl px-3 py-2 text-xs font-semibold">+ New order</Link>}
          {can(user, 'manage_materials') && <Link to="/materials" className="bg-gray-800 border border-gray-700 text-gray-200 rounded-xl px-3 py-2 text-xs font-semibold">Fabric &amp; trims</Link>}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card label="Active orders" value={active.length} sub={`${products.length - active.length} done / on hold`} onClick={() => navigate('/orders')} />
        <Card label="Late" value={late.length} sub={late[0] ? `oldest: ${fmtDay(late[0].due_date)}` : 'none 🎉'} tone={late.length ? 'text-red-400' : 'text-emerald-400'} onClick={() => navigate('/orders?view=late')} />
        <Card label="Due in 7 days" value={dueWeek.length} sub={`${risk.length} at risk`} tone={risk.length ? 'text-amber-300' : ''} onClick={() => navigate('/orders?view=week')} />
        <Card label="Pieces today" value={Object.values(todayByType).reduce((a, b) => a + b, 0)} sub={rejectedToday ? `❌ ${rejectedToday} rejected` : `${todayLogs.length} entries`} onClick={() => navigate('/worklog')} />
      </div>

      {attention.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <p className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-2">Needs attention</p>
          {attention.map((a, i) => (
            <Link key={i} to={a.to} className="flex items-center gap-2.5 py-2 border-t border-gray-800 first:border-0 text-sm text-gray-200 hover:text-white">
              <span className={`w-2 h-2 rounded-full ${toneDot[a.tone]}`} /> <span className="flex-1">{a.text}</span> <span className="text-gray-500">→</span>
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <p className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-3">Due soon</p>
          {[...late, ...dueWeek.filter(p => !late.includes(p))].slice(0, 8).map(p => (
            <Link key={p.id} to={`/products/${p.id}`} className="flex items-center gap-3 py-1.5">
              <div className="w-9 h-9 rounded-lg bg-gray-800 overflow-hidden flex-shrink-0">{p.cover_photo_url && <img src={p.cover_photo_url} alt="" className="w-full h-full object-cover" />}</div>
              <div className="flex-1 min-w-0"><p className="text-sm text-gray-100 truncate">{p.name}</p><p className="text-[11px] text-gray-500 truncate">{p.po_number || p.brands?.name} · {stageInfo(p.stage).label}</p></div>
              {p.ds && <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold whitespace-nowrap ${p.ds.cls}`}>{p.ds.text}</span>}
            </Link>
          ))}
          {!late.length && !dueWeek.length && <p className="text-xs text-gray-500">Nothing due in the next 7 days.</p>}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <p className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-3">Pipeline</p>
          <div className="flex gap-1.5">
            {STAGES.map(s => (
              <Link key={s.key} to={`/orders?stage=${s.key}`} className={`flex-1 rounded-xl p-2 text-center ${s.color}`}>
                <p className="text-lg font-black">{stageCounts[s.key]}</p><p className="text-[10px] leading-tight">{s.label}</p>
              </Link>
            ))}
          </div>
          <p className="text-[11px] uppercase font-bold text-gray-500 tracking-wider mt-4 mb-1.5">Average days per stage (90 days)</p>
          {leadTimes.map(s => (
            <div key={s.key} className="flex items-center gap-2 text-xs py-0.5">
              <span className="w-32 text-gray-400">{s.label}</span>
              <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-brand-500" style={{ width: `${Math.min(100, ((s.avg || 0) / Math.max(1, ...leadTimes.map(x => x.avg || 0))) * 100)}%` }} /></div>
              <span className="w-16 text-right text-gray-200 font-mono">{s.avg == null ? '—' : `${s.avg.toFixed(1)}d`}</span>
            </div>
          ))}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <p className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-2">Today</p>
          {Object.keys(todayByType).length > 0 && <div className="flex flex-wrap gap-1.5 mb-3">{Object.entries(todayByType).map(([k, v]) => <span key={k} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-200">{WORK_TYPE_LABEL[k] || k} <b>{v}</b></span>)}</div>}
          {todayLogs.slice(0, 8).map(l => (
            <div key={l.id} className="flex items-center gap-2 py-1 text-xs">
              <span className="text-gray-500 w-12">{new Date(l.logged_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
              <span className="text-gray-200 flex-1 truncate">{l.employees?.name || '—'} · {WORK_TYPE_LABEL[l.work_type] || l.work_type}{l.quantity ? ` ${l.quantity}` : ''}{l.rejected_qty ? ` (❌${l.rejected_qty})` : ''} · <span className="text-gray-400">{l.products?.name}</span></span>
            </div>
          ))}
          {todayLogs.length === 0 && <p className="text-xs text-gray-500">No work logged yet today.</p>}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <p className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-2">QC rejections by maker (30 days)</p>
          {qcByPerson.map(r => (
            <div key={r.id} className="flex justify-between text-xs py-1 border-t border-gray-800 first:border-0">
              <span className="text-gray-200">{r.name}</span>
              <span className="text-gray-300 font-mono">{r.rejected} pcs{r.rate != null && <span className={r.rate > 0.05 ? 'text-red-400' : 'text-gray-500'}> · {(r.rate * 100).toFixed(1)}% of {r.made}</span>}</span>
            </div>
          ))}
          {qcByPerson.length === 0 && <p className="text-xs text-gray-500">No rejections recorded against anyone. Log QC with “whose work was it” to see this.</p>}
          {jobsOut.length > 0 && <p className="text-xs text-gray-400 mt-3">🏭 {jobsOut.reduce((s, j) => s + j.qty_sent - j.qty_returned - j.qty_rejected, 0)} pcs out with job-work vendors · <Link to="/jobwork" className="text-brand-400">view</Link></p>}
        </div>
      </div>
    </div>
  )
}

function Card({ label, value, sub, tone = '', onClick }) {
  return (
    <button onClick={onClick} className="text-left bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-2xl p-3">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">{label}</p>
      <p className={`text-2xl font-black text-gray-100 ${tone}`}>{value}</p>
      <p className="text-[11px] text-gray-500 truncate">{sub}</p>
    </button>
  )
}
