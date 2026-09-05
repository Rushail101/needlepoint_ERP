// Inside Layout.jsx:
import { useAuth } from './PinGate.jsx'

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const isClient = user?.role === 'client'

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <header className="border-b border-gray-800 bg-gray-900/60 backdrop-blur sticky top-0 z-40 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-black text-brand-500 text-lg tracking-tight">Needle Point</span>
            {isClient && (
              <span className="text-[11px] bg-brand-950 text-brand-300 border border-brand-800/80 px-2 py-0.5 rounded-full font-semibold">
                Client Portal · {user.name}
              </span>
            )}
          </div>

          <nav className="flex items-center gap-4 text-xs font-semibold">
            <NavLink to="/orders" className={({ isActive }) => isActive ? 'text-brand-400' : 'text-gray-400 hover:text-gray-200'}>
              Orders
            </NavLink>
            <NavLink to="/garments" className={({ isActive }) => isActive ? 'text-brand-400' : 'text-gray-400 hover:text-gray-200'}>
              Garments
            </NavLink>

            {/* Hidden from clients */}
            {!isClient && (
              <>
                <NavLink to="/brands" className={({ isActive }) => isActive ? 'text-brand-400' : 'text-gray-400 hover:text-gray-200'}>
                  Brands
                </NavLink>
                <NavLink to="/team" className={({ isActive }) => isActive ? 'text-brand-400' : 'text-gray-400 hover:text-gray-200'}>
                  Team
                </NavLink>
                <NavLink to="/work-log" className={({ isActive }) => isActive ? 'text-brand-400' : 'text-gray-400 hover:text-gray-200'}>
                  Work Log
                </NavLink>
                <NavLink to="/access" className={({ isActive }) => isActive ? 'text-brand-400' : 'text-gray-400 hover:text-gray-200'}>
                  Access
                </NavLink>
              </>
            )}

            <button
              onClick={logout}
              className="text-gray-500 hover:text-red-400 ml-2 border-l border-gray-800 pl-3"
            >
              Logout ({user.name})
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto p-4">{children}</main>
    </div>
  )
}
