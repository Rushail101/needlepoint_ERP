import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, uploadPhoto } from '../supabaseClient.js'
import Modal, { FormActions, inputClass, labelClass } from '../components/Modal.jsx'

const STATUS_LABEL = {
  in_production: { text: 'In Production', color: 'bg-blue-900/50 text-blue-300' },
  sampling: { text: 'Sampling', color: 'bg-yellow-900/50 text-yellow-300' },
  completed: { text: 'Completed', color: 'bg-green-900/50 text-green-300' },
  on_hold: { text: 'On Hold', color: 'bg-gray-800 text-gray-400' },
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
        <h2 className="text-xl font-bold text-gray-100">Garments</h2>
        <button
          onClick={() => setShowForm(true)}
          className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-4 py-2 font-semibold text-sm"
        >
          + Add Garment
        </button>
      </div>

      {brands.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-3 mb-2">
          <button
            onClick={() => setFilterBrand('')}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${filterBrand === '' ? 'bg-brand-600 text-white' : 'bg-gray-800 border border-gray-700 text-gray-300'}`}
          >All Brands</button>
          {brands.map(b => (
            <button
              key={b.id}
              onClick={() => setFilterBrand(b.id)}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${filterBrand === b.id ? 'bg-brand-600 text-white' : 'bg-gray-800 border border-gray-700 text-gray-300'}`}
            >{b.name}</button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-center py-10">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500 text-center py-10">No garments yet. Tap "Add Garment" to start.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.map((p) => (
            <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition relative">
              <button
                onClick={(e) => { e.preventDefault(); setEditing(p) }}
                className="absolute top-1.5 right-1.5 z-10 bg-black/60 hover:bg-black/80 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm"
                aria-label="Edit garment"
              >✎</button>
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
                  {p.status && (
                    <span className={`inline-block mt-1.5 text-[11px] px-2 py-0.5 rounded-full ${STATUS_LABEL[p.status]?.color || 'bg-gray-800 text-gray-400'}`}>
                      {STATUS_LABEL[p.status]?.text || p.status}
                    </span>
                  )}
                </div>
              </Link>
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
          brands={brands}
          product={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

function GarmentForm({ brands, product, onClose, onSaved }) {
  const isEdit = !!product
  const [name, setName] = useState(product?.name || '')
  const [styleCode, setStyleCode] = useState(product?.style_code || '')
  const [brandId, setBrandId] = useState(product?.brand_id || brands[0]?.id || '')
  const [status, setStatus] = useState(product?.status || 'in_production')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      let cover_photo_url = product?.cover_photo_url || null
      if (file) cover_photo_url = await uploadPhoto(file, 'products')
      const payload = {
        name: name.trim(),
        style_code: styleCode.trim() || null,
        brand_id: brandId || null,
        status,
        cover_photo_url,
      }
      if (isEdit) {
        await supabase.from('products').update(payload).eq('id', product.id)
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

  const remove = async () => {
    if (!confirm(`Delete "${product.name}"? This removes all its photos, sizes, work history and sample versions too.`)) return
    setSaving(true)
    try {
      await supabase.from('products').delete().eq('id', product.id)
      onSaved()
    } catch (err) {
      alert('Could not delete: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <form onSubmit={save}>
        <h3 className="text-lg font-bold mb-4 text-gray-100">{isEdit ? 'Edit Garment' : 'Add Garment'}</h3>

        {product?.cover_photo_url && !file && (
          <img src={product.cover_photo_url} className="w-full h-32 object-cover rounded-lg mb-2" />
        )}
        <label className={labelClass}>Photo</label>
        <input type="file" accept="image/*" capture="environment"
          onChange={(e) => setFile(e.target.files[0])}
          className="w-full mb-3 text-sm text-gray-300" />

        <label className={labelClass}>Garment name*</label>
        <input value={name} onChange={(e) => setName(e.target.value)}
          className={inputClass} placeholder="e.g. Oversized Hoodie - Navy" required />

        <label className={labelClass}>Style code</label>
        <input value={styleCode} onChange={(e) => setStyleCode(e.target.value)}
          className={inputClass} placeholder="optional" />

        <label className={labelClass}>Brand</label>
        <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className={inputClass}>
          <option value="">No brand</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        <label className={labelClass}>Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
          <option value="in_production">In Production</option>
          <option value="sampling">Sampling</option>
          <option value="completed">Completed</option>
          <option value="on_hold">On Hold</option>
        </select>

        <FormActions onCancel={onClose} saving={saving} onDelete={isEdit ? remove : null} />
      </form>
    </Modal>
  )
}
