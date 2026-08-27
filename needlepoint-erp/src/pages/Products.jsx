import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, uploadPhoto } from '../supabaseClient.js'

const STATUS_LABEL = {
  in_production: { text: 'In Production', color: 'bg-blue-100 text-blue-700' },
  sampling: { text: 'Sampling', color: 'bg-yellow-100 text-yellow-700' },
  completed: { text: 'Completed', color: 'bg-green-100 text-green-700' },
  on_hold: { text: 'On Hold', color: 'bg-gray-200 text-gray-600' },
}

export default function Products() {
  const [products, setProducts] = useState([])
  const [brands, setBrands] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
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
        <h2 className="text-xl font-bold">Garments</h2>
        <button
          onClick={() => setShowForm(true)}
          className="bg-brand-600 text-white rounded-xl px-4 py-2 font-semibold text-sm"
        >
          + Add Garment
        </button>
      </div>

      {brands.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-3 mb-2">
          <button
            onClick={() => setFilterBrand('')}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${filterBrand === '' ? 'bg-brand-600 text-white' : 'bg-white border'}`}
          >All Brands</button>
          {brands.map(b => (
            <button
              key={b.id}
              onClick={() => setFilterBrand(b.id)}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${filterBrand === b.id ? 'bg-brand-600 text-white' : 'bg-white border'}`}
            >{b.name}</button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-gray-400 text-center py-10">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-400 text-center py-10">No garments yet. Tap "Add Garment" to start.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.map((p) => (
            <Link
              to={`/products/${p.id}`}
              key={p.id}
              className="bg-white rounded-xl overflow-hidden shadow-sm border hover:shadow-md transition"
            >
              <div className="aspect-square bg-gray-100">
                {p.cover_photo_url ? (
                  <img src={p.cover_photo_url} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl text-gray-300">👕</div>
                )}
              </div>
              <div className="p-2.5">
                <p className="font-semibold text-sm truncate">{p.name}</p>
                <p className="text-xs text-gray-500 truncate">{p.brands?.name || 'No brand'}</p>
                {p.status && (
                  <span className={`inline-block mt-1.5 text-[11px] px-2 py-0.5 rounded-full ${STATUS_LABEL[p.status]?.color || 'bg-gray-100'}`}>
                    {STATUS_LABEL[p.status]?.text || p.status}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {showForm && (
        <AddGarmentModal
          brands={brands}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load() }}
        />
      )}
    </div>
  )
}

function AddGarmentModal({ brands, onClose, onSaved }) {
  const [name, setName] = useState('')
  const [styleCode, setStyleCode] = useState('')
  const [brandId, setBrandId] = useState(brands[0]?.id || '')
  const [status, setStatus] = useState('in_production')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      let cover_photo_url = null
      if (file) cover_photo_url = await uploadPhoto(file, 'products')
      await supabase.from('products').insert({
        name: name.trim(),
        style_code: styleCode.trim() || null,
        brand_id: brandId || null,
        status,
        cover_photo_url,
      })
      onSaved()
    } catch (err) {
      alert('Could not save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-30">
      <form onSubmit={save} className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold mb-4">Add Garment</h3>

        <label className="block text-sm font-medium mb-1">Photo</label>
        <input type="file" accept="image/*" capture="environment"
          onChange={(e) => setFile(e.target.files[0])}
          className="w-full mb-3 text-sm" />

        <label className="block text-sm font-medium mb-1">Garment name*</label>
        <input value={name} onChange={(e) => setName(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 mb-3" placeholder="e.g. Oversized Hoodie - Navy" required />

        <label className="block text-sm font-medium mb-1">Style code</label>
        <input value={styleCode} onChange={(e) => setStyleCode(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 mb-3" placeholder="optional" />

        <label className="block text-sm font-medium mb-1">Brand</label>
        <select value={brandId} onChange={(e) => setBrandId(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 mb-3">
          <option value="">No brand</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        <label className="block text-sm font-medium mb-1">Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 mb-4">
          <option value="in_production">In Production</option>
          <option value="sampling">Sampling</option>
          <option value="completed">Completed</option>
          <option value="on_hold">On Hold</option>
        </select>

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 border rounded-xl py-2.5 font-semibold">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 bg-brand-600 text-white rounded-xl py-2.5 font-semibold disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
