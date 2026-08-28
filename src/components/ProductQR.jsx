import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

// Renders a small QR code linking straight into the Work Log flow for this garment,
// so labour standing next to the physical batch can scan instead of hunting through the photo grid.
export default function ProductQR({ productId }) {
  const canvasRef = useRef(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open || !canvasRef.current) return
    const url = `${window.location.origin}/worklog?product=${productId}`
    QRCode.toCanvas(canvasRef.current, url, { width: 180, margin: 1, color: { dark: '#111827', light: '#f3f4f6' } })
  }, [open, productId])

  return (
    <div className="mb-4">
      <button onClick={() => setOpen(o => !o)}
        className="text-xs text-gray-400 border border-gray-800 rounded-lg px-3 py-1.5">
        {open ? 'Hide QR Code' : '📱 Show QR Code for Quick Logging'}
      </button>
      {open && (
        <div className="mt-2 bg-gray-100 inline-block p-3 rounded-xl">
          <canvas ref={canvasRef} />
          <p className="text-[11px] text-gray-600 text-center mt-1">Scan to log work on this garment</p>
        </div>
      )}
    </div>
  )
}
