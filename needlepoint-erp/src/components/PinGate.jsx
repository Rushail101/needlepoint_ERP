import { useState, useEffect } from 'react'

// Very simple shared PIN so the tool isn't wide open, without building full auth.
// Set VITE_APP_PIN in your env. If not set, the gate is skipped entirely.
export default function PinGate({ children }) {
  const requiredPin = import.meta.env.VITE_APP_PIN
  const [unlocked, setUnlocked] = useState(!requiredPin)
  const [entered, setEntered] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!requiredPin) return
    const saved = localStorage.getItem('np_pin_ok')
    if (saved === requiredPin) setUnlocked(true)
  }, [requiredPin])

  if (unlocked) return children

  const submit = (e) => {
    e.preventDefault()
    if (entered === requiredPin) {
      localStorage.setItem('np_pin_ok', requiredPin)
      setUnlocked(true)
    } else {
      setError(true)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow p-8 w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold text-brand-700 mb-1">Needle Point</h1>
        <p className="text-gray-500 mb-6">Enter PIN to continue</p>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={entered}
          onChange={(e) => { setEntered(e.target.value); setError(false) }}
          className="w-full text-center text-2xl tracking-widest border rounded-xl py-3 mb-4"
          placeholder="••••"
        />
        {error && <p className="text-red-500 text-sm mb-3">Wrong PIN, try again</p>}
        <button className="w-full bg-brand-600 text-white rounded-xl py-3 font-semibold">
          Enter
        </button>
      </form>
    </div>
  )
}
