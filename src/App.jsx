import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import PinGate, { useAuth } from './components/PinGate.jsx'
// OR if using named import:
// import { PinGate, useAuth } from './components/PinGate.jsx'
import Orders from './pages/Orders.jsx'
import { can } from './permissions.js'
import ProductDetail from './pages/ProductDetail.jsx'
import NewOrder from './pages/NewOrder.jsx'
import GarmentCatalog from './pages/GarmentCatalog.jsx'
import Brands from './pages/Brands.jsx'
import Employees from './pages/Employees.jsx'
import EmployeeSummary from './pages/EmployeeSummary.jsx'
import WorkLog from './pages/WorkLog.jsx'
import Access from './pages/Access.jsx'
import { can } from './permissions.js'

const navItems = [
  { to: '/', label: 'Orders', icon: '📦' }, // everyone can view orders
  { to: '/garments', label: 'Garments', icon: '👕' }, // everyone can view the catalog
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
            `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              isActive
                ? 'bg-brand-600 text-white'
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

// Wraps a route so visiting the URL directly (not just hiding the nav tab) is also blocked.
function Guard({ need, children }) {
  const { user } = useAuth()
  if (need && !can(user, need)) return <Navigate to="/" replace />
  return children
}

function Shell() {
  const { user, logout } = useAuth()
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 pb-20 sm:pb-0">
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-brand-500">Needle Point</h1>
        {user?.name && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{user.name}</span>
            <button onClick={logout} className="text-xs text-gray-500 underline">Logout</button>
          </div>
        )}
      </header>
      <Nav user={user} />
      <main className="max-w-5xl mx-auto p-4">
        <Routes>
          <Route path="/" element={<Orders />} />
          <Route path="/orders/new" element={<Guard need="edit_garments"><NewOrder /></Guard>} />
          <Route path="/products/:id" element={<ProductDetail />} />
          <Route path="/garments" element={<GarmentCatalog />} />
          <Route path="/brands" element={<Guard need="view_brands"><Brands /></Guard>} />
          <Route path="/employees" element={<Guard need="view_team"><Employees /></Guard>} />
          <Route path="/employees/:id" element={<Guard need="view_team"><EmployeeSummary /></Guard>} />
          <Route path="/worklog" element={<Guard need="manage_work_logs"><WorkLog /></Guard>} />
          <Route path="/access" element={<Guard need="view_access"><Access /></Guard>} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <PinGate>
      <Shell />
    </PinGate>
  )
}
