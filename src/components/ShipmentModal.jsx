import { useState, useEffect } from 'react'
import Modal, { inputClass, labelClass } from './Modal.jsx'
import { supabase } from '../supabaseClient.js'
import { useAuth } from './PinGate.jsx'

export default function ShipmentModal({ product, sizes, onClose, onUpdated }) {
  const { user } = useAuth()
  const [shipments, setShipments] = useState([])
  const [quantity, setQuantity] = useState('')
  const [sizeLabel, setSizeLabel] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const totalOrdered = (sizes || []).reduce((acc, s) => acc + (Number(s.quantity) || 0), 0)
  const totalShipped = shipments.reduce((acc, s) => acc + Number(s.quantity), 0)
  const remaining = Math.max(0, totalOrdered - totalShipped)

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

  const handleAddShipment = async (e) => {
    e.preventDefault()
    const qtyNum = parseInt(quantity, 10)
    if (!qtyNum || qtyNum <= 0) return

    setSaving(true)
    try {
      const { error } = await supabase.from('shipments').insert({
        product_id: product.id,
        size_label: sizeLabel || null,
        quantity: qtyNum,
        notes: notes.trim() || null,
        created_by: user?.name || 'Floor Staff',
      })
      if (error) throw error

      setQuantity('')
      setSizeLabel('')
      setNotes('')
      await loadShipments()
      if (onUpdated) onUpdated()
    } catch (err) {
      alert('Could not log dispatch: ' + err.message)
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
        <p className="text-xs text-gray-400 mt-0.5">{product.name} ({product.po_number || 'No PO'})</p>
      </div>

      {/* Progress Bar */}
      <div className="bg-gray-950 border border-gray-800 rounded-xl p-3 mb-4">
        <div className="flex justify-between text-xs font-semibold mb-1.5">
          <span className="text-gray-300">Dispatched: <span className="text-emerald-400">{totalShipped} pcs</span></span>
          <span className="text-gray-400">Total Lot: {totalOrdered} pcs</span>
        </div>
        <div className="w-full bg-gray-800 h-2.5 rounded-full overflow-hidden">
          <div
            className="bg-emerald-500 h-full rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, (totalShipped / (totalOrdered || 1)) * 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-gray-500 mt-1.5">
          <span>Remaining to dispatch: <strong className="text-gray-200">{remaining} pcs</strong></span>
          <span>{totalShipped >= totalOrdered && totalOrdered > 0 ? '✓ Entire Order Dispatched' : ''}</span>
        </div>
      </div>

      {/* Log New Dispatch Form */}
      <form onSubmit={handleAddShipment} className="bg-gray-900 border border-gray-800 rounded-xl p-3 mb-4 space-y-3">
        <p className="text-xs uppercase font-bold text-gray-400 tracking-wider">Log New Dispatch</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Quantity Dispatched*</label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 5"
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className={labelClass}>Size (Optional)</label>
            <select
              value={sizeLabel}
              onChange={(e) => setSizeLabel(e.target.value)}
              className={inputClass}
            >
              <option value="">Mixed / Any Size</option>
              {sizes.map((s, idx) => (
                <option key={idx} value={s.size_label}>{s.size_label} ({s.quantity} pcs)</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Dispatch Note / Tracking / Waybill</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. 5 pcs sent via WeFast for client preview"
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg py-2 text-xs font-semibold disabled:opacity-50"
        >
          {saving ? 'Saving...' : '+ Record Dispatch'}
        </button>
      </form>

      {/* Shipment History */}
      <p className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-2">Dispatch History</p>
      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
        {shipments.length === 0 ? (
          <p className="text-xs text-gray-500 py-3 text-center">No pieces dispatched yet.</p>
        ) : (
          shipments.map((s) => (
            <div key={s.id} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-950 border border-gray-800 text-xs">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-emerald-400">{s.quantity} pcs</span>
                  {s.size_label && (
                    <span className="px-1.5 py-0.2 bg-gray-800 text-gray-300 rounded text-[10px] font-mono">
                      {s.size_label}
                    </span>
                  )}
                  <span className="text-gray-500">
                    {new Date(s.dispatched_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </span>
                </div>
                {s.notes && <p className="text-gray-400 text-[11px] mt-0.5">{s.notes}</p>}
              </div>

              <button
                type="button"
                onClick={() => handleDelete(s.id)}
                className="text-gray-500 hover:text-red-400 px-1 text-sm"
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
