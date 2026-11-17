// Settings → "Import from old project": one-time copy of the operations data
// from the previous Supabase project. See src/importOld.js.
import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '../supabaseClient.js'
import { inputClass, labelClass } from './Modal.jsx'
import { toast } from './Toast.jsx'
import { importOldProject, checkBeforeImport } from '../importOld.js'

const card = 'bg-gray-900 border border-gray-800 rounded-2xl p-4'

export default function ImportOldProject() {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [lines, setLines] = useState([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState('')

  const cleanUrl = url.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '')
  const sameProject = cleanUrl && cleanUrl === String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
  const valid = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(cleanUrl) && key.trim().length > 20 && !sameProject

  async function run() {
    setErr(''); setResult(null); setLines([])
    if (key.trim().startsWith('sb_secret') || /service_role/.test(atobSafe(key.split('.')[1]))) {
      setErr("That's a secret service key. Use the old project's anon / public key instead: it's the one the old app used, and it's safe to paste here.")
      return
    }
    setBusy(true)
    try {
      const blocker = await checkBeforeImport(supabase)
      if (blocker) throw new Error(blocker)
      const old = createClient(cleanUrl, key.trim(), { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'np-old-import' } })
      // quick check that the key and URL work before copying anything
      const probe = await old.from('brands').select('id', { head: true, count: 'exact' })
      if (probe.error) throw new Error(`Couldn't read the old project: ${probe.error.message}. Check the URL and anon key, and that the old project isn't paused.`)
      const log = (text, kind = 'ok') => setLines(l => [...l, { text, kind }])
      const s = await importOldProject({ old, db: supabase, oldUrl: cleanUrl, log })
      setResult(s)
      toast('Import finished', 'success')
    } catch (e) {
      setErr(e.message)
    }
    setBusy(false)
  }

  if (!open) return (
    <div className={card}>
      <p className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-1">Import from old project</p>
      <p className="text-[11px] text-gray-500 mb-3">Moving from the previous Supabase project? Copy its brands, orders, team, work logs, photos and logins into this one.</p>
      <button onClick={() => setOpen(true)} className="bg-gray-800 border border-gray-700 text-gray-100 rounded-xl px-4 py-2 text-xs font-bold">Set up import</button>
    </div>
  )

  return (
    <div className={card}>
      <p className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-1">Import from old project</p>
      <ol className="text-[12px] text-gray-400 leading-relaxed mb-3 list-decimal pl-4 space-y-0.5">
        <li>Open the <b className="text-gray-200">old</b> project in Supabase (click <i>Restore</i> first if it's paused).</li>
        <li>Project Settings → API (or API Keys → Legacy API keys): copy the <b className="text-gray-200">Project URL</b> and the <b className="text-gray-200">anon public</b> key. That's the same pair the old app used (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).</li>
        <li>Paste both below and press Import. Nothing in the old project is changed, and you can run it again safely.</li>
      </ol>
      <label className={labelClass}>Old project URL</label>
      <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://abcd1234.supabase.co" className={inputClass} disabled={busy} />
      <label className={labelClass}>Old project anon / public key</label>
      <input value={key} onChange={e => setKey(e.target.value)} placeholder="eyJhbGciOi…" className={inputClass + ' font-mono text-xs'} disabled={busy} />
      {sameProject && <p className="text-xs text-amber-300 mb-2">That's this project's URL. Paste the old project's instead.</p>}
      <div className="flex gap-2 items-center">
        <button onClick={run} disabled={!valid || busy} className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-40">
          {busy ? 'Importing… keep this tab open' : result ? 'Import again' : 'Import'}
        </button>
        {!busy && <button onClick={() => setOpen(false)} className="text-xs text-gray-500 hover:text-gray-300">Close</button>}
      </div>

      {err && <p className="mt-3 text-xs text-red-300 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">{err}</p>}

      {lines.length > 0 && (
        <div className="mt-3 bg-gray-950 border border-gray-800 rounded-xl p-3 max-h-64 overflow-y-auto font-mono text-[11px] leading-relaxed">
          {lines.map((l, i) => (
            <div key={i} className={l.kind === 'warn' ? 'text-amber-300' : l.kind === 'muted' ? 'text-gray-500' : 'text-emerald-300'}>
              {l.kind === 'ok' ? '✓ ' : l.kind === 'warn' ? '! ' : '· '}{l.text}
            </div>
          ))}
          {busy && <div className="text-gray-400 animate-pulse">working…</div>}
        </div>
      )}

      {result && (
        <div className="mt-3 text-xs text-gray-300 space-y-1.5">
          <p className="text-emerald-300 font-semibold">
            Done: {Object.entries(result.tables).filter(([, n]) => n).map(([t, n]) => `${n} ${t.replace(/_/g, ' ')}`).join(', ') || 'nothing to copy'}.
            {' '}{result.photos} photo{result.photos === 1 ? '' : 's'} copied.
          </p>
          {result.photoFails.length > 0 && <p className="text-amber-300">{result.photoFails.length} photo(s) couldn't be copied and still point at the old project. Re-upload them before deleting it.</p>}
          {result.pinsMissing.length > 0 && <p className="text-amber-300">Set a new PIN under Access for: {result.pinsMissing.join(', ')}.</p>}
          {result.portalsMissing.length > 0 && <p className="text-amber-300">Set a new portal password (Brands) for: {result.portalsMissing.join(', ')}.</p>}
          <p className="text-gray-400">Next: open Accounts → Production Orders → One-time setup to match brands with your parties. Keep the old project until you've checked everything here.</p>
        </div>
      )}
    </div>
  )
}

function atobSafe(s) { try { return atob(String(s || '').replace(/-/g, '+').replace(/_/g, '/')) } catch { return '' } }
