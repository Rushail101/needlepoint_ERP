import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import PinGate, { useAuth } from './components/PinGate.jsx'
import { can } from './permissions.js'

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
  { to: '/brands', label: 'Brands', icon: '🏷️', need: 'view_brands' },
  { to: '/employees', label: 'Team', icon: '👥', need: 'view_team' },
  { to: '/worklog', label: 'Work Log', icon: '📋', need: 'manage_work_logs' },
  { to: '/access', label: 'Access', icon: '🔑', need: 'view_access' },
]

function Nav({ user }) {
  const visibleItems = navItems.filter((item) => {
    if (!item.need) return true
    return can(user, item.need)
  })

  return (
    <div className="flex items-center gap-1 overflow-x-auto">
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
  )
}

function MainShell() {
  const { user, logout } = useAuth()
  const isClient = String(user?.role).toLowerCase() === 'client'

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-40 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-black text-brand-500 text-base tracking-tight">Needle Point</span>
            {isClient && (
              <span className="text-[10px] bg-brand-950 text-brand-300 border border-brand-800 px-2 py-0.5 rounded-full font-semibold">
                Client Portal · {user.name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{user?.name || 'User'}</span>
            <button
              onClick={logout}
              className="text-xs text-gray-400 hover:text-red-400 underline transition"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto pt-2 pb-0.5">
          <Nav user={user} />
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        <Routes>
          <Route path="/" element={<Navigate to="/orders" replace />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/new" element={<NewOrder />} />
          <Route path="/products/:id" element={<ProductDetail />} />
          <Route path="/garments" element={<GarmentCatalog />} />

          {/* Admin & Manager Only Routes */}
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
