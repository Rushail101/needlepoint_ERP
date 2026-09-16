import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

export default function PinGate({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Top tabs: 'staff' | 'client'
  const [mode, setMode] = useState('staff')
  // Sub-view for client portal: 'login' | 'signup'
  const [clientView, setClientView] = useState('login')

  // Staff PIN
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')

  // Client Login fields
  const [brandName, setBrandName] = useState('')
  const [password, setPassword] = useState('')

  // Client Sign Up / Setup fields
  const [signupBrand, setSignupBrand] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

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
    setSignupBrand('')
    setNewPassword('')
    setConfirmPassword('')
    setClientError('')
    setPinError('')
  }

  // 1. Staff PIN Login
  const handleStaffLogin = async (e) => {
    e.preventDefault()
    setPinError('')
    const cleanPin = String(pin).trim()
    const masterPin = String(import.meta.env.VITE_APP_PIN || import.meta.env.VITE_ADMIN_PIN || '').trim()

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

  // 2. Existing Client Login
  const handleClientLogin = async (e) => {
    e.preventDefault()
    setClientError('')
    const cleanBrand = brandName.trim()
    if (!cleanBrand) return

    setSubmitting(true)
    try {
      const { data: brand, error } = await supabase
        .from('brands')
        .select('*')
        .ilike('name', cleanBrand)
        .maybeSingle()

      if (error) throw error

      if (!brand) {
        throw new Error('Brand not found. Switch to "Sign Up" to register this brand.')
      }

      if (brand.portal_active === false) {
        throw new Error('Portal access disabled for this brand. Contact Needle Point.')
      }

      // If the brand exists in DB but never had a password created
      if (!brand.portal_password || brand.portal_password.trim() === '') {
        setSignupBrand(brand.name)
        setClientView('signup')
        throw new Error('This brand has no password set yet. Please set your password below.')
      }

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

  // 3. Client Registration / First-Time Setup
  const handleClientSignUp = async (e) => {
    e.preventDefault()
    setClientError('')

    const cleanBrand = signupBrand.trim()
    const cleanPass = newPassword.trim()

    if (!cleanBrand) {
      setClientError('Brand name is required.')
      return
    }
    if (cleanPass.length < 4) {
      setClientError('Password must be at least 4 characters long.')
      return
    }
    if (cleanPass !== confirmPassword.trim()) {
      setClientError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      // Check if brand already exists (case-insensitive)
      const { data: existingBrand, error: searchErr } = await supabase
        .from('brands')
        .select('*')
        .ilike('name', cleanBrand)
        .maybeSingle()

      if (searchErr) throw searchErr

      let activeBrand = existingBrand

      if (existingBrand) {
        // If it already has an established password, redirect to login
        if (existingBrand.portal_password && existingBrand.portal_password.trim() !== '') {
          throw new Error('This brand is already registered. Please sign in with your password.')
        }

        // Brand was pre-created by staff without password; update it
        const { data: updated, error: updateErr } = await supabase
          .from('brands')
          .update({
            portal_password: cleanPass,
            portal_active: true,
            contact_person: contactPerson.trim() || existingBrand.contact_person,
            contact_phone: contactPhone.trim() || existingBrand.contact_phone,
          })
          .eq('id', existingBrand.id)
          .select()
          .single()

        if (updateErr) throw updateErr
        activeBrand = updated
      } else {
        // New Brand: create from scratch
        const { data: created, error: createErr } = await supabase
          .from('brands')
          .insert({
            name: cleanBrand,
            portal_password: cleanPass,
            portal_active: true,
            contact_person: contactPerson.trim() || null,
            contact_phone: contactPhone.trim() || null,
          })
          .select()
          .single()

        if (createErr) throw createErr
        activeBrand = created
      }

      const clientUser = {
        id: activeBrand.id,
        brandId: activeBrand.id,
        name: activeBrand.name,
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

          {/* Mode Switcher */}
          <div className="grid grid-cols-2 p-1 bg-gray-950 rounded-2xl border border-gray-800 mb-5">
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

          {/* CLIENT PORTAL: LOGIN & SIGNUP */}
          {mode === 'client' && (
            <div>
              {/* Toggle Sub-tabs */}
              <div className="flex border-b border-gray-800 mb-4 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => { setClientView('login'); setClientError('') }}
                  className={`flex-1 pb-2 transition border-b-2 ${
                    clientView === 'login'
                      ? 'border-brand-500 text-brand-400'
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Log In
                </button>
                <button
                  type="button"
                  onClick={() => { setClientView('signup'); setClientError('') }}
                  className={`flex-1 pb-2 transition border-b-2 ${
                    clientView === 'signup'
                      ? 'border-brand-500 text-brand-400'
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Sign Up / New Brand
                </button>
              </div>

              {clientView === 'login' ? (
                <form onSubmit={handleClientLogin} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                      Brand Name
                    </label>
                    <input
                      type="text"
                      autoFocus
                      value={brandName}
                      onChange={(e) => setBrandName(e.target.value)}
                      placeholder="e.g. Cayani"
                      className="w-full py-2.5 px-3.5 bg-gray-950 border border-gray-700 rounded-xl text-sm text-white focus:outline-none focus:border-brand-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                      Password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      className="w-full py-2.5 px-3.5 bg-gray-950 border border-gray-700 rounded-xl text-sm text-white focus:outline-none focus:border-brand-500"
                      required
                    />
                  </div>

                  {clientError && <p className="text-xs text-red-400 text-center font-medium">{clientError}</p>}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-3 rounded-2xl text-sm transition disabled:opacity-50"
                  >
                    {submitting ? 'Authenticating...' : 'Enter Client Portal'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleClientSignUp} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                      Brand Name*
                    </label>
                    <input
                      type="text"
                      autoFocus
                      value={signupBrand}
                      onChange={(e) => setSignupBrand(e.target.value)}
                      placeholder="e.g. Junne"
                      className="w-full py-2 px-3 bg-gray-950 border border-gray-700 rounded-xl text-sm text-white focus:outline-none focus:border-brand-500"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                        Contact Name
                      </label>
                      <input
                        type="text"
                        value={contactPerson}
                        onChange={(e) => setContactPerson(e.target.value)}
                        placeholder="Your name"
                        className="w-full py-2 px-3 bg-gray-950 border border-gray-700 rounded-xl text-xs text-white focus:outline-none focus:border-brand-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                        Phone
                      </label>
                      <input
                        type="tel"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        placeholder="Mobile no."
                        className="w-full py-2 px-3 bg-gray-950 border border-gray-700 rounded-xl text-xs text-white focus:outline-none focus:border-brand-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                      Create Password*
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 4 characters"
                      className="w-full py-2 px-3 bg-gray-950 border border-gray-700 rounded-xl text-sm text-white focus:outline-none focus:border-brand-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                      Confirm Password*
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat password"
                      className="w-full py-2 px-3 bg-gray-950 border border-gray-700 rounded-xl text-sm text-white focus:outline-none focus:border-brand-500"
                      required
                    />
                  </div>

                  {clientError && <p className="text-xs text-red-400 text-center font-medium">{clientError}</p>}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-2.5 rounded-2xl text-sm transition disabled:opacity-50"
                  >
                    {submitting ? 'Registering...' : 'Register & Enter'}
                  </button>
                </form>
              )}
            </div>
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
