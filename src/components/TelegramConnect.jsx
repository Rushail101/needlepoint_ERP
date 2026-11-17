// "📲 Telegram": connect this person's Telegram to the Needle Point bot, so
// they can log work (and, for the admin / floor manager, add orders and
// dispatches) by chatting with it. One tap on the phone: the link opens the
// bot with a one-time code already filled in.
import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import { supabase } from '../supabaseClient.js'

export default function TelegramConnect({ user, onClose }) {
  const [info, setInfo] = useState(null)
  const [err, setErr] = useState('')
  const isStaff = ['admin', 'manager', 'floor_manager'].includes(String(user?.role || '').toLowerCase())

  const getCode = async () => {
    setErr(''); setInfo(null)
    const { data, error } = await supabase.rpc('ops_telegram_link_code')
    if (error) setErr(/Could not find the function|PGRST202/i.test(error.message) ? 'The database needs the Telegram update (ADD_telegram_bot.sql).' : error.message)
    else setInfo(data)
  }
  useEffect(() => { getCode() }, [])

  const link = info?.bot ? `https://t.me/${info.bot}?start=${info.code}` : null
  return (
    <Modal onClose={onClose}>
      <h3 className="text-lg font-bold text-gray-100 mb-1">📲 Use Needle Point on Telegram</h3>
      <p className="text-xs text-gray-400 mb-4 leading-relaxed">
        Chat with the bot instead of opening the app. Type things like <code className="text-gray-200">cayani tee 40 stitched</code> or tap through buttons. No order numbers needed.
        {isStaff ? ' You can log work, change stages, record dispatches and add new orders.' : ' You can log your work.'}
      </p>
      {err && <p className="text-xs text-red-300 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2 mb-3">{err}</p>}
      {!info && !err && <p className="text-sm text-gray-400">Getting your code…</p>}
      {info && (
        <>
          {link ? (
            <a href={link} target="_blank" rel="noreferrer"
              className="block text-center bg-[#229ED9] hover:bg-[#1c8dc2] text-white rounded-xl py-3 font-bold text-sm mb-3">
              Open Telegram &amp; connect
            </a>
          ) : (
            <p className="text-[11px] text-amber-300 bg-amber-950/30 border border-amber-900/60 rounded-lg px-3 py-2 mb-3">
              The bot isn't set up yet. The admin needs to do the one-time Telegram bot setup (see the README). You can still send the code below to the bot once it's running.
            </p>
          )}
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-3 text-center mb-2">
            <p className="text-[11px] text-gray-500 mb-1">or send this to {info.bot ? <b className="text-gray-300">@{info.bot}</b> : 'the bot'}</p>
            <p className="font-mono text-2xl font-black tracking-[0.3em] text-gray-100">/start {info.code}</p>
          </div>
          <p className="text-[11px] text-gray-500 text-center">The code works once and expires in 15 minutes. <button onClick={getCode} className="underline hover:text-gray-300">New code</button></p>
        </>
      )}
    </Modal>
  )
}
