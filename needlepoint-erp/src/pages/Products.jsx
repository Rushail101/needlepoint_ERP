import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, uploadPhoto } from '../supabaseClient.js'

const STATUS_LABEL = {
  in_production: { text: 'In Production', color: 'bg-blue-500/15 text-blue-300' },
  sampling: { text: 'Sampling', color: 'bg-amber-500/15 text-amber-300' },
  completed: { text: 'Completed', color: 'bg-emerald-500/15 text-emerald-300' },
  on_hold: { text: 'On Hold', color: 'bg-white/10 text-paper-300' },
}

export default function Products() {
  const [products, setProducts] = useState([])
  const [brands, setBrands] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [filterBrand, setFilterBrand] = useState('')

  const load = async () => {
    setLoading(true)
    const { data: prods } = await supabase
      .from('products')
      .select('*, brands(name)')
      .order('created_at', { ascending: false })
    const { data: brs } = await supabase.from('brands').select('*').order('name')
    setProducts(prods || [])
    setBrands(brs || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = filterBrand ? products.filter(p => p.brand_id === filterBrand) : products

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2">
        <h2 className="text-xl font-bold font-display">Garments</h2>
        <button
          onClick={() => setShowForm(true)}
          className="bg-thread-500 hover:bg-thread-600 text-ink-950 rounded-xl px-4 py-2 font-semibold text-sm transition-colors"
        >
          + Add Garment
        </button>
      </div>

      {brands.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-3 mb-2">
          <button
            onClick={() => setFilterBrand('')}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${filterBrand === '' ? 'bg-thread-500 text-ink-950 font-semibold' : 'bg-ink-900 border border-ink-700 text-paper-300'}`}
          >All Brands</button>
          {brands.map(b => (
            <button
              key={b.id}
              onClick={() => setFilterBrand(b.id)}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${filterBrand === b.id ? 'bg-thread-500 text-ink-950 font-semibold' : 'bg-ink-900 border border-ink-700 text-paper-300'}`}
            >{b.name}</button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-paper-400 text-center py-10">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-paper-400 text-center py-10">No garments yet. Tap "Add Garment" to start.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.map((p) => (
            <div key={p.id} className="relative bg-ink-900 seam-top border border-ink-700 rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:border-ink-600 transition">
              <Link to={`/products/${p.id}`}>
                <div className="aspect-square bg-ink-800">
                  {p.cover_photo_url ? (
                    <img src={p.cover_photo_url} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl text-paper-400">👕</div>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="font-semibold text-sm truncate text-paper-100">{p.name}</p>
                  <p className="text-xs text-paper-400 truncate">{p.brands?.name || 'No brand'}</p>
                  {p.status && (
                    <span className={`inline-block mt-1.5 text-[11px] px-2 py-0.5 rounded-full ${STATUS_LABEL[p.status]?.color || 'bg-white/10 text-paper-300'}`}>
                      {STATUS_LABEL[p.status]?.text || p.status}
                    </span>
                  )}
                </div>
              </Link>
              <button
                onClick={() => setEditing(p)}
                aria-label={`Edit ${p.name}`}
                className="absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-full bg-ink-950/80 border border-ink-700 text-xs text-paper-300 hover:text-thread-500 hover:border-thread-500 transition-colors"
              >✏️</button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <GarmentForm
          brands={brands}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load() }}
        />
      )}
      {editing && (
        <GarmentForm
          initial={editing}
          brands={brands}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

function GarmentForm({ initial, brands, onClose, onSaved }) {
  const isEdit = !!initial
  const [name, setName] = useState(initial?.name || '')
  const [styleCode, setStyleCode] = useState(initial?.style_code || '')
  const [brandId, setBrandId] = useState(initial?.brand_id || brands[0]?.id || '')
  const [status, setStatus] = useState(initial?.status || 'in_production')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      let cover_photo_url = initial?.cover_photo_url ?? null
      if (file) cover_photo_url = await uploadPhoto(file, 'products')
      const payload = {
        name: name.trim(),
        style_code: styleCode.trim() || null,
        brand_id: brandId || null,
        status,
        cover_photo_url,
      }
      if (isEdit) {
        await supabase.from('products').update(payload).eq('id', initial.id)
      } else {
        await supabase.from('products').insert(payload)
      }
      onSaved()
    } catch (err) {
      alert('Could not save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-30">
      <form onSubmit={save} className="bg-ink-900 seam-top border border-ink-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold font-display mb-4">{isEdit ? 'Edit Garment' : 'Add Garment'}</h3>

        <label className="block text-sm font-medium mb-1 text-paper-300">Photo</label>
        {isEdit && initial.cover_photo_url && !file && (
          <img src={initial.cover_photo_url} className="w-16 h-16 rounded-lg object-cover mb-2" />
        )}
        <input type="file" accept="image/*" capture="environment"
          onChange={(e) => setFile(e.target.files[0])}
          className="w-full mb-3 text-sm text-paper-300" />

        <label className="block text-sm font-medium mb-1 text-paper-300">Garment name*</label>
        <input value={name} onChange={(e) => setName(e.target.value)}
          className="w-full bg-ink-800 border border-ink-700 text-paper-100 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:border-thread-500" placeholder="e.g. Oversized Hoodie - Navy" required />

        <label className="block text-sm font-medium mb-1 text-paper-300">Style code</label>
        <input value={styleCode} onChange={(e) => setStyleCode(e.target.value)}
          className="w-full bg-ink-800 border border-ink-700 text-paper-100 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:border-thread-500" placeholder="optional" />

        <label className="block text-sm font-medium mb-1 text-paper-300">Brand</label>
        <select value={brandId} onChange={(e) => setBrandId(e.target.value)}
          className="w-full bg-ink-800 border border-ink-700 text-paper-100 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:border-thread-500">
          <option value="">No brand</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        <label className="block text-sm font-medium mb-1 text-paper-300">Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="w-full bg-ink-800 border border-ink-700 text-paper-100 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:border-thread-500">
          <option value="in_production">In Production</option>
          <option value="sampling">Sampling</option>
          <option value="completed">Completed</option>
          <option value="on_hold">On Hold</option>
        </select>

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 border border-ink-700 text-paper-100 hover:bg-ink-800 rounded-xl py-2.5 font-semibold transition-colors">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 bg-thread-500 hover:bg-thread-600 text-ink-950 rounded-xl py-2.5 font-semibold disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
