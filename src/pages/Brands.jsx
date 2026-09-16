function BrandForm({ brand, onClose, onSaved }) {
  const isEdit = !!brand
  const [name, setName] = useState(brand?.name || '')
  const [contact, setContact] = useState(brand?.contact_person || '')
  const [phone, setPhone] = useState(brand?.contact_phone || '')
  const [portalPassword, setPortalPassword] = useState(brand?.portal_password || '')
  const [portalActive, setPortalActive] = useState(brand?.portal_active ?? true)
  const [showPassword, setShowPassword] = useState(false)
  const [copied, setCopied] = useState(false)
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const handleCopy = async () => {
    if (!portalPassword) return
    await navigator.clipboard.writeText(portalPassword)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      let logo_url = brand?.logo_url || null
      if (file) logo_url = await uploadPhoto(file, 'brands')
      
      const payload = {
        name: name.trim(),
        contact_person: contact.trim() || null,
        contact_phone: phone.trim() || null,
        portal_password: portalPassword.trim() || null,
        portal_active: portalActive,
        logo_url,
      }

      if (isEdit) {
        await supabase.from('brands').update(payload).eq('id', brand.id)
      } else {
        await supabase.from('brands').insert(payload)
      }
      onSaved()
    } catch (err) {
      alert('Could not save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm(`Delete "${brand.name}"? Garments under this brand will be kept but unlinked.`)) return
    setSaving(true)
    try {
      await supabase.from('brands').delete().eq('id', brand.id)
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
        <h3 className="text-lg font-bold mb-4 text-gray-100">{isEdit ? 'Edit Brand' : 'Add Brand'}</h3>
        {brand?.logo_url && !file && <img src={brand.logo_url} className="w-16 h-16 object-cover rounded-lg mb-2" />}
        <label className={labelClass}>Logo / photo</label>
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} className="w-full mb-3 text-sm text-gray-300" />
        
        <label className={labelClass}>Brand name*</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
        
        <label className={labelClass}>Contact person</label>
        <input value={contact} onChange={(e) => setContact(e.target.value)} className={inputClass} />
        
        <label className={labelClass}>Phone</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />

        {/* Portal Credentials Section */}
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-3 mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-gray-300 uppercase tracking-wider">Client Portal Access</label>
            {portalPassword && (
              <button
                type="button"
                onClick={handleCopy}
                className="text-[11px] text-brand-400 hover:text-brand-300 font-semibold"
              >
                {copied ? '✓ Copied' : '📋 Copy Password'}
              </button>
            )}
          </div>

          <div className="relative mb-2">
            <input
              type={showPassword ? 'text' : 'password'}
              value={portalPassword}
              onChange={(e) => setPortalPassword(e.target.value)}
              placeholder="No password set yet"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-2.5 text-xs text-gray-400 hover:text-gray-200"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input
              type="checkbox"
              checked={portalActive}
              onChange={(e) => setPortalActive(e.target.checked)}
              className="rounded border-gray-700 bg-gray-900"
            />
            <span>Portal Login Active (uncheck to lock brand out)</span>
          </label>
        </div>

        <FormActions onCancel={onClose} saving={saving} onDelete={isEdit ? remove : null} />
      </form>
    </Modal>
  )
}
