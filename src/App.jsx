import { useEffect, useState } from 'react'
import TelegramConnect from './components/TelegramConnect.jsx'
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import PinGate, { useAuth } from './components/PinGate.jsx'
import Modal, { inputClass, labelClass } from './components/Modal.jsx'
import Toaster, { toast } from './components/Toast.jsx'
import { supabase } from './supabaseClient.js'
import { can } from './permissions.js'
import { flushQueue } from './offlineQueue.js'

import Dashboard from './pages/Dashboard.jsx'
import Orders from './pages/Orders.jsx'
import NewOrder from './pages/NewOrder.jsx'
import ProductDetail from './pages/ProductDetail.jsx'
import GarmentCatalog from './pages/GarmentCatalog.jsx'
import Brands from './pages/Brands.jsx'
import Employees from './pages/Employees.jsx'
import EmployeeSummary from './pages/EmployeeSummary.jsx'
import WorkLog from './pages/WorkLog.jsx'
import Access from './pages/Access.jsx'
import Materials from './pages/Materials.jsx'
import JobWork from './pages/JobWork.jsx'
import Settings from './pages/Settings.jsx'

// `need` is the permission that shows the item; `main` puts it in the phone's bottom bar.
const NAV = [
  { to: '/', label: 'Home', icon: '🏠', need: 'view_dashboard', main: true, exact: true },
  { to: '/orders', label: 'Orders', icon: '📦', need: 'view_orders', main: true },
  { to: '/worklog', label: 'Log Work', icon: '📋', need: 'log_work', main: true },
  { to: '/materials', label: 'Fabric', icon: '🧶', need: 'manage_materials', main: true },
  { to: '/jobwork', label: 'Job Work', icon: '🏭', need: 'manage_job_work' },
  { to: '/garments', label: 'Catalog', icon: '👕', need: 'manage_garment_catalog' },
  { to: '/employees', label: 'Team', icon: '👥', need: 'view_team' },
  { to: '/brands', label: 'Brands', icon: '🏷️', need: 'view_brands' },
  { to: '/access', label: 'Access', icon: '🔑', need: 'manage_pins' },
  { to: '/settings', label: 'Settings', icon: '⚙️', need: 'manage_pins' },
]

function ClientSecurityModal({ user, onClose }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const handleUpdate = async (e) => {
    e.preventDefault()
    setMsg('')
    if (next.length < 6) { setMsg('Use at least 6 characters.'); return }
    if (next !== confirmPw) { setMsg('The two new passwords don\'t match.'); return }
    setSaving(true)
    try {
      const { error } = await supabase.rpc('ops_set_portal_password', { p_brand_id: user.brandId, p_password: next, p_current: current })
      if (error) throw error
      toast('Password changed', 'success')
      onClose()
    } catch (err) {
      setMsg(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <h3 className="text-lg font-bold text-gray-100 mb-1">Change portal password</h3>
      <p className="text-xs text-gray-400 mb-4">{user.name}</p>
      <form onSubmit={handleUpdate}>
        <label className={labelClass}>Current password</label>
        <input type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} className={inputClass} />
        <label className={labelClass}>New password</label>
        <input type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} className={inputClass} />
        <label className={labelClass}>New password again</label>
        <input type="password" autoComplete="new-password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className={inputClass} />
        {msg && <p className="text-xs text-red-400 mb-2">{msg}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-800 text-gray-300 rounded-xl text-xs font-semibold">Cancel</button>
          <button type="submit" disabled={saving || !current || !next} className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-bold disabled:opacity-50">{saving ? 'Saving…' : 'Change password'}</button>
        </div>
      </form>
    </Modal>
  )
}

function MainShell() {
  const { user, logout } = useAuth()
  const isClient = user?.role === 'client'
  const [showSecurity, setShowSecurity] = useState(false)
  const [showTelegram, setShowTelegram] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()

  // Anything that fails without its own handler still gets reported.
  useEffect(() => {
    const onRej = e => toast(e?.reason?.message || 'Something went wrong', 'error')
    window.addEventListener('unhandledrejection', onRej)
    flushQueue().then(n => { if (n) toast(`${n} work log${n === 1 ? '' : 's'} saved offline were sent`, 'success') })
    return () => window.removeEventListener('unhandledrejection', onRej)
  }, [])
  useEffect(() => { setMoreOpen(false) }, [location.pathname])

  const items = isClient
    ? [{ to: '/orders', label: 'My Orders', icon: '📦', main: true }, { to: '/garments', label: 'Styles', icon: '👕', main: true }]
    : NAV.filter(n => can(user, n.need))
  const mainItems = items.filter(n => n.main)
  const moreItems = items.filter(n => !n.main)
  const home = can(user, 'view_dashboard') ? <Dashboard /> : <Navigate to={isClient ? '/orders' : can(user, 'log_work') ? '/worklog' : '/orders'} replace />
  const linkCls = ({ isActive }) => `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${isActive ? 'bg-brand-600 text-white shadow' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'}`

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <header className="border-b border-gray-800 bg-gray-900/90 backdrop-blur sticky top-0 z-40 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-black text-brand-500 text-lg tracking-tight">Needle Point</span>
            {isClient && <span className="text-[10px] bg-brand-950 text-brand-300 border border-brand-800 px-2 py-0.5 rounded-full font-semibold truncate">Client portal · {user.name}</span>}
          </div>
          <div className="flex items-center gap-3">
            {isClient && <button onClick={() => setShowSecurity(true)} className="text-xs text-gray-400 hover:text-gray-200">🔑 Password</button>}
            {!isClient && <button onClick={() => setShowTelegram(true)} className="text-xs text-gray-400 hover:text-[#5bbfef] font-semibold" title="Log work and update orders from Telegram">📲 Telegram</button>}
            {!isClient && <span className="text-xs text-gray-400 font-medium hidden sm:inline">{user?.name}</span>}
            <button onClick={logout} className="text-xs text-gray-400 hover:text-red-400 underline transition">Log out</button>
          </div>
        </div>
        <nav className="hidden sm:flex max-w-7xl mx-auto pt-2.5 items-center gap-1.5 overflow-x-auto" aria-label="Main">
          {items.map(item => (
            <NavLink key={item.to} to={item.to} end={item.exact} className={linkCls}><span>{item.icon}</span><span>{item.label}</span></NavLink>
          ))}
        </nav>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 pb-24 sm:pb-6">
        <Routes>
          <Route path="/" element={isClient ? <Navigate to="/orders" replace /> : home} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/new" element={<NewOrder />} />
          <Route path="/products/:id" element={<ProductDetail />} />
          <Route path="/garments" element={<GarmentCatalog />} />
          {!isClient && (
            <>
              {can(user, 'log_work') && <Route path="/worklog" element={<WorkLog />} />}
              {can(user, 'manage_materials') && <Route path="/materials" element={<Materials />} />}
              {can(user, 'manage_job_work') && <Route path="/jobwork" element={<JobWork />} />}
              {can(user, 'view_brands') && <Route path="/brands" element={<Brands />} />}
              {can(user, 'view_team') && <Route path="/employees" element={<Employees />} />}
              {can(user, 'view_team') && <Route path="/employees/:id" element={<EmployeeSummary />} />}
              {can(user, 'manage_pins') && <Route path="/access" element={<Access />} />}
              {can(user, 'manage_pins') && <Route path="/settings" element={<Settings />} />}
            </>
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Phone: bottom bar with the main screens + "More" */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur-lg border-t border-gray-800 px-2 py-1.5 flex items-center justify-around shadow-2xl" aria-label="Main">
        {mainItems.map(item => (
          <NavLink key={item.to} to={item.to} end={item.exact}
            className={({ isActive }) => `flex flex-col items-center justify-center flex-1 py-1 transition ${isActive ? 'text-brand-500 font-bold' : 'text-gray-400'}`}>
            <span className="text-lg leading-none mb-1">{item.icon}</span>
            <span className="text-[10px] tracking-tight truncate">{item.label}</span>
          </NavLink>
        ))}
        {moreItems.length > 0 && (
          <button onClick={() => setMoreOpen(true)} className="flex flex-col items-center justify-center flex-1 py-1 text-gray-400">
            <span className="text-lg leading-none mb-1">☰</span><span className="text-[10px]">More</span>
          </button>
        )}
      </nav>
      {moreOpen && (
        <Modal onClose={() => setMoreOpen(false)}>
          <div className="grid grid-cols-3 gap-2 pt-6">
            {moreItems.map(item => (
              <NavLink key={item.to} to={item.to} className="bg-gray-950 border border-gray-800 rounded-xl py-4 flex flex-col items-center gap-1.5 text-gray-200">
                <span className="text-2xl">{item.icon}</span><span className="text-xs font-semibold">{item.label}</span>
              </NavLink>
            ))}
          </div>
        </Modal>
      )}

      {showTelegram && <TelegramConnect user={user} onClose={() => setShowTelegram(false)} />}
      {showSecurity && <ClientSecurityModal user={user} onClose={() => setShowSecurity(false)} />}
      <Toaster />
    </div>
  )
}

export default function App() {
  return (
    <PinGate>
      <MainShell />
    </PinGate>
  )
}
