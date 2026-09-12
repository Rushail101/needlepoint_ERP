// Sends a message to a Telegram chat via the Bot API. Configured via
// VITE_TELEGRAM_BOT_TOKEN and VITE_TELEGRAM_CHAT_ID — if either is missing,
// this silently does nothing, so the app works fine without Telegram set up.
export async function sendTelegramMessage(text) {
  const token = import.meta.env.VITE_TELEGRAM_BOT_TOKEN
  const chatId = import.meta.env.VITE_TELEGRAM_CHAT_ID
  if (!token || !chatId) return

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
      }),
    })
  } catch (err) {
    // Never let a notification failure block the actual order from being placed.
    console.error('Telegram notification failed:', err)
  }
}

// Escape HTML special characters to prevent Telegram formatting errors
function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Builds a Telegram message for new order creation.
 * @param {Object} order - The created order record.
 * @param {string} [brandName] - The name of the client/brand.
 * @param {Array} [garments] - List of garments/items in the order.
 */
export function formatNewOrderMessage({ order, brandName, garments = [] }) {
  const orderNum = escapeHtml(order.order_number || order.id || 'N/A')
  const brand = escapeHtml(brandName || order.brand_name || order.brand || 'N/A')
  const totalQty = order.total_quantity || order.quantity || garments.reduce((sum, g) => sum + (Number(g.quantity || g.qty) || 0), 0)
  const delivery = escapeHtml(order.delivery_date || 'Not specified')
  const notes = escapeHtml(order.notes || order.description || '')

  let garmentSection = '• No garment items specified'
  if (garments.length > 0) {
    garmentSection = garments
      .map((g) => {
        const name = escapeHtml(g.garment_name || g.style || g.name || 'Garment')
        const qty = g.quantity || g.qty || 0
        const color = escapeHtml(g.color || 'Standard')
        const size = g.size ? ` | Size: ${escapeHtml(g.size)}` : ''
        return `• <b>${name}</b>: ${qty} pcs (${color}${size})`
      })
      .join('\n')
  }

  return [
    `📦 <b>NEW ORDER PLACED</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `<b>Order #:</b> ${orderNum}`,
    `<b>Client / Brand:</b> ${brand}`,
    `<b>Total Quantity:</b> ${totalQty} pcs`,
    `<b>Delivery Date:</b> ${delivery}`,
    ``,
    `<b>Garment Details:</b>`,
    garmentSection,
    notes ? `\n<b>Notes:</b>\n<i>${notes}</i>` : '',
  ].filter(Boolean).join('\n')
}

/**
 * Builds a Telegram message when an order is edited.
 * @param {string|number} orderId - Order identifier or order number.
 * @param {Object} oldData - Original order fields.
 * @param {Object} newData - Updated order fields.
 * @param {string} [editor] - Label of user/role making the edit.
 */
export function formatOrderEditMessage({ orderNumber, oldData = {}, newData = {}, editor = 'Portal User' }) {
  const changes = []

  // Check each updated key against the old key
  Object.keys(newData).forEach((key) => {
    // Skip internal fields
    if (['updated_at', 'created_at', 'id'].includes(key)) return

    const prevVal = oldData[key]
    const nextVal = newData[key]

    if (nextVal !== undefined && prevVal !== undefined && String(prevVal) !== String(nextVal)) {
      const fieldLabel = key.replace(/_/g, ' ').toUpperCase()
      changes.push(`• <b>${fieldLabel}:</b> <s>${escapeHtml(prevVal)}</s> ➔ <b>${escapeHtml(nextVal)}</b>`)
    } else if (prevVal === undefined && nextVal !== undefined) {
      const fieldLabel = key.replace(/_/g, ' ').toUpperCase()
      changes.push(`• <b>${fieldLabel}:</b> <b>${escapeHtml(nextVal)}</b>`)
    }
  })

  return [
    `✏️ <b>ORDER UPDATED</b>`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `<b>Order #:</b> ${escapeHtml(orderNumber)}`,
    `<b>Edited By:</b> ${escapeHtml(editor)}`,
    ``,
    `<b>Changes Made:</b>`,
    changes.length > 0 ? changes.join('\n') : '• Details were modified',
  ].join('\n')
}
