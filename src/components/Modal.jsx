import { useEffect } from 'react'

export default function Modal({ children, onClose }) {
  // Prevent background body scrolling when modal is active
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      {/* Tap backdrop to close */}
      <div className="fixed inset-0" onClick={onClose} />

      {/* Modal Dialog Body */}
      <div className="relative w-full max-w-lg bg-gray-900 border border-gray-800 rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl max-h-[88vh] overflow-y-auto z-10 pb-28 sm:pb-6">
        <button
          onClick={onClose}
          type="button"
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-100 bg-gray-800/80 hover:bg-gray-800 rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold transition z-20"
        >
          ✕
        </button>

        {children}
      </div>
    </div>
  )
}

export function FormActions({ onCancel, saving, onDelete }) {
  return (
    <div className="pt-4 border-t border-gray-800 flex items-center justify-between gap-2 mt-4">
      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          disabled={saving}
          className="text-xs font-semibold text-red-400 hover:text-red-300 py-2 px-3 rounded-lg hover:bg-red-950/40 transition disabled:opacity-50"
        >
          Delete
        </button>
      ) : (
        <div />
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold px-4 py-2.5 rounded-xl border border-gray-700 transition disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition disabled:opacity-50 shadow-lg shadow-brand-950"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}

export const inputClass =
  'w-full bg-gray-950 border border-gray-700 text-gray-100 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition mb-3 placeholder-gray-500'

export const labelClass =
  'block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5'
