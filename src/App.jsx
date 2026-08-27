import { Routes, Route, NavLink } from 'react-router-dom'
import PinGate from './components/PinGate.jsx'
import Products from './pages/Products.jsx'
import ProductDetail from './pages/ProductDetail.jsx'
import Brands from './pages/Brands.jsx'
import Employees from './pages/Employees.jsx'
import WorkLog from './pages/WorkLog.jsx'

const navItems = [
  { to: '/', label: 'Garments', icon: '👕' },
  { to: '/brands', label: 'Brands', icon: '🏷️' },
  { to: '/employees', label: 'Team', icon: '👥' },
  { to: '/worklog', label: 'Work Log', icon: '📋' },
]

function Nav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 flex justify-around py-2 sm:static sm:border-t-0 sm:border-b sm:py-0 sm:px-6 z-20">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            `flex flex-col sm:flex-row items-center gap-0 sm:gap-2 px-3 py-2 sm:py-4 text-xs sm:text-sm font-medium rounded-lg ${
              isActive ? 'text-brand-500' : 'text-gray-500'
            }`
          }
        >
          <span className="text-xl sm:text-base">{item.icon}</span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export default function App() {
  return (
    <PinGate>
      <div className="min-h-screen bg-gray-950 text-gray-100 pb-20 sm:pb-0">
        <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-brand-500">Needle Point</h1>
        </header>
        <Nav />
        <main className="max-w-5xl mx-auto p-4">
          <Routes>
            <Route path="/" element={<Products />} />
            <Route path="/products/:id" element={<ProductDetail />} />
            <Route path="/brands" element={<Brands />} />
            <Route path="/employees" element={<Employees />} />
            <Route path="/worklog" element={<WorkLog />} />
          </Routes>
        </main>
      </div>
    </PinGate>
  )
}
