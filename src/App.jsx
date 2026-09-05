import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import PinGate, { useAuth } from './components/PinGate.jsx'

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

function MainShell() {
  const { user, logout } = useAuth()
  const isClient = String(user?.role || '').toLowerCase() === 'client'

  // Clients only see Orders & Garments; Staff/Admin gets the complete set
  const visibleItems = isClient
    ? navItems.filter((item) => item.to === '/orders' || item.to === '/garments')
    : navItems

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Top Bar (App Header) */}
      <header className="border-b border-gray-800 bg-gray-900/90 backdrop-blur sticky top-0 z-40 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-black text-brand-500 text-lg tracking-tight">Needle Point</span>
            {isClient && (
              <span className="text-[10px] bg-brand-950 text-brand-300 border border-brand-800 px-2 py-0.5 rounded-full font-semibold">
                Client Portal · {user.name}
              </span>
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

        {/* Desktop Navigation (Hidden on Mobile) */}
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

      {/* Main Content Area (pb-20 on mobile prevents content from hiding behind bottom nav) */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 pb-24 sm:pb-6">
        <Routes>
          <Route path="/" element={<Navigate to="/orders" replace />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/new" element={<NewOrder />} />
          <Route path="/products/:id" element={<ProductDetail />} />
          <Route path="/garments" element={<GarmentCatalog />} />

          {/* Admin & Staff Only Routes */}
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

      {/* Instagram-Style Native Mobile Bottom Bar (Fixed at bottom on phones) */}
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
      </nav>
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
