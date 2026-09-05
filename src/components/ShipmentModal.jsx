import { useState, useEffect } from 'react'
import Modal, { inputClass, labelClass } from './Modal.jsx'
import { supabase } from '../supabaseClient.js'
import { useAuth } from './PinGate.jsx'

export default function ShipmentModal({ product, sizes, onClose, onUpdated }) {
  const { user } = useAuth()
  const [shipments, setShipments] = useState([])
  // Map of size_label -> quantity string to dispatch now
  const [dispatchCounts, setDispatchCounts] = useState({})
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const loadShipments = async () => {
    const { data } = await supabase
      .from('shipments')
      .select('*')
      .eq('product_id', product.id)
      .order('dispatched_at', { ascending: false })
    setShipments(data || [])
  }

  useEffect(() => {
    loadShipments()
  }, [product.id])

  // Aggregate already dispatched count per size
  const shippedPerSize = (shipments || []).reduce((acc, s) => {
    const key = s.size_label || 'Mixed'
    acc[key] = (acc[key] || 0) + Number(s.quantity || 0)
    return acc
  }, {})

  const totalOrdered = (sizes || []).reduce((acc, s) => acc + (Number(s.quantity) || 0), 0)
  const totalShipped = (shipments || []).reduce((acc, s) => acc + Number(s.quantity || 0), 0)
  const remaining = Math.max(0, totalOrdered - totalShipped)

  // Total quantity selected in the current form submission
  const currentBatchTotal = Object.values(dispatchCounts).reduce((acc, val) => {
    const n = parseInt(val, 10)
    return acc + (isNaN(n) || n < 0 ? 0 : n)
  }, 0)

  const handleCountChange = (sizeLabel, value) => {
    // Only allow positive integers
    const cleaned = value.replace(/[^0-9]/g, '')
    setDispatchCounts(prev => ({
      ...prev,
      [sizeLabel]: cleaned,
    }))
  }

  const handleAddShipment = async (e) => {
    e.preventDefault()
    if (currentBatchTotal <= 0) {
      alert('Please enter a quantity for at least one size.')
      return
    }

    setSaving(true)
    try {
      const rowsToInsert = []
      const timestamp = new Date().toISOString()
      const noteText = notes.trim() || null
      const author = user?.name || 'Floor Staff'

      for (const [sizeLabel, countStr] of Object.entries(dispatchCounts)) {
        const qty = parseInt(countStr, 10)
        if (qty > 0) {
          rowsToInsert.push({
            product_id: product.id,
            size_label: sizeLabel,
            quantity: qty,
            notes: noteText,
            dispatched_at: timestamp,
            created_by: author,
          })
        }
      }

      if (rowsToInsert.length > 0) {
        const { error } = await supabase.from('shipments').insert(rowsToInsert)
        if (error) throw error
      }

      setDispatchCounts({})
      setNotes('')
      await loadShipments()
      if (onUpdated) onUpdated()
    } catch (err) {
      alert('Could not record dispatch: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Remove this dispatch record?')) return
    await supabase.from('shipments').delete().eq('id', id)
    await loadShipments()
    if (onUpdated) onUpdated()
  }

  return (
    <Modal onClose={onClose}>
      <div className="mb-4">
        <h3 className="text-lg font-bold text-gray-100">Dispatches & Partial Delivery</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          {product.name} {product.po_number ? `(${product.po_number})` : ''}
        </p>
      </div>

      {/* Progress Bar */}
      <div className="bg-gray-950 border border-gray-800 rounded-xl p-3 mb-4">
        <div className="flex justify-between text-xs font-semibold mb-1.5">
          <span className="text-gray-300">
            Dispatched: <span className="text-emerald-400 font-bold">{totalShipped} pcs</span>
          </span>
          <span className="text-gray-400">Total Lot: {totalOrdered} pcs</span>
        </div>
        <div className="w-full bg-gray-800 h-2.5 rounded-full overflow-hidden">
          <div
            className="bg-emerald-500 h-full rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, (totalShipped / (totalOrdered || 1)) * 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-gray-500 mt-1.5 font-medium">
          <span>Remaining to dispatch: <strong className="text-gray-200">{remaining} pcs</strong></span>
          {totalShipped >= totalOrdered && totalOrdered > 0 && (
            <span className="text-emerald-400 font-semibold">✓ Complete Lot Dispatched</span>
          )}
        </div>
      </div>

      {/* Multi-Size Dispatch Input Form */}
      <form onSubmit={handleAddShipment} className="bg-gray-900 border border-gray-800 rounded-xl p-3.5 mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase font-bold text-gray-300 tracking-wider">Log Dispatch By Size</p>
          {currentBatchTotal > 0 && (
            <span className="text-xs font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-800/80 px-2 py-0.5 rounded-full">
              Sending: {currentBatchTotal} pcs
            </span>
          )}
        </div>

        {/* Sizes Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1 py-1">
          {sizes && sizes.length > 0 ? (
            sizes.map((s) => {
              const alreadySent = shippedPerSize[s.size_label] || 0
              const sizeRemaining = Math.max(0, Number(s.quantity) - alreadySent)
              const enteredQty = parseInt(dispatchCounts[s.size_label] || '0', 10)
              const isOver = enteredQty > sizeRemaining

              return (
                <div
                  key={s.id || s.size_label}
                  className={`bg-gray-950 border rounded-xl p-2.5 transition flex flex-col justify-between ${
                    enteredQty > 0
                      ? isOver
                        ? 'border-amber-500/80 bg-amber-950/20'
                        : 'border-emerald-500/70 bg-emerald-950/20'
                      : 'border-gray-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1 mb-1.5">
                    <span className="text-sm font-bold text-gray-100">{s.size_label}</span>
                    <span className="text-[10px] text-gray-400">
                      Total: <strong className="text-gray-300">{s.quantity}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={dispatchCounts[s.size_label] || ''}
                      onChange={(e) => handleCountChange(s.size_label, e.target.value)}
                      placeholder="0"
                      className="w-full bg-gray-900 border border-gray-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 text-gray-100 text-center font-bold text-sm rounded-lg py-1 px-1 outline-none"
                    />
                    <span className="text-[11px] text-gray-500 font-medium">pcs</span>
                  </div>

                  <div className="flex justify-between items-center text-[10px] mt-1.5 text-gray-500">
                    <span>Sent: <strong className="text-gray-400">{alreadySent}</strong></span>
                    <span>Left: <strong className={sizeRemaining === 0 ? 'text-gray-600' : 'text-gray-300'}>{sizeRemaining}</strong></span>
                  </div>
                </div>
              )
            })
          ) : (
            <p className="col-span-full text-xs text-gray-500">No sizes found for this order.</p>
          )}
        </div>

        <div>
          <label className={labelClass}>Dispatch Note / Waybill / Receiver</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Sent via WeFast / Porter to Mumbai boutique"
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={saving || currentBatchTotal <= 0}
          className="w-full bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 text-white rounded-xl py-2.5 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {saving ? 'Recording...' : currentBatchTotal > 0 ? `+ Record ${currentBatchTotal} Pieces Dispatched` : '+ Enter Quantities Above to Dispatch'}
        </button>
      </form>

      {/* Dispatch History */}
      <p className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-2">Past Dispatches</p>
      <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
        {shipments.length === 0 ? (
          <p className="text-xs text-gray-500 py-3 text-center">No pieces dispatched yet.</p>
        ) : (
          shipments.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between p-2.5 rounded-lg bg-gray-950 border border-gray-800 text-xs"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-emerald-400">{s.quantity} pcs</span>
                  {s.size_label && (
                    <span className="px-1.5 py-0.5 bg-gray-800 text-gray-300 rounded text-[10px] font-mono">
                      {s.size_label}
                    </span>
                  )}
                  <span className="text-gray-500 text-[11px]">
                    {new Date(s.dispatched_at).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                {s.notes && <p className="text-gray-400 text-[11px] mt-0.5">{s.notes}</p>}
              </div>

              <button
                type="button"
                onClick={() => handleDelete(s.id)}
                className="text-gray-500 hover:text-red-400 px-1 text-sm font-bold"
                title="Delete entry"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </Modal>
  )
}
