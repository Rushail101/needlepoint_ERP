export default function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-30">
      <div className="bg-gray-900 border border-gray-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5 max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  )
}

export function FormActions({ onCancel, saving, saveLabel = 'Save', danger, onDelete }) {
  return (
    <div className="flex gap-2 mt-1">
      {onDelete && (
        <button type="button" onClick={onDelete}
          className="border border-red-900 text-red-400 rounded-xl px-4 py-2.5 font-semibold text-sm">
          Delete
        </button>
      )}
      <button type="button" onClick={onCancel} className="flex-1 border border-gray-700 text-gray-200 rounded-xl py-2.5 font-semibold">
        Cancel
      </button>
      <button type="submit" disabled={saving}
        className="flex-1 bg-brand-600 hover:bg-brand-700 text-white rounded-xl py-2.5 font-semibold disabled:opacity-50">
        {saving ? 'Saving...' : saveLabel}
      </button>
    </div>
  )
}

export const inputClass = "w-full bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-brand-600"
export const labelClass = "block text-sm font-medium mb-1 text-gray-300"
