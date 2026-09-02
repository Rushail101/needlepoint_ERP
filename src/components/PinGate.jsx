import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../supabaseClient.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('np_user')
    return saved ? JSON.parse(saved) : null
  })

  const loginWithPin = async (pinInput) => {
    const cleanPin = String(pinInput).trim()
    const { data, error } = await supabase
      .from('access_pins')
      .select('*, employees(*)')
      .eq('pin', cleanPin)
      .eq('active', true)
      .single()

    if (error || !data) {
      throw new Error('Invalid or inactive PIN')
    }

    const userData = {
      id: data.id,
      name: data.name,
      role: data.role.toLowerCase(), // 'admin' or 'floor_manager'
      employeeId: data.employee_id,
    }

    setUser(userData)
    localStorage.setItem('np_user', JSON.stringify(userData))
    return userData
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('np_user')
  }

  return (
    <AuthContext.Provider value={{ user, loginWithPin, logout }}>
      {user ? children : <PinLoginScreen onLogin={loginWithPin} />}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

function PinLoginScreen({ onLogin }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleDigit = (digit) => {
    if (pin.length < 6) setPin(prev => prev + digit)
  }

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1))
  }

  const handleEnter = async () => {
    if (!pin) return
    setLoading(true)
    setError('')
    try {
      await onLogin(pin)
    } catch (err) {
      setError(err.message)
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-xs bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl text-center">
        <h1 className="text-xl font-bold text-gray-100 mb-1">Needle Point</h1>
        <p className="text-xs text-gray-400 mb-6">Enter PIN to Unlock</p>

        {/* PIN Indicators */}
        <div className="flex justify-center gap-3 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-3.5 h-3.5 rounded-full border transition-all ${
                pin.length > i
                  ? 'bg-brand-500 border-brand-500 scale-110'
                  : 'border-gray-700 bg-gray-800'
              }`}
            />
          ))}
        </div>

        {error && <p className="text-xs text-red-400 mb-4">{error}</p>}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-2.5 mb-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-14 rounded-2xl bg-gray-800/80 hover:bg-gray-700 active:scale-95 text-xl font-semibold text-gray-100 transition"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPin('')}
            className="h-14 rounded-2xl bg-gray-800/40 hover:bg-gray-700/60 text-xs font-semibold text-gray-400 transition"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-14 rounded-2xl bg-gray-800/80 hover:bg-gray-700 active:scale-95 text-xl font-semibold text-gray-100 transition"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            className="h-14 rounded-2xl bg-gray-800/40 hover:bg-gray-700/60 text-lg text-gray-300 transition"
          >
            ⌫
          </button>
        </div>

        <button
          type="button"
          onClick={handleEnter}
          disabled={loading || pin.length === 0}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white font-bold py-3.5 rounded-xl transition"
        >
          {loading ? 'Verifying...' : 'Unlock'}
        </button>
      </div>
    </div>
  )
}

// Alias AuthProvider as PinGate for backwards compatibility with App.jsx
export function PinGate({ children }) {
  return <AuthProvider>{children}</AuthProvider>
}

export default PinGate
