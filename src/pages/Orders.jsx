import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, uploadPhoto } from '../supabaseClient.js'
import Modal, { FormActions, inputClass, labelClass } from '../components/Modal.jsx'
import { STAGES, stageInfo } from '../stages.js'
import { useAuth } from '../components/PinGate.jsx'
import { can } from '../permissions.js'
import { exportBatchOrderPDF } from '../pdfExport.js'

const STATUS_LABEL = {
  in_production: { text: 'In Production', color: 'bg-blue-900/50 text-blue-300' },
  sampling: { text: 'Sampling', color: 'bg-yellow-900/50 text-yellow-300' },
  completed: { text: 'Completed', color: 'bg-green-900/50 text-green-300' },
  on_hold: { text: 'On Hold', color: 'bg-gray-800 text-gray-400' },
}

function generateConciseBatchSummary(batch, showFinancials = false) {
  const brand = batch.brands?.name || 'Independent'
  let subtotal = 0
  let totalPieces = 0
  let totalShippedCount = 0

  const lines = batch.items.map((it, idx) => {
    const qty = (it.product_sizes || []).reduce((acc, s) => acc + (Number(s.quantity) || 0), 0)
    const shippedQty = (it.shipments || []).reduce((acc, s) => acc + (Number(s.quantity) || 0), 0)
    totalPieces += qty
    totalShippedCount += shippedQty

    const rate = Number(it.price_per_piece || 0)
    const lineTotal = it.total_amount != null ? Number(it.total_amount) : (rate * qty)
    subtotal += (rate * qty)

    const rateText = (showFinancials && rate > 0) ? ` @ ₹${rate.toLocaleString('en-IN')}/pc` : ''
    const totalText = (showFinancials && lineTotal > 0) ? ` = ₹${lineTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : ''

    let dispatchLine = ''
    if (shippedQty > 0) {
      const sizeBreakdown = (it.shipments || []).reduce((acc, s) => {
        const key = s.size_label || 'Mixed'
        acc[key] = (acc[key] || 0) + Number(s.quantity)
        return acc
      }, {})
      const sizeStr = Object.entries(sizeBreakdown).map(([sz, count]) => `${sz}: ${count}`).join(', ')
      dispatchLine = `\n   ↳ Dispatched: ${shippedQty} pcs (${sizeStr}) | Pending: ${Math.max(0, qty - shippedQty)} pcs`
    }

    return `${idx + 1}. *${it.name}* — ${qty} pcs${rateText}${totalText}${dispatchLine}`
  }).join('\n')

  const sampleItem = batch.items[0]
  const gstRate = sampleItem?.gst_rate != null ? Number(sampleItem.gst_rate) : 5
  const gstAmount = subtotal > 0 ? (subtotal * gstRate) / 100 : 0
  const grandTotal = subtotal > 0 ? Math.round(subtotal + gstAmount) : 0

  let totalsBlock = `*Total Volume:* ${totalPieces} pcs`
  if (totalShippedCount > 0) {
    totalsBlock += ` (${totalShippedCount} pcs dispatched, ${Math.max(0, totalPieces - totalShippedCount)} pcs pending)`
  }

  if (showFinancials && subtotal > 0) {
    totalsBlock += `\n*Subtotal:* ₹${subtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
*GST (${gstRate}%):* ₹${gstAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
*Grand Total:* ₹${grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
  }

  return `*NEEDLE POINT — ORDER RUN SUMMARY*
*PO:* ${batch.po_number}
*Brand:* ${brand}

*Garments:*
${lines}

------------------------------
${totalsBlock}`
}

export default function Orders() {
  const { user } = useAuth()
  const isClient = user?.role === 'client'
  const canCreate = can(user, 'create_orders')
  const showFinancials = can(user, 'view_financials')

  const [rawProducts, setRawProducts] = useState([])
  const [brands, setBrands] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [selectedBatch, setSelectedBatch] = useState(null)
  const [filterBrand, setFilterBrand] = useState('')
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState(false)

  const load = async () => {
    setLoading(true)
    let prodQuery = supabase
      .from('products')
      .select('*, brands(name), product_sizes(size_label, quantity), shipments(size_label, quantity, dispatched_at)')
      .order('created_at', { ascending: false })

    if (isClient && user?.brandId) {
      prodQuery = prodQuery.eq('brand_id', user.brandId)
    }

    const { data: prods } = await prodQuery
    const { data: brs } = await supabase.from('brands').select('*').order('name')
    setRawProducts(prods || [])
    setBrands(brs || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [user?.brandId])

  const groupedOrders = (() => {
    const groups = []
    const poMap = new Map()

    for (const p of rawProducts) {
      if (p.po_number && p.po_number.trim() !== '') {
        const key = `${p.brand_id || 'nobrand'}_${p.po_number.trim().toUpperCase()}`
        if (!poMap.has(key)) {
          const batch = {
            isBatch: true,
            id: key,
            po_number: p.po_number.trim().toUpperCase(),
            brand_id: p.brand_id,
            brands: p.brands,
            created_at: p.created_at,
            items: [],
          }
          poMap.set(key, batch)
          groups.push(batch)
        }
        poMap.get(key).items.push(p)
      } else {
        groups.push({ isBatch: false, ...p })
      }
    }

    return groups.map(g => {
      if (g.isBatch && g.items.length === 1) {
        return { isBatch: false, ...g.items[0] }
      }
      return g
    })
  })()

  const filtered = groupedOrders
    .filter(g => (!isClient && filterBrand ? g.brand_id === filterBrand : true))
    .filter(g => {
      if (!search.trim()) return true
      const q = search.trim().toLowerCase()
      if (g.isBatch) {
        return (
          g.po_number?.toLowerCase().includes(q) ||
          g.brands?.name?.toLowerCase().includes(q) ||
          g.items.some(it => it.name?.toLowerCase().includes(q) || it.style_code?.toLowerCase().includes(q))
        )
      }
      return (
        g.name?.toLowerCase().includes(q) ||
        g.style_code?.toLowerCase().includes(q) ||
        g.brands?.name?.toLowerCase().includes(q) ||
        g.po_number?.toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      const isFinished = (item) => {
        if (item.isBatch) {
          return item.items.every(it => it.status === 'completed' || it.stage === 'packed' || it.status === 'on_hold')
        }
        return item.status === 'completed' || item.stage === 'packed' || item.status === 'on_hold'
      }

      const aDone = isFinished(a) ? 1 : 0
      const bDone = isFinished(b) ? 1 : 0
      if (aDone !== bDone) return aDone - bDone

      return new Date(b.created_at) - new Date(a.created_at)
    })

  const handleCopySummary = async () => {
    if (!selectedBatch) return
    const text = generateConciseBatchSummary(selectedBatch, showFinancials)
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2">
        <div>
          <h2 className="text-xl font-bold text-gray-100">Orders</h2>
          {isClient && <p className="text-xs text-brand-400 font-medium">Viewing production runs for {user.name}</p>}
        </div>
        {canCreate && (
          <Link
            to="/orders/new"
            className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-4 py-2 font-semibold text-sm"
          >
            + Add Order
          </Link>
        )}
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by garment, style code, or PO number..."
        className="w-full bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 mb-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
      />

      {!isClient && brands.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-3 mb-2">
          <button
            onClick={() => setFilterBrand('')}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${filterBrand === '' ? 'bg-brand-600 text-white' : 'bg-gray-800 border border-gray-700 text-gray-300'}`}
          >
            All Brands
          </button>
          {brands.map(b => (
            <button
              key={b.id}
              onClick={() => setFilterBrand(b.id)}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${filterBrand === b.id ? 'bg-brand-600 text-white' : 'bg-gray-800 border border-gray-700 text-gray-300'}`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-center py-10">Loading orders...</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500 text-center py-10">No orders found.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.map((item) => {
            if (item.isBatch) {
              const batchQty = item.items.reduce((acc, p) => {
                return acc + (p.product_sizes || []).reduce((qAcc, s) => qAcc + (Number(s.quantity) || 0), 0)
              }, 0)

              const batchShipped = item.items.reduce((acc, p) => {
                return acc + (p.shipments || []).reduce((sAcc, s) => sAcc + (Number(s.quantity) || 0), 0)
              }, 0)

              const batchGrandTotal = item.items.reduce((acc, p) => {
                if (p.total_amount != null) return acc + Number(p.total_amount)
                const pQty = (p.product_sizes || []).reduce((qAcc, s) => qAcc + (Number(s.quantity) || 0), 0)
                const pSub = p.price_per_piece ? Number(p.price_per_piece) * pQty : 0
                return acc + (pSub > 0 ? Math.round(pSub + (pSub * (p.gst_rate ?? 5)) / 100) : 0)
              }, 0)

              const previews = item.items.slice(0, 4)

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedBatch(item)}
                  className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-brand-500/60 transition cursor-pointer flex flex-col group relative"
                >
                  <div className="aspect-square bg-gray-950 p-1.5 grid grid-cols-2 gap-1 overflow-hidden relative">
                    {previews.map((p, pIdx) => (
                      <div key={p.id || pIdx} className="w-full h-full bg-gray-800 rounded overflow-hidden flex items-center justify-center">
                        {p.cover_photo_url ? (
                          <img src={p.cover_photo_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition" />
                        ) : (
                          <span className="text-sm text-gray-600">👕</span>
                        )}
                      </div>
                    ))}
                    {item.items.length > 4 && (
                      <span className="absolute bottom-2 right-2 bg-black/80 text-white font-mono text-[10px] px-1.5 py-0.5 rounded backdrop-blur">
                        +{item.items.length - 4} more
                      </span>
                    )}
                  </div>

                  <div className="p-2.5 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="text-xs font-mono font-bold text-brand-400 truncate">{item.po_number}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-950 border border-brand-800/60 text-brand-300 font-semibold">
                          {item.items.length} Products
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 truncate">{item.brands?.name || 'Independent'}</p>
                    </div>

                    <div className="mt-2 pt-1.5 border-t border-gray-800 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-gray-400">{batchQty} pcs</span>
                        {batchShipped > 0 && (
                          <span className="ml-1 text-[10px] px-1 py-0.2 rounded bg-emerald-950/80 border border-emerald-800/60 text-emerald-400 font-medium">
                            🚚 {batchShipped}
                          </span>
                        )}
                      </div>
                      {showFinancials && batchGrandTotal > 0 && (
                        <span className="font-bold text-gray-100">
                          ₹{batchGrandTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            }

            const p = item
            const totalQty = (p.product_sizes || []).reduce((acc, s) => acc + (Number(s.quantity) || 0), 0)
            const totalShipped = (p.shipments || []).reduce((sum, s) => sum + (Number(s.quantity) || 0), 0)
            const subtotal = p.price_per_piece && totalQty > 0 ? Number(p.price_per_piece) * totalQty : 0
            const gstRate = p.gst_rate ?? 5
            const calculatedTotal = subtotal > 0 ? Math.round(subtotal + (subtotal * gstRate) / 100) : 0
            const grandTotal = p.total_amount != null ? Number(p.total_amount) : calculatedTotal

            return (
              <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition relative">
                {!isClient && can(user, 'edit_garments') && (
                  <button
                    onClick={(e) => { e.preventDefault(); setEditing(p) }}
                    className="absolute top-1.5 right-1.5 z-10 bg-black/60 hover:bg-black/80 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm"
                    aria-label="Edit order"
                  >
                    ✎
                  </button>
                )}
                <Link to={`/products/${p.id}`}>
                  <div className="aspect-square bg-gray-800">
                    {p.cover_photo_url ? (
                      <img src={p.cover_photo_url} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl text-gray-600">👕</div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="font-semibold text-sm truncate text-gray-100">{p.name}</p>
                    <p className="text-xs text-gray-400 truncate">{p.brands?.name || 'No brand'}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {p.status && (
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_LABEL[p.status]?.color || 'bg-gray-800 text-gray-400'}`}>
                          {STATUS_LABEL[p.status]?.text || p.status}
                        </span>
                      )}
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${stageInfo(p.stage).color}`}>
                        {stageInfo(p.stage).label}
                      </span>
                    </div>

                    <div className="mt-2 pt-1.5 border-t border-gray-800 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-gray-400">{totalQty} pcs</span>
                        {totalShipped > 0 && (
                          <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-800/60 text-emerald-400 font-medium">
                            🚚 {totalShipped}
                          </span>
                        )}
                      </div>
                      {showFinancials && grandTotal > 0 && (
                        <span className="font-semibold text-brand-400">
                          ₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </div>
            )
          })}
        </div>
      )}

      {/* BATCH DETAIL MODAL */}
      {selectedBatch && (
        <Modal onClose={() => setSelectedBatch(null)}>
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-100">Order Run: {selectedBatch.po_number}</h3>
              <span className="text-xs bg-brand-950 text-brand-300 border border-brand-800 px-2.5 py-1 rounded-full font-semibold">
                {selectedBatch.items.length} Products
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{selectedBatch.brands?.name || 'Independent'}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              type="button"
              onClick={handleCopySummary}
              className="bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 rounded-xl py-2.5 px-3 text-xs font-semibold flex items-center justify-center gap-2 transition"
            >
              <span>{copied ? '✓' : '📋'}</span>
              <span>{copied ? 'Summary Copied!' : 'Copy Summary'}</span>
            </button>

            <button
              type="button"
              onClick={() => exportBatchOrderPDF({ batch: selectedBatch, brandName: selectedBatch.brands?.name })}
              className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl py-2.5 px-3 text-xs font-semibold flex items-center justify-center gap-2 transition"
            >
              <span>📄</span>
              <span>Print PDF</span>
            </button>
          </div>

          <p className="text-xs text-gray-500 mb-2 font-medium">Garments in this order:</p>

          <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
            {selectedBatch.items.map((prod) => {
              const qty = (prod.product_sizes || []).reduce((acc, s) => acc + (Number(s.quantity) || 0), 0)
              const prodShipped = (prod.shipments || []).reduce((acc, s) => acc + (Number(s.quantity) || 0), 0)

              const shippedSizes = (prod.shipments || []).reduce((acc, s) => {
                const key = s.size_label || 'Mixed'
                acc[key] = (acc[key] || 0) + Number(s.quantity)
                return acc
              }, {})

              const shippedBreakdown = Object.entries(shippedSizes)
                .map(([sz, count]) => `${sz}: ${count}`)
                .join(', ')

              return (
                <Link
                  key={prod.id}
                  to={`/products/${prod.id}`}
                  className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-950 border border-gray-800 hover:border-gray-700 transition"
                >
                  <div className="w-14 h-14 rounded-lg bg-gray-800 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {prod.cover_photo_url ? (
                      <img src={prod.cover_photo_url} alt={prod.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xl text-gray-600">👕</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-100 truncate">{prod.name}</p>
                    <p className="text-xs text-gray-400">
                      {prod.style_code ? `Style: ${prod.style_code} · ` : ''}{qty} pcs
                    </p>
                    
                    {prodShipped > 0 ? (
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="t