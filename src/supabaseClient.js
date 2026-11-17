import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Session token from the server-side login (see migration 008). Every request
// carries it as x-ops-token, which is what the database checks once
// migration 009 (lockdown) is on. Set by PinGate.
let sessionToken = null
export function setSessionToken(token) { sessionToken = token || null }

// The operations tables live in their own `ops` schema, so this app can share a
// Supabase project with the accounts app and anything else without clashing.
export const OPS_SCHEMA = 'ops'
export const PHOTO_BUCKET = 'ops-photos'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: OPS_SCHEMA },
  global: {
    fetch: (input, init = {}) => {
      const headers = new Headers(init.headers || {})
      if (sessionToken) headers.set('x-ops-token', sessionToken)
      return fetch(input, { ...init, headers })
    },
  },
})

// supabase-js returns { data, error } instead of throwing. Wrap writes with
// must() so a failure is reported instead of silently looking like success.
export function must(res, what = 'Save') {
  if (res?.error) throw new Error(`${what} failed: ${res.error.message}`)
  return res?.data
}

// Phone photos are 3–5 MB; shrink to ≤1600 px JPEG (~200–400 KB) before upload.
// Faster on the factory Wi-Fi and keeps Storage within the free tier.
export async function compressImage(file, maxSide = 1600, quality = 0.82) {
  if (!file?.type?.startsWith('image/') || file.type === 'image/gif' || file.size < 350 * 1024) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

// Uploads a File to the ops-photos bucket (in a folder, e.g. 'products' or
// 'worklog') and returns its public URL. Images are compressed first.
export async function uploadPhoto(file, folder = 'products') {
  const upload = await compressImage(file)
  const ext = upload.name.split('.').pop()
  const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`
  const bucket = PHOTO_BUCKET

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(fileName, upload, {
      cacheControl: '3600',
      upsert: false,
      contentType: upload.type,
    })

  if (uploadError) throw uploadError

  const { data } = supabase.storage.from(bucket).getPublicUrl(fileName)
  return data.publicUrl
}

// Settings stored in ops_settings (sample fee etc.), with defaults if the table
// isn't there yet.
const SETTING_DEFAULTS = { sample_fee: 5000, sample_gst: 18, default_lead_days: 21 }
let settingsCache = null
export async function getSettings(force = false) {
  if (settingsCache && !force) return settingsCache
  const { data, error } = await supabase.from('ops_settings').select('key, value')
  settingsCache = { ...SETTING_DEFAULTS }
  if (!error) (data || []).forEach(r => { settingsCache[r.key] = r.value })
  return settingsCache
}
export async function saveSetting(key, value) {
  must(await supabase.from('ops_settings').upsert({ key, value, updated_at: new Date().toISOString() }), 'Saving setting')
  settingsCache = null
}
