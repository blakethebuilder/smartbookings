const express = require('express')
const crypto = require('crypto')
const http = require('http')
const rateLimit = require('express-rate-limit')
const { generateSignature } = require('./payfast-sign')
const whatsapp = require('./whatsapp')

const app = express()
app.use(express.urlencoded({ extended: false }))
app.use(express.json())

// Rate limiting: 10 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
})
app.use('/api/', limiter)

const PB_URL = process.env.PB_URL || 'http://localhost:8090'
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || 'admin@gr8escape.co.za'
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || 'admin123456'

// Payfast sandbox IPs (for IP validation)
const PAYFAST_IPS_SANDBOX = ['sandbox.payfast.co.za', '127.0.0.1']
const PAYFAST_IPS_LIVE = [
  'www.payfast.co.za',
  'standard.payfast.co.za',
  'w1w1.payfast.co.za',
  'w2w2.payfast.co.za',
  'qw2qw2.payfast.co.za',
]

// ─── ITN Endpoint ──────────────────────────────────────────
app.post('/api/payfast/itn', async (req, res) => {
  console.log('[ITN] Received payment notification')

  try {
    const pfData = req.body

    // 1. Verify signature
    if (!verifySignature(pfData)) {
      console.error('[ITN] Invalid signature')
      return res.status(400).send('INVALID')
    }
    console.log('[ITN] Signature valid')

    // 2. Verify with Payfast server (server-to-server)
    const serverValid = await verifyWithPayfast(pfData)
    if (!serverValid) {
      console.error('[ITN] Server validation failed')
      return res.status(400).send('INVALID')
    }
    console.log('[ITN] Server validation passed')

    // 3. Check payment status
    const { m_payment_id: reference, payment_status, amount_gross, custom_str1: bookingId } = pfData

    console.log(`[ITN] Booking: ${reference}, Status: ${payment_status}, Amount: R${amount_gross}`)

    // 4. Get booking and verify amount
    const booking = await getBooking(bookingId)
    if (!booking) {
      console.error(`[ITN] Booking not found: ${bookingId}`)
      return res.status(400).send('INVALID')
    }

    // Verify amount matches
    const expectedAmount = parseFloat(booking.total_amount).toFixed(2)
    if (amount_gross !== expectedAmount) {
      console.error(`[ITN] Amount mismatch: got ${amount_gross}, expected ${expectedAmount}`)
      return res.status(400).send('INVALID')
    }
    console.log(`[ITN] Amount verified: R${amount_gross}`)

    // 5. Process based on payment status
    if (payment_status === 'COMPLETE') {
      await updateBooking(bookingId, 'confirmed', 'paid', pfData)
      await updateSlot(booking.time_slot, 'full')
      console.log(`[ITN] Booking ${reference} CONFIRMED`)
    } else if (payment_status === 'FAILED') {
      await updateBooking(bookingId, 'cancelled', 'failed', pfData)
      await updateSlot(booking.time_slot, 'available')
      console.log(`[ITN] Booking ${reference} FAILED`)
    } else if (payment_status === 'CANCELLED') {
      await updateBooking(bookingId, 'cancelled', 'failed', pfData)
      await updateSlot(booking.time_slot, 'available')
      console.log(`[ITN] Booking ${reference} CANCELLED`)
    } else {
      console.log(`[ITN] Unhandled status: ${payment_status}`)
    }

    res.send('OK')
  } catch (err) {
    console.error('[ITN] Error:', err)
    res.status(500).send('INVALID')
  }
})

// ─── Signature Verification ────────────────────────────────
function verifySignature(pfData) {
  // Get passphrase from settings
  const passphrase = getPassphraseSync()

  // Build verification string from all fields except signature and passphrase
  const verifyFields = {}
  for (const [key, value] of Object.entries(pfData)) {
    if (key === 'signature') continue
    if (key === 'passphrase') continue
    if (value !== '' && value !== undefined && value !== null) {
      verifyFields[key] = value
    }
  }

  // Sort alphabetically by key
  const sorted = Object.keys(verifyFields).sort()

  // Build string: key=value&key2=value2
  let verifyString = sorted.map(key => `${key}=${encodeURIComponent(verifyFields[key]).replace(/%20/g, '+')}`).join('&')

  // Append passphrase
  if (passphrase) {
    verifyString += `&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, '+')}`
  }

  // MD5 hash
  const computedSignature = crypto.createHash('md5').update(verifyString).digest('hex')

  return computedSignature === pfData.signature
}

// ─── Server-to-Server Validation ───────────────────────────
async function verifyWithPayfast(pfData) {
  const mode = getSettingSync('payfast_mode') || 'sandbox'
  const host = mode === 'live' ? 'www.payfast.co.za' : 'sandbox.payfast.co.za'

  return new Promise((resolve) => {
    const postData = Object.entries(pfData)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&')

    const options = {
      hostname: host,
      path: '/eng/query/validate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    }

    const req = http.request(options, (res) => {
      let body = ''
      res.on('data', (chunk) => body += chunk)
      res.on('end', () => {
        const valid = body.trim() === 'VALID'
        console.log(`[ITN] Payfast validate response: ${body.trim()} -> ${valid ? 'VALID' : 'INVALID'}`)
        resolve(valid)
      })
    })

    req.on('error', (err) => {
      console.error('[ITN] Payfast server error:', err.message)
      resolve(false)
    })

    req.write(postData)
    req.end()
  })
}

// ─── PocketBase Helpers ────────────────────────────────────
let cachedToken = null
let tokenExpiry = 0

async function getAdminToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken

  const res = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASSWORD }),
  })
  const data = await res.json()
  cachedToken = data.token
  tokenExpiry = Date.now() + 3500000 // refresh every ~58 min
  return cachedToken
}

async function getBooking(bookingId) {
  const token = await getAdminToken()
  const res = await fetch(`${PB_URL}/api/collections/bookings/records/${bookingId}`, {
    headers: { 'Authorization': token },
  })
  if (!res.ok) return null
  return res.json()
}

async function updateBooking(bookingId, status, paymentStatus, pfData) {
  const token = await getAdminToken()

  // Fetch booking details before updating
  let booking
  try {
    const bRes = await fetch(`${PB_URL}/api/collections/bookings/records/${bookingId}`, {
      headers: { 'Authorization': token },
    })
    booking = await bRes.json()
  } catch {}

  await fetch(`${PB_URL}/api/collections/bookings/records/${bookingId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token,
    },
    body: JSON.stringify({
      status,
      payment_status: paymentStatus,
      payment_method: 'payfast',
      payment_id: pfData.pf_payment_id || '',
    }),
  })

  // Send WhatsApp confirmation on payment
  if (paymentStatus === 'paid' && booking?.customer_phone) {
    try {
      await whatsapp.sendPaymentConfirmation({
        reference: booking.reference,
        customer_name: booking.customer_name,
        customer_phone: booking.customer_phone,
        total_amount: booking.total_amount,
        venue_name: 'SmartBookings',
      })
    } catch (e) {
      console.error('[WhatsApp] Payment notification failed:', e.message)
    }
  }
}

async function updateSlot(slotId, status) {
  if (!slotId) return
  const token = await getAdminToken()
  await fetch(`${PB_URL}/api/collections/time_slots/records/${slotId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token,
    },
    body: JSON.stringify({ status }),
  })
}

// Synchronous helpers for settings (cached at startup)
let settingsCache = null

async function loadSettings() {
  const token = await getAdminToken()
  const res = await fetch(`${PB_URL}/api/collections/settings/records?perPage=100`, {
    headers: { 'Authorization': token },
  })
  const data = await res.json()
  settingsCache = {}
  for (const s of data.items) {
    settingsCache[s.key] = s.value
  }
}

function getSettingSync(key) {
  return settingsCache?.[key] || ''
}

function getPassphraseSync() {
  return settingsCache?.payfast_passphrase || ''
}

// ─── Payfast Signature Endpoint ────────────────────────────
// Frontend calls this to get a signed form payload
// Keeps merchant_key and passphrase server-side only
app.post('/api/payfast/sign', (req, res) => {
  try {
    const { merchant_id, return_url, cancel_url, notify_url, name_first, name_last, email_address, m_payment_id, amount, item_name, item_description, custom_str1, custom_str2 } = req.body

    const merchantKey = getSettingSync('payfast_merchant_key')
    if (!merchant_id || !merchantKey) {
      return res.status(400).json({ error: 'Payfast not configured' })
    }

    const params = {
      merchant_id: merchantId,
      merchant_key: merchantKey,
      return_url: return_url || '',
      cancel_url: cancel_url || '',
      notify_url: notify_url || '',
      name_first: name_first || '',
      name_last: name_last || '',
      email_address: email_address || '',
      m_payment_id: m_payment_id || '',
      amount: amount || '',
      item_name: item_name || '',
      item_description: item_description || '',
      custom_str1: custom_str1 || '',
      custom_str2: custom_str2 || '',
    }

    const signature = generateSignature(params)
    res.json({ signature, params })
  } catch (err) {
    console.error('[Sign] Error:', err)
    res.status(500).json({ error: 'Signature generation failed' })
  }
})

// ─── WhatsApp Endpoints ────────────────────────────────────

// Send booking confirmation via WhatsApp
app.post('/api/whatsapp/confirm', async (req, res) => {
  try {
    const result = await whatsapp.sendBookingConfirmation(req.body)
    res.json({ success: true, result })
  } catch (err) {
    console.error('[WhatsApp] Confirm error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Send waiver link via WhatsApp
app.post('/api/whatsapp/waiver', async (req, res) => {
  try {
    const { phone, name, waiverUrl, venueName } = req.body
    const result = await whatsapp.sendWaiverLink(phone, name, waiverUrl, venueName)
    res.json({ success: true, result })
  } catch (err) {
    console.error('[WhatsApp] Waiver error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Send payment confirmation
app.post('/api/whatsapp/payment', async (req, res) => {
  try {
    const result = await whatsapp.sendPaymentConfirmation(req.body)
    res.json({ success: true, result })
  } catch (err) {
    console.error('[WhatsApp] Payment error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Send manual message
app.post('/api/whatsapp/send', async (req, res) => {
  try {
    const { number, text } = req.body
    if (!number || !text) return res.status(400).json({ error: 'number and text required' })
    const result = await whatsapp.sendText(number, text)
    res.json({ success: true, result })
  } catch (err) {
    console.error('[WhatsApp] Send error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Health check
app.get('/api/whatsapp/health', async (req, res) => {
  try {
    const alive = await whatsapp.healthCheck()
    res.json({ alive })
  } catch {
    res.json({ alive: false })
  }
})

// ─── Reset Demo Data ───────────────────────────────────────
// Wipes test data while keeping rooms, staff, and settings
app.post('/api/reset-demo-data', async (req, res) => {
  try {
    const token = await getAdminToken()
    const headers = { 'Authorization': token, 'Content-Type': 'application/json' }

    const COLLECTIONS_TO_WIPE = ['bookings', 'game_hosts', 'waivers', 'gm_blocks', 'time_slots']
    const results = {}

    for (const col of COLLECTIONS_TO_WIPE) {
      // Get all record IDs
      const list = await fetch(`${PB_URL}/api/collections/${col}/records?perPage=10000`, { headers })
      const data = await list.json()
      const ids = (data.items || []).map(r => r.id)

      // Delete each record
      for (const id of ids) {
        await fetch(`${PB_URL}/api/collections/${col}/records/${id}`, { method: 'DELETE', headers })
      }
      results[col] = ids.length
    }

    // Regenerate time slots for the next 60 days
    const roomsList = await fetch(`${PB_URL}/api/collections/rooms/records?filter=(is_active=true)&perPage=100`, { headers })
    const { items: rooms } = await roomsList.json()

    let slotsCreated = 0
    const now = new Date()
    for (let d = 0; d < 60; d++) {
      const date = new Date(now)
      date.setDate(date.getDate() + d)
      const dateStr = date.toISOString().split('T')[0]

      for (const room of rooms) {
        const duration = room.duration_minutes || 60
        const buffer = room.reset_buffer_minutes || 15
        const block = duration + buffer
        let h = 9, m = 30

        while (h * 60 + m + block <= (date.getDay() === 5 || date.getDay() === 6 ? 20 * 60 : 18 * 60 + 30)) {
          const endMin = h * 60 + m + duration
          await fetch(`${PB_URL}/api/collections/time_slots/records`, {
            method: 'POST', headers,
            body: JSON.stringify({
              room: room.id, date: dateStr,
              start_time: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`,
              end_time: `${String(Math.floor(endMin/60)).padStart(2,'0')}:${String(endMin%60).padStart(2,'0')}`,
              status: 'available',
            }),
          })
          slotsCreated++
          const next = h * 60 + m + block
          h = Math.floor(next / 60)
          m = next % 60
        }
      }
    }

    console.log(`[Reset] Wiped: ${JSON.stringify(results)}, regenerated ${slotsCreated} slots`)
    res.json({ success: true, wiped: results, slotsCreated })
  } catch (err) {
    console.error('[Reset] Error:', err)
    res.status(500).json({ error: 'Reset failed' })
  }
})

// ─── Start Server ──────────────────────────────────────────
const PORT = process.env.WEBHOOK_PORT || 3001

loadSettings().then(() => {
  app.listen(PORT, () => {
    console.log(`[ITN] Webhook server running on port ${PORT}`)
    console.log(`[ITN] Payfast ITN endpoint: http://localhost:${PORT}/api/payfast/itn`)
  })
}).catch(err => {
  console.error('[ITN] Failed to load settings:', err)
  app.listen(PORT, () => {
    console.log(`[ITN] Webhook server running (without cached settings) on port ${PORT}`)
  })
})
