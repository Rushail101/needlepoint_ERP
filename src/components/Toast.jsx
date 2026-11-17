import { useEffect, useState } from 'react'

// toast('Saved', 'success') from anywhere; <Toaster /> is mounted once in App.
const listeners = new Set()
let seq = 0
export function toast(message, type = 'info', ms) {
  const t = { id: ++seq, message: String(message || ''), type }
  listeners.forEach(fn => fn(t, ms ?? (type === 'error' ? 7000 : 3000)))
}

const TONE = {
  info: 'border-blue-500',
  success: 'border-emerald-500',
  warn: 'border-amber-500',
  error: 'border-red-500',
}

export default function Toaster() {
  const [list, setList] = useState([])
  useEffect(() => {
    const fn = (t, ms) => {
      setList(l => [...l.slice(-2), t])
      setTimeout(() => setList(l => l.filter(x => x.id !== t.id)), ms)
    }
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])
  if (!list.length) return null
  return (
    <div className="fixed z-[80] left-3 right-3 bottom-20 sm:bottom-5 sm:left-auto sm:right-5 sm:w-96 flex flex-col gap-2" role="status" aria-live="polite">
      {list.map(t => (
        <div key={t.id} className={`bg-gray-900 border border-gray-700 border-l-4 ${TONE[t.type] || TONE.info} text-gray-100 text-sm rounded-xl px-3.5 py-2.5 shadow-2xl flex items-start gap-3`}>
          <span className="flex-1 whitespace-pre-line">{t.message}</span>
          <button onClick={() => setList(l => l.filter(x => x.id !== t.id))} className="text-gray-500 hover:text-gray-200" aria-label="Dismiss">✕</button>
        </div>
      ))}
    </div>
  )
}
