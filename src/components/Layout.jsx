import { NavLink } from 'react-router-dom'
import { useAuth } from './PinGate.jsx'

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const role = (user?.role || '').toLowerCase()
  const isClient = role === 'client'

  const navClass = ({ isActive }) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-xs transition ${
      isActive
        ? 'bg-brand-600 text-white'
        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
    }`

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Top Header */}
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

        {/* Navigation Tabs Bar */}
        <div className="max-w-7xl mx-auto flex items-center gap-1 overflow-x-auto pt-2 pb-0.5">
          <NavLink to="/orders" className={navClass}>
            <span>📦</span>
            <span>Orders</span>
          </NavLink>

          <NavLink to="/garments" className={navClass}>
            <span>👕</span>
            <span>Garments</span>
          </NavLink>

          {/* Admin & Staff Only Links */}
          {!isClient && (
            <>
              <NavLink to="/brands" className={navClass}>
                <span>🏷️</span>
                <span>Brands</span>
              </NavLink>

              <NavLink to="/team" className={navClass}>
                <span>👥</span>
                <span>Employees</span>
              </NavLink>

              <NavLink to="/work-log" className={navClass}>
                <span>📋</span>
                <span>Work Log</span>
              </NavLink>

              <NavLink to="/access" className={navClass}>
                <span>🔑</span>
                <span>Access Pins</span>
              </NavLink>
            </>
          )}
        </div>
      </header>

      {/* Main App Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {children}
      </main>
    </div>
  )
}
