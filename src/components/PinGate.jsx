import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

const AuthContext = createContext({ user: null, logout: () => {} })
export function useAuth() {
  return useContext(AuthContext)
}

// The admin PIN(s) live in VITE_ADMIN_PIN (comma-separated if you want more than one admin).
// Everyone else (floor managers, workers) is created by the admin from the Access page,
// stored in the access_pins table, so new logins don't need a redeploy.
function adminPins() {
  const raw = import.meta.env.VITE_ADMIN_PIN
  if (!raw) return []
  return raw.split(',').map(p => p.trim()).filter(Boolean)
}

export default function PinGate({ children }) {
  const [user, setUser] = useState(adminPins().length === 0 ? { name: null, role: 'admin' } : null)
  const [checking, setChecking] = useState(adminPins().length > 0)
  const [entered, setEntered] = useState('')
  const [error, setError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Re-validate a saved login on load (for non-admins) so a PIN the admin has since
  // deactivated actually gets logged out, not just trusted from localStorage forever.
  useEffect(() => {
    const restore = async () => {
      const saved = localStorage.getItem('np_user')
      if (!saved) { setChecking(false); return }
      try {
        const parsed = JSON.parse(saved)
        if (parsed.role === 'admin') {
          if (adminPins().includes(parsed.pin)) { setUser(parsed); setChecking(false); return }
        } else {
          const { data } = await supabase.from('access_pins').select('*').eq('pin', parsed.pin).eq('active', true).maybeSingle()
          if (data) { setUser({ pin: parsed.pin, name: data.name, role: data.role }); setChecking(false); return }
        }
      } catch { /* fall through to logged-out state */ }
      localStorage.removeItem('np_user')
      setChecking(false)
    }
    restore()
  }, [])

  const logout = () => {
    localStorage.removeItem('np_user')
    setUser(null)
  }

  if (checking) return null

  if (!user) {
    const submit = async (e) => {
      e.preventDefault()
      setSubmitting(true)
      setError(false)
      try {
        if (adminPins().includes(entered)) {
          const userObj = { pin: entered, name: 'Admin', role: 'admin' }
          localStorage.setItem('np_user', JSON.stringify(userObj))
          setUser(userObj)
          return
        }
        const { data } = await supabase.from('access_pins').select('*').eq('pin', entered).eq('active', true).maybeSingle()
        if (data) {
          const userObj = { pin: entered, name: data.name, role: data.role }
          localStorage.setItem('np_user', JSON.stringify(userObj))
          setUser(userObj)
        } else {
          setError(true)
        }
      } catch {
        setError(true)
      } finally {
        setSubmitting(false)
      }
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
        <form onSubmit={submit} className="bg-gray-900 border border-gray-800 rounded-2xl shadow-xl p-8 w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold text-brand-500 mb-1">Needle Point</h1>
          <p className="text-gray-400 mb-6">Enter your PIN</p>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={entered}
            onChange={(e) => { setEntered(e.target.value); setError(false) }}
            className="w-full text-center text-2xl tracking-widest bg-gray-800 border border-gray-700 text-gray-100 rounded-xl py-3 mb-4"
            placeholder="••••"
          />
          {error && <p className="text-red-400 text-sm mb-3">Wrong PIN, try again</p>}
          <button disabled={submitting} className="w-full bg-brand-600 hover:bg-brand-700 text-white rounded-xl py-3 font-semibold disabled:opacity-50">
            {submitting ? 'Checking...' : 'Enter'}
          </button>
        </form>
      </div>
    )
  }

  return <AuthContext.Provider value={{ user, logout }}>{children}</AuthContext.Provider>
}
