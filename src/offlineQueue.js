// Work logs typed while the factory Wi-Fi is down are kept on the phone and
// sent automatically when the connection comes back.
import { supabase, uploadPhoto, compressImage, must } from './supabaseClient.js'

const KEY = 'np_worklog_queue'
const listeners = new Set()
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] } }
const write = q => { localStorage.setItem(KEY, JSON.stringify(q)); listeners.forEach(fn => fn(q.length)) }

export const pendingCount = () => read().length
export function onQueueChange(fn) { listeners.add(fn); return () => listeners.delete(fn) }

const isNetworkError = e => !navigator.onLine || /fetch|network|load failed|timeout/i.test(e?.message || '')

async function fileToDataURL(file) {
  const small = await compressImage(file, 1200, 0.75)
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(small) })
}
function dataURLToFile(url, name) {
  const [head, body] = url.split(',')
  const type = head.match(/data:(.*?);/)?.[1] || 'image/jpeg'
  const bin = atob(body); const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new File([arr], name, { type })
}

// Try to save now; if the network is the problem, queue it instead.
// Returns { queued: boolean, row? }.
export async function saveWorkLog(row, file) {
  try {
    const photo_url = file ? await uploadPhoto(file, 'worklog') : null
    const data = must(await supabase.from('work_logs').insert({ ...row, photo_url }).select().single(), 'Saving work log')
    return { queued: false, row: data }
  } catch (e) {
    if (!isNetworkError(e)) throw e
    const q = read()
    q.push({ row: { ...row, logged_at: row.logged_at || new Date().toISOString() }, photo: file ? await fileToDataURL(file) : null, at: Date.now() })
    write(q)
    return { queued: true }
  }
}

let flushing = false
export async function flushQueue() {
  if (flushing || !navigator.onLine) return 0
  flushing = true
  let sent = 0
  try {
    const q = read()
    const left = []
    for (const item of q) {
      try {
        const photo_url = item.photo ? await uploadPhoto(dataURLToFile(item.photo, `offline_${item.at}.jpg`), 'worklog') : null
        must(await supabase.from('work_logs').insert({ ...item.row, photo_url }), 'Sending queued work log')
        sent++
      } catch (e) {
        left.push(item)
        if (isNetworkError(e)) { left.push(...q.slice(q.indexOf(item) + 1)); break }
      }
    }
    write(left)
  } finally {
    flushing = false
  }
  return sent
}

if (typeof window !== 'undefined') window.addEventListener('online', () => { flushQueue() })
