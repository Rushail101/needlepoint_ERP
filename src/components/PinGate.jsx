import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

export default function PinGate({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Login Mode: 'staff' or 'client'
  const [mode, setMode] = useState('staff')

  // Staff PIN State
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')

  // Client State
  const [brandName, setBrandName] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [needsSetup, setNeedsSetup] = useState(false)
  const [clientError, setClientError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('np_user')
    if (saved) {
      try {
        setUser(JSON.parse(saved))
      } catch {
        localStorage.removeItem('np_user')
      }
    }
    setLoading(false)
  }, [])

  const logout = () => {
    localStorage.removeItem('np_user')
    setUser(null)
    setPin('')
    setBrandName('')
    setPassword('')
    setNeedsSetup(false)
  }

  // 1. Staff Login with PIN
  const handleStaffLogin = async (e) => {
    e.preventDefault()
    setPinError('')
    const cleanPin = String(pin).trim()
    const masterPin = String(import.meta.env.VITE_APP_PIN || '').trim()

    if (masterPin && cleanPin === masterPin) {
      const adminUser = { id: 'master-admin', name: 'Admin', role: 'admin' }
      setUser(adminUser)
      localStorage.setItem('np_user', JSON.stringify(adminUser))
      return
    }

    try {
      const { data, error } = await supabase
        .from('access_pins')
        .select('*, employees(*)')
        .eq('pin', cleanPin)
        .eq('active', true)
        .single()

      if (error || !data) throw new Error('Invalid PIN')

      const userData = {
        id: data.id,
        name: data.name,
        role: data.role.toLowerCase(),
        employeeId: data.employee_id,
      }
      setUser(userData)
      localStorage.setItem('np_user', JSON.stringify(userData))
    } catch {
      setPinError('Invalid PIN. Please try again.')
      setPin('')
    }
  }

  // 2. Client Login & First-Time Setup
  const handleClientLogin = async (e) => {
    e.preventDefault()
    setClientError('')
    const cleanBrand = brandName.trim()
    if (!cleanBrand) return

    setSubmitting(true)
    try {
      // Case-insensitive brand lookup
      const { data: brand, error } = await supabase
        .from('brands')
        .select('*')
        .ilike('name', cleanBrand)
        .single()

      if (error || !brand) {
        throw new Error('Brand name not found. Please contact Needle Point.')
      }

      if (brand.portal_active === false) {
        throw new Error('Portal access disabled for this brand.')
      }

      // First-time password setup detection
      if (!brand.portal_password) {
        if (!needsSetup) {
          setNeedsSetup(true)
          setSubmitting(false)
          return
        }

        // Processing setup
        if (!newPassword || newPassword.length < 4) {
          throw new Error('Password must be at least 4 characters.')
        }
        if (newPassword !== confirmPassword) {
          throw new Error('Passwords do not match.')
        }

        const { error: updateErr } = await supabase
          .from('brands')
          .update({ portal_password: newPassword.trim() })
          .eq('id', brand.id)

        if (updateErr) throw updateErr

        const clientUser = {
          id: brand.id,
          brandId: brand.id,
          name: brand.name,
          role: 'client',
        }
        setUser(clientUser)
        localStorage.setItem('np_user', JSON.stringify(clientUser))
        return
      }

      // Standard Password Verification
      if (brand.portal_password !== password.trim()) {
        throw new Error('Incorrect password.')
      }

      const clientUser = {
        id: brand.id,
        brandId: brand.id,
        name: brand.name,
        role: 'client',
      }
      setUser(clientUser)
      localStorage.setItem('np_user', JSON.stringify(clientUser))
    } catch (err) {
      setClientError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return null

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-black text-gray-100 tracking-tight">NEEDLE POINT</h1>
            <p className="text-xs text-brand-500 font-bold tracking-wider uppercase mt-0.5">
              Production ERP & Client Portal
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 p-1 bg-gray-950 rounded-2xl border border-gray-800 mb-6">
            <button
              type="button"
              onClick={() => { setMode('staff'); setPinError(''); setClientError('') }}
              className={`py-2 text-xs font-bold rounded-xl transition ${
                mode === 'staff' ? 'bg-brand-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Staff / Floor
            </button>
            <button
              type="button"
              onClick={() => { setMode('client'); setPinError(''); setClientError('') }}
              className={`py-2 text-xs font-bold rounded-xl transition ${
                mode === 'client' ? 'bg-brand-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Client Portal
            </button>
          </div>

          {/* STAFF PIN FORM */}
          {mode === 'staff' && (
            <form onSubmit={handleStaffLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 text-center">
                  Enter Staff PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  autoFocus
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••"
                  className="w-full text-center tracking-widest text-2xl font-mono py-3 bg-gray-950 border border-gray-700 rounded-2xl text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              {pinError && <p className="text-xs text-red-400 text-center font-medium">{pinError}</p>}

              <button
                type="submit"
                className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-3 rounded-2xl text-sm transition"
              >
                Sign In
              </button>
            </form>
          )}

          {/* CLIENT BRAND + PASSWORD FORM */}
          {mode === 'client' && (
            <form onSubmit={handleClientLogin} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                  Brand Name
                </label>
                <input
                  type="text"
                  autoFocus
                  value={brandName}
                  onChange={(e) => { setBrandName(e.target.value); setNeedsSetup(false) }}
                  placeholder="e.g. Cayani, Junne, Waqif..."
                  className="w-full py-2.5 px-3.5 bg-gray-950 border border-gray-700 rounded-xl text-sm text-white focus:outline-none focus:border-brand-500"
                  required
                />
              </div>

              {!needsSetup ? (
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter brand password"
                    className="w-full py-2.5 px-3.5 bg-gray-950 border border-gray-700 rounded-xl text-sm text-white focus:outline-none focus:border-brand-500"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    First time logging in? Enter your brand name and tap continue to set your password.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-brand-950/40 border border-brand-800/60 rounded-xl space-y-3">
                  <p className="text-xs text-brand-300 font-semibold">
                    First-Time Setup: Create a password for {brandName}
                  </p>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 4 characters"
                      className="w-full py-2 px-3 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-brand-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat password"
                      className="w-full py-2 px-3 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-brand-500"
                      required
                    />
                  </div>
                </div>
              )}

              {clientError && <p className="text-xs text-red-400 text-center font-medium">{clientError}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-3 rounded-2xl text-sm transition disabled:opacity-50"
              >
                {submitting ? 'Authenticating...' : needsSetup ? 'Set Password & Enter' : 'Enter Client Portal'}
              </button>
            </form>
          )}
        </div>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ user, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
