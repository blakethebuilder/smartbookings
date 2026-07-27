/**
 * Evolution API — WhatsApp integration
 * Instance: smarthq2
 * Docs: https://doc.evolution-api.com
 */

const EVOLUTION_URL = process.env.EVO_API_URL || ''
const EVOLUTION_KEY = process.env.EVO_API_KEY || ''
const EVOLUTION_INSTANCE = process.env.EVO_INSTANCE || 'smarthq2'

const BASE = `${EVOLUTION_URL}`

async function api(method, path, body = null, isFormData = false) {
  const headers = { 'apiKey': EVOLUTION_KEY }
  if (!isFormData) headers['Content-Type'] = 'application/json'

  const opts = { method, headers }
  if (body) opts.body = isFormData ? body : JSON.stringify(body)

  const res = await fetch(`${BASE}${path}`, opts)
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Evolution API ${method} ${path}: ${res.status} - ${err}`)
  }
  return res.json().catch(() => null)
}

// Format SA number: 0763620765 → 2763620765
function formatNumber(phone) {
  let num = phone.replace(/\D/g, '')
  if (num.startsWith('0')) num = '27' + num.slice(1)
  if (!num.startsWith('27')) num = '27' + num
  return num
}

/**
 * Send a text WhatsApp message
 */
async function sendText(number, text) {
  if (!EVOLUTION_KEY) {
    console.log('[WhatsApp] Not configured — skipping send')
    return null
  }
  const result = await api('POST', `/message/sendText/${EVOLUTION_INSTANCE}`, {
    number: formatNumber(number),
    text,
    delay: 1,
  })
  console.log(`[WhatsApp] Sent to ${number}: ${text.substring(0, 50)}...`)
  return result
}

/**
 * Send a booking confirmation
 */
async function sendBookingConfirmation(booking) {
  const roomName = booking.room_name || 'your booking'
  const date = booking.date || ''
  const time = booking.time || ''
  const reference = booking.reference || ''
  const venueName = booking.venue_name || 'SmartBookings'

  const msg = `Hi ${booking.customer_name}! 🎉\n\nYour booking at ${venueName} is confirmed:\n📋 Ref: ${reference}\n📍 ${roomName}\n📅 ${date}\n⏰ ${time}\n👥 ${booking.player_count || 1} person(s)\n\nPlease arrive 15 minutes early. Need to change? Reply to this message.`

  return sendText(booking.customer_phone, msg)
}

/**
 * Send a reminder (configurable hours before)
 */
async function sendReminder(booking, venueName = 'SmartBookings') {
  const msg = `⏰ Reminder! Your booking at ${venueName} is tomorrow at ${booking.time}.\n📋 Ref: ${booking.reference}\n\nReply STOP to opt out.`
  return sendText(booking.customer_phone, msg)
}

/**
 * Send a payment confirmation
 */
async function sendPaymentConfirmation(booking) {
  const msg = `✅ Payment received!\n📋 Ref: ${booking.reference}\nAmount: R${booking.total_amount}\n\nSee you at ${booking.venue_name || 'SmartBookings'}!`
  return sendText(booking.customer_phone, msg)
}

/**
 * Send the waiver link to a customer
 */
async function sendWaiverLink(phone, name, waiverUrl, venueName = 'SmartBookings') {
  const msg = `Hi ${name}! Please sign your indemnity waiver before arriving at ${venueName}:\n\n${waiverUrl}\n\nIt only takes a minute. See you soon! 🎯`
  return sendText(phone, msg)
}

/**
 * Check if numbers are on WhatsApp
 */
async function checkNumbers(numbers) {
  const result = await api('POST', `/chat/whatsappNumbers/${EVOLUTION_INSTANCE}`, {
    numbers: numbers.map(formatNumber),
  })
  return result
}

/**
 * Check if API is alive
 */
async function healthCheck() {
  try {
    await api('GET', '/')
    return true
  } catch {
    return false
  }
}

module.exports = {
  sendText,
  sendBookingConfirmation,
  sendReminder,
  sendPaymentConfirmation,
  sendWaiverLink,
  checkNumbers,
  healthCheck,
  formatNumber,
}
