import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, setSessionToken } from '../supabaseClient.js'
import { normRole } from '../permissions.js'

const AuthContext = createContext(null)
export function useAuth() { return useContext(AuthContext) }

// Logins are checked in the database (migration 008): PINs and portal
// passwords are stored hashed where the app's public key can't read them, and
// a successful login returns a session token that rides on every request.
// Before, PINs/passwords were readable by anyone with the site's code, the
// admin PIN was baked into the bundle, and anyone could "sign up" as any brand
// that had no password yet.
export default function PinGate({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('staff')
  const [pin, setPin] = useState('')
  const [brandName, setBrandName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const adopt = (u) => {
    const clean = { ...u, role: normRole(u.role) }
    setSessionToken(clean.token)
    localStorage.setItem('np_user', JSON.stringify(clean))
    setUser(clean)
  }

  // Re-check a saved session with the server; drop it if it was revoked or expired.
  useEffect(() => {
    const saved = localStorage.getItem('np_user')
    if (!saved) { setLoading(false); return }
    let u = null
    try { u = JSON.parse(saved) } catch { /* ignore */ }
    if (!u?.token) { localStorage.removeItem('np_user'); setLoading(false); return }
    setSessionToken(u.token)
    supabase.rpc('ops_whoami').then(({ data, error: err }) => {
      if (err && !/fetch|network/i.test(err.message)) { localStorage.removeItem('np_user'); setSessionToken(null) }
      else if (!err && !data) { localStorage.removeItem('np_user'); setSessionToken(null) }
      else setUser({ ...u, ...(data || {}), role: normRole((data || u).role) })   // offline: keep the saved session
      setLoading(false)
    })
  }, [])

  const logout = async () => {
    try { await supabase.rpc('ops_logout') } catch { /* already gone */ }
    localStorage.removeItem('np_user')
    setSessionToken(null)
    setUser(null)
    setPin(''); setPassword(''); setError('')
  }

  const run = async (fn, args) => {
    setError(''); setSubmitting(true)
    try {
      const { data, error: err } = await supabase.rpc(fn, args)
      if (err) throw new Error(/could not find the function|does not exist/i.test(err.message)
        ? 'The database needs updating — run supabase/migration_008_production_upgrades.sql.' : err.message)
      if (data?.error) throw new Error(data.error)
      adopt(data)
    } catch (e) {
      setError(e.message)
      setPin('')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500 text-sm">Loading…</div>

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-black text-gray-100 tracking-tight">NEEDLE POINT</h1>
            <p className="text-xs text-brand-500 font-bold tracking-wider uppercase mt-0.5">Production ERP &amp; Client Portal</p>
          </div>

          <div className="grid grid-cols-2 gap-1 bg-gray-950 border border-gray-800 rounded-xl p-1 mb-5">
            {[['staff', 'Staff'], ['client', 'Brand portal']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => { setMode(k); setError('') }}
                className={`py-2 rounded-lg text-xs font-bold transition ${mode === k ? 'bg-brand-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}>{l}</button>
            ))}
          </div>

          {mode === 'staff' ? (
            <form onSubmit={e => { e.preventDefault(); if (pin.trim()) run('ops_login_staff', { p_pin: pin.trim() }) }}>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5" htmlFor="pin">Your PIN</label>
              <input id="pin" type="password" inputMode="numeric" autoComplete="current-password" autoFocus value={pin}
                onChange={e => setPin(e.target.value.replace(/\s/g, ''))}
                className="w-full bg-gray-950 border border-gray-700 text-gray-100 rounded-xl px-3.5 py-3 text-center text-2xl tracking-[0.5em] font-bold focus:outline-none focus:border-brand-500 mb-3" />
              {error && <p className="text-xs text-red-400 mb-3 whitespace-pre-line">{error}</p>}
              <button disabled={submitting || !pin.trim()} className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50">
                {submitting ? 'Checking…' : 'Sign in'}
              </button>
            </form>
          ) : (
            <form onSubmit={e => { e.preventDefault(); if (brandName.trim() && password) run('ops_login_client', { p_brand: brandName.trim(), p_password: password }) }}>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5" htmlFor="brand">Brand name</label>
              <input id="brand" autoComplete="username" value={brandName} onChange={e => setBrandName(e.target.value)}
                className="w-full bg-gray-950 border border-gray-700 text-gray-100 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-brand-500 mb-3" />
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5" htmlFor="pw">Password</label>
              <input id="pw" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full bg-gray-950 border border-gray-700 text-gray-100 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-brand-500 mb-3" />
              {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
              <button disabled={submitting || !brandName.trim() || !password} className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50">
                {submitting ? 'Checking…' : 'Open portal'}
              </button>
              <p className="text-[11px] text-gray-500 mt-4 text-center leading-relaxed">
                First time here? Needle Point sets up your portal login — ask your contact for your password.
              </p>
            </form>
          )}
        </div>
      </div>
    )
  }

  return <AuthContext.Provider value={{ user, logout }}>{children}</AuthContext.Provider>
}
