import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { STAGES, stageInfo } from '../stages.js'

const STATUS_LABEL = {
  in_production: { text: 'In Production', color: 'bg-blue-900/50 text-blue-300' },
  sampling: { text: 'Sampling', color: 'bg-yellow-900/50 text-yellow-300' },
  completed: { text: 'Completed', color: 'bg-green-900/50 text-green-300' },
  on_hold: { text: 'On Hold', color: 'bg-gray-800 text-gray-400' },
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [statusCounts, setStatusCounts] = useState({})
  const [stageCounts, setStageCounts] = useState({})
  const [todayLogs, setTodayLogs] = useState([])
  const [stalePending, setStalePending] = useState([])
  const [totalGarments, setTotalGarments] = useState(0)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data: products } = await supabase.from('products').select('id, status, stage')
      const { data: logs } = await supabase
        .from('work_logs')
        .select('*, products(name, cover_photo_url), employees(name)')
        .order('logged_at', { ascending: false })

      const sc = {}, tc = {}
      ;(products || []).forEach(p => {
        sc[p.status] = (sc[p.status] || 0) + 1
        tc[p.stage || 'cutting'] = (tc[p.stage || 'cutting'] || 0) + 1
      })
      setStatusCounts(sc)
      setStageCounts(tc)
      setTotalGarments((products || []).length)

      const todayStr = new Date().toDateString()
      setTodayLogs((logs || []).filter(l => new Date(l.logged_at).toDateString() === todayStr))

      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      const { data: samples } = await supabase
        .from('sample_versions')
        .select('*, products(name, cover_photo_url)')
        .eq('status', 'pending')
      setStalePending((samples || []).filter(s => new Date(s.created_at).getTime() < sevenDaysAgo))

      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <p className="text-gray-500 text-center py-10">Loading...</p>

  return (
    <div>
      <h2 className="text-xl font-bold mb-4 text-gray-100">Dashboard</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Garments" value={totalGarments} />
        <StatCard label="Logged Today" value={todayLogs.length} />
        <StatCard label="Pending Samples (7+ days)" value={stalePending.length} warn={stalePending.length > 0} />
        <StatCard label="In Production" value={statusCounts.in_production || 0} />
      </div>

      <Section title="By Status">
        <div className="flex flex-wrap gap-2">
          {Object.entries(STATUS_LABEL).map(([key, s]) => (
            <span key={key} className={`text-xs px-3 py-1.5 rounded-full ${s.color}`}>
              {s.text}: {statusCounts[key] || 0}
            </span>
          ))}
        </div>
      </Section>

      <Section title="By Production Stage">
        <div className="flex flex-wrap gap-2">
          {STAGES.map(s => (
            <span key={s.key} className={`text-xs px-3 py-1.5 rounded-full ${s.color}`}>
              {s.label}: {stageCounts[s.key] || 0}
            </span>
          ))}
        </div>
      </Section>

      {stalePending.length > 0 && (
        <Section title="Samples Awaiting Decision (7+ days)">
          <div className="space-y-2">
            {stalePending.map(s => (
              <Link key={s.id} to={`/products/${s.product_id}`} className="flex items-center gap-3 bg-gray-900 border border-yellow-900/50 rounded-xl p-3">
                <div className="w-10 h-10 rounded-lg bg-gray-800 overflow-hidden flex-shrink-0">
                  {s.products?.cover_photo_url && <img src={s.products.cover_photo_url} className="w-full h-full object-cover" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate text-gray-100">{s.products?.name}</p>
                  <p className="text-xs text-gray-400">Version {s.version_number} · pending since {new Date(s.created_at).toLocaleDateString()}</p>
                </div>
              </Link>
            ))}
          </div>
        </Section>
      )}

      <Section title="Today's Activity">
        <div className="space-y-2">
          {todayLogs.map(l => (
            <div key={l.id} className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl p-3">
              <div className="w-10 h-10 rounded-lg bg-gray-800 overflow-hidden flex-shrink-0">
                {l.products?.cover_photo_url && <img src={l.products.cover_photo_url} className="w-full h-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate text-gray-100">{l.products?.name}</p>
                <p className="text-xs text-gray-400">{l.employees?.name || 'Unassigned'} {l.quantity ? `· ${l.quantity} pcs` : ''}</p>
              </div>
              <p className="text-[11px] text-gray-600 flex-shrink-0">{new Date(l.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          ))}
          {todayLogs.length === 0 && <p className="text-gray-500 text-sm">No work logged today yet.</p>}
        </div>
      </Section>
    </div>
  )
}

function StatCard({ label, value, warn }) {
  return (
    <div className={`bg-gray-900 border rounded-xl p-4 ${warn ? 'border-yellow-800' : 'border-gray-800'}`}>
      <p className={`text-2xl font-bold ${warn ? 'text-yellow-400' : 'text-gray-100'}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-bold text-gray-500 mb-2 uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  )
}
