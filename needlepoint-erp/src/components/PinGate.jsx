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
    <div className="min-h-screen flex items-center justify-center bg-ink-950 px-4">
      <form onSubmit={submit} className="bg-ink-900 seam-top border border-ink-700 rounded-2xl shadow-xl p-8 w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold font-display text-paper-100 mb-1">Needle Point</h1>
        <p className="text-paper-400 mb-6">Enter PIN to continue</p>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={entered}
          onChange={(e) => { setEntered(e.target.value); setError(false) }}
          className="w-full text-center text-2xl tracking-widest bg-ink-800 border border-ink-700 text-paper-100 rounded-xl py-3 mb-4 focus:outline-none focus:border-thread-500"
          placeholder="••••"
        />
        {error && <p className="text-red-400 text-sm mb-3">Wrong PIN, try again</p>}
        <button className="w-full bg-thread-500 hover:bg-thread-600 text-ink-950 rounded-xl py-3 font-semibold transition-colors">
          Enter
        </button>
      </form>
    </div>
  )
}
