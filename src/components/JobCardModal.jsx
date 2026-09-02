import { useEffect, useRef } from 'react'
import Modal from './Modal.jsx'

export default function JobCardModal({ product, brandName, sizes, onClose }) {
  const printRef = useRef(null)

  const handlePrint = () => {
    window.print()
  }

  const totalQty = (sizes || []).reduce((acc, s) => acc + (Number(s.quantity) || 0), 0)
  const qrValue = `${window.location.origin}/products/${product.id}`
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrValue)}`

  return (
    <Modal onClose={onClose}>
      <div className="flex justify-between items-center mb-4 print:hidden">
        <h3 className="text-lg font-bold text-gray-100">Bundle Job Card</h3>
        <button
          onClick={handlePrint}
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2"
        >
          🖨️ Print Slip
        </button>
      </div>

      {/* Printable Sheet */}
      <div
        ref={printRef}
        className="bg-white text-black p-4 rounded-xl border border-gray-300 max-w-sm mx-auto print:max-w-none print:m-0 print:border-none print:p-2"
      >
        <div className="border-b-2 border-black pb-2 mb-2 flex justify-between items-start">
          <div>
            <h2 className="text-base font-black uppercase tracking-tight">Needle Point</h2>
            <p className="text-[10px] uppercase font-bold text-gray-600">Production Bundle Card</p>
          </div>
          <div className="text-right">
            <span className="text-xs font-mono font-bold bg-black text-white px-2 py-0.5 rounded">
              {product.po_number || 'NO-PO'}
            </span>
          </div>
        </div>

        <div className="flex gap-3 items-start my-2">
          {product.cover_photo_url && (
            <img
              src={product.cover_photo_url}
              alt="Garment"
              className="w-16 h-16 object-cover border border-black rounded"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black leading-snug truncate">{product.name}</p>
            <p className="text-xs font-bold text-gray-700">{brandName || 'Independent'}</p>
            {product.style_code && (
              <p className="text-[10px] text-gray-600 font-mono">Style: {product.style_code}</p>
            )}
          </div>
        </div>

        {/* Sizes Grid */}
        <div className="my-2 border border-black rounded overflow-hidden">
          <div className="grid grid-cols-2 bg-gray-100 border-b border-black text-[11px] font-bold py-1 px-2">
            <span>Size</span>
            <span className="text-right">Quantity</span>
          </div>
          <div className="divide-y divide-gray-200">
            {sizes.map((s, i) => (
              <div key={i} className="grid grid-cols-2 text-xs py-1 px-2 font-medium">
                <span>{s.size_label}</span>
                <span className="text-right font-bold">{s.quantity} pcs</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 bg-gray-100 border-t border-black text-xs font-black py-1.5 px-2">
            <span>TOTAL</span>
            <span className="text-right">{totalQty} pcs</span>
          </div>
        </div>

        {/* QR Code and Instructions */}
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-dashed border-gray-400">
          <img src={qrUrl} alt="QR Code" className="w-20 h-20" />
          <div className="text-right pl-2">
            <p className="text-[10px] font-bold leading-tight">Scan with mobile</p>
            <p className="text-[9px] text-gray-600 leading-tight">to log Cutting, Stitching or Finishing</p>
            <p className="text-[9px] font-mono text-gray-500 mt-1">{product.id.slice(0, 8)}</p>
          </div>
        </div>
      </div>
    </Modal>
  )
}
