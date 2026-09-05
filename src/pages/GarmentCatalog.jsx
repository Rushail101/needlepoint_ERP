import { useEffect, useState } from 'react'
import { supabase, uploadPhoto } from '../supabaseClient.js'
import Modal, { FormActions, inputClass, labelClass } from '../components/Modal.jsx'
import { useAuth } from '../components/PinGate.jsx'
import { can } from '../permissions.js'

export default function GarmentCatalog() {
  const { user } = useAuth()
  const isClient = user?.role === 'client'
  const canEdit = can(user, 'manage_garment_catalog')

  const [garments, setGarments] = useState([])
  const [brands, setBrands] = useState([])
  const [orderCounts, setOrderCounts] = useState({})
  const [filterBrand, setFilterBrand] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = async () => {
    let gQuery = supabase.from('garments').select('*, brands(name)').order('name')
    if (isClient && user?.brandId) {
      gQuery = gQuery.eq('brand_id', user.brandId)
    }

    const { data: g } = await gQuery
    const { data: b } = await supabase.from('brands').select('*').order('name')
    setGarments(g || [])
    setBrands(b || [])

    const { data: orders } = await supabase.from('products').select('garment_id').not('garment_id', 'is', null)
    const counts = {}
    ;(orders || []).forEach(o => { counts[o.garment_id] = (counts[o.garment_id] || 0) + 1 })
    setOrderCounts(counts)
  }

  useEffect(() => { load() }, [user?.brandId])

  const filtered = garments.filter(g => (!isClient && filterBrand ? g.brand_id === filterBrand : true))

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div>
          <h2 className="text-xl font-bold text-gray-100">Garments Catalog</h2>
          {isClient && <p className="text-xs text-brand-400 font-medium">{user.name}'s Saved Styles</p>}
        </div>
        {canEdit && (
          <button
            onClick={() => setShowForm(true)}
            className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-4 py-2 font-semibold text-sm"
          >
            + Add Garment
          </button>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Reusable styles — pick one when creating a new order instead of re-entering it.
      </p>

      {!isClient && brands.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-3 mb-2">
          <button
            onClick={() => setFilterBrand('')}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${
              filterBrand === '' ? 'bg-brand-600 text-white' : 'bg-gray-800 border border-gray-700 text-gray-300'
            }`}
          >
            All Brands
          </button>
          {brands.map(b => (
            <button
              key={b.id}
              onClick={() => setFilterBrand(b.id)}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${
                filterBrand === b.id ? 'bg-brand-600 text-white' : 'bg-gray-800 border border-gray-700 text-gray-300'
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {filtered.map(g => (
          <div
            key={g.id}
            onClick={canEdit ? () => setEditing(g) : undefined}
            className={`bg-gray-900 border border-gray-800 rounded-xl overflow-hidden ${
              canEdit ? 'hover:border-gray-700 cursor-pointer' : ''
            }`}
          >
            <div className="aspect-square bg-gray-800">
              {g.cover_photo_url ? (
                <img src={g.cover_photo_url} alt={g.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl text-gray-600">👕</div>
              )}
            </div>
            <div className="p-2.5">
              <p className="font-semibold text-sm truncate text-gray-100">{g.name}</p>
              <p className="text-xs text-gray-400 truncate">{g.brands?.name || 'No brand'}</p>

              <div className="flex items-center justify-between mt-2 pt-1 border-t border-gray-800 text-xs">
                {g.default_price_per_piece != null ? (
                  <span className="font-semibold text-brand-400">
                    ₹{Number(g.default_price_per_piece).toLocaleString('en-IN')}
                  </span>
                ) : (
                  <span className="text-gray-500 text-[11px]">No default price</span>
                )}

                {orderCounts[g.id] > 0 && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                    {orderCounts[g.id]} order{orderCounts[g.id] > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-gray-500 text-sm col-span-full py-8 text-center">
            {filterBrand ? 'No garments found for this brand.' : 'No garments saved yet.'}
          </p>
        )}
      </div>

      {showForm && (
        <GarmentCatalogForm
          brands={brands}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load() }}
        />
      )}
      {editing && (
        <GarmentCatalogForm
          brands={brands}
          garment={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

export function GarmentCatalogForm({ brands, garment, onClose, onSaved }) {
  const { user } = useAuth()
  const isClient = user?.role === 'client'
  const isEdit = !!garment

  const [name, setName] = useState(garment?.name || '')
  const [styleCode, setStyleCode] = useState(garment?.style_code || '')
  const [brandId, setBrandId] = useState(garment?.brand_id || (isClient ? user.brandId : ''))
  const [defaultPrice, setDefaultPrice] = useState(
    garment?.default_price_per_piece != null ? String(garment.default_price_per_piece) : ''
  )
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      let cover_photo_url = garment?.cover_photo_url || null
      if (file) cover_photo_url = await uploadPhoto(file, 'garments')

      const finalBrandId = isClient ? user.brandId : (brandId || null)

      const payload = {
        name: name.trim(),
        style_code: styleCode.trim() || null,
        brand_id: finalBrandId,
        default_price_per_piece: defaultPrice !== '' ? Number(defaultPrice) : null,
        cover_photo_url,
      }

      if (isEdit) {
        await supabase.from('garments').update(payload).eq('id', garment.id)
      } else {
        await supabase.from('garments').insert(payload)
      }
      onSaved()
    } catch (err) {
      alert('Could not save garment: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm(`Delete "${garment.name}" from catalog? Existing orders referencing it are retained.`)) return
    setSaving(true)
    try {
      await supabase.from('garments').delete().eq('id', garment.id)
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
        {garment?.cover_photo_url && !file && (
          <div className="w-full h-36 rounded-lg overflow-hidden border border-gray-800 mb-2 flex items-center justify-center bg-gray-900">
            <img src={garment.cover_photo_url} className="w-full h-full object-cover" />
          </div>
        )}
        <label className={labelClass}>Photo</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files[0])}
          className="w-full mb-3 text-sm text-gray-300"
        />

        <label className={labelClass}>Garment name*</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          placeholder="e.g. Oversized Hoodie"
          required
        />

        <label className={labelClass}>Style code</label>
        <input
          value={styleCode}
          onChange={(e) => setStyleCode(e.target.value)}
          className={inputClass}
          placeholder="optional"
        />

        {!isClient && (
          <div>
            <label className={labelClass}>Brand</label>
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className={inputClass}>
              <option value="">No brand</option>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}

        <label className={labelClass}>Default Price per piece (₹)</label>
        <input
          value={defaultPrice}
          onChange={(e) => setDefaultPrice(e.target.value.replace(/[^0-9.]/g, ''))}
          inputMode="decimal"
          className={inputClass}
          placeholder="e.g. 550 (auto-fills when creating new order)"
        />

        <FormActions onCancel={onClose} saving={saving} onDelete={isEdit ? remove : null} />
      </form>
    </Modal>
  )
}
