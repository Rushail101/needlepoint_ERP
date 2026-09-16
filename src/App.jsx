import { useState } from 'react'
import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import PinGate, { useAuth } from './components/PinGate.jsx'
import Modal, { inputClass, labelClass } from './components/Modal.jsx'
import { supabase } from './supabaseClient.js'

import Orders from './pages/Orders.jsx'
import NewOrder from './pages/NewOrder.jsx'
import ProductDetail from './pages/ProductDetail.jsx'
import GarmentCatalog from './pages/GarmentCatalog.jsx'
import Brands from './pages/Brands.jsx'
import Employees from './pages/Employees.jsx'
import EmployeeSummary from './pages/EmployeeSummary.jsx'
import WorkLog from './pages/WorkLog.jsx'
import Access from './pages/Access.jsx'

const navItems = [
  { to: '/orders', label: 'Orders', icon: '📦' },
  { to: '/garments', label: 'Garments', icon: '👕' },
  { to: '/brands', label: 'Brands', icon: '🏷️' },
  { to: '/employees', label: 'Team', icon: '👥' },
  { to: '/worklog', label: 'Work Log', icon: '📋' },
  { to: '/access', label: 'Access', icon: '🔑' },
]

function ClientSecurityModal({ user, onClose }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // Load the current password from Supabase on mount
  useState(() => {
    supabase
      .from('brands')
      .select('portal_password')
      .eq('id', user.brandId)
      .single()
      .then(({ data }) => {
        if (data?.portal_password) setCurrentPassword(data.portal_password)
      })
  }, [user.brandId])

  const handleUpdate = async (e) => {
    e.preventDefault()
    setErrorMsg('')
    setStatusMsg('')

    if (!newPassword || newPassword.trim().length < 4) {
      setErrorMsg('New password must be at least 4 characters.')
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase
        .from('brands')
        .update({ portal_password: newPassword.trim() })
        .eq('id', user.brandId)

      if (error) throw error

      setCurrentPassword(newPassword.trim())
      setNewPassword('')
      setStatusMsg('Password updated successfully!')
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <h3 className="text-lg font-bold text-gray-100 mb-1">Brand Portal Security</h3>
      <p className="text-xs text-gray-400 mb-4">{user.name}</p>

      {/* View Current Password */}
      <div className="bg-gray-950 border border-gray-800 rounded-xl p-3 mb-4">
        <label className={labelClass}>Current Password</label>
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm text-brand-400 font-bold">
            {showPassword ? (currentPassword || 'None set') : '••••••••'}
          </span>
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="text-xs text-gray-400 hover:text-gray-200"
          >
            {showPassword ? '🙈 Hide' : '👁️ View'}
          </button>
        </div>
      </div>

      {/* Change Password Form */}
      <form onSubmit={handleUpdate} className="space-y-3">
        <div>
          <label className={labelClass}>Change Password</label>
          <input
            type="text"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Type new password"
            className={inputClass}
          />
        </div>

        {errorMsg && <p className="text-xs text-red-400 font-medium">{errorMsg}</p>}
        {statusMsg && <p className="text-xs text-emerald-400 font-medium">{statusMsg}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-800 text-gray-300 rounded-xl text-xs font-semibold"
          >
            Close
          </button>
          <button
            type="submit"
            disabled={saving || !newPassword}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-bold disabled:opacity-50"
          >
            {saving ? 'Updating...' : 'Save New Password'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function MainShell() {
  const { user, logout } = useAuth()
  const isClient = String(user?.role || '').toLowerCase() === 'client'
  const [showSecurity, setShowSecurity] = useState(false)

  const visibleItems = isClient
    ? navItems.filter((item) => item.to === '/orders' || item.to === '/garments')
    : navItems

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <header className="border-b border-gray-800 bg-gray-900/90 backdrop-blur sticky top-0 z-40 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-black text-brand-500 text-lg tracking-tight">Needle Point</span>
            {isClient && (
              <button
                onClick={() => setShowSecurity(true)}
                className="text-[10px] bg-brand-950 hover:bg-brand-900 text-brand-300 border border-brand-800 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 transition"
                title="View & manage password"
              >
                <span>🔑</span>
                <span>{user.name}</span>
                <span className="text-brand-500">⚙️</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 font-medium">{user?.name || 'User'}</span>
            <button
              onClick={logout}
              className="text-xs text-gray-400 hover:text-red-400 underline transition"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Desktop Nav */}
        <div className="hidden sm:flex max-w-7xl mx-auto pt-2.5 items-center gap-1.5 overflow-x-auto">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                  isActive
                    ? 'bg-brand-600 text-white shadow'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                }`
              }
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 pb-24 sm:pb-6">
        <Routes>
          <Route path="/" element={<Navigate to="/orders" replace />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/new" element={<NewOrder />} />
          <Route path="/products/:id" element={<ProductDetail />} />
          <Route path="/garments" element={<GarmentCatalog />} />

          {!isClient && (
            <>
              <Route path="/brands" element={<Brands />} />
              <Route path="/employees" element={<Employees />} />
              <Route path="/employees/:id" element={<EmployeeSummary />} />
              <Route path="/worklog" element={<WorkLog />} />
              <Route path="/access" element={<Access />} />
            </>
          )}

          <Route path="*" element={<Navigate to="/orders" replace />} />
        </Routes>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur-lg border-t border-gray-800 px-2 py-1.5 flex items-center justify-around shadow-2xl">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 py-1 transition ${
                isActive
                  ? 'text-brand-500 font-bold scale-105'
                  : 'text-gray-400 hover:text-gray-200 opacity-80'
              }`
            }
          >
            <span className="text-lg leading-none mb-1">{item.icon}</span>
            <span className="text-[10px] tracking-tight truncate">{item.label}</span>
          </NavLink>
        ))}
        {isClient && (
          <button
            onClick={() => setShowSecurity(true)}
            className="flex flex-col items-center justify-center flex-1 py-1 text-gray-400 hover:text-gray-200 opacity-80"
          >
            <span className="text-lg leading-none mb-1">🔑</span>
            <span className="text-[10px] tracking-tight">Security</span>
          </button>
        )}
      </nav>

      {showSecurity && <ClientSecurityModal user={user} onClose={() => setShowSecurity(false)} />}
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
