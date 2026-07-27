#!/usr/bin/env node
/**
 * Server-side Payfast signature generation.
 * Called by the frontend to get a signed form payload.
 * Keeps merchant_key and passphrase on the server only.
 */

const crypto = require('crypto')
const http = require('http')

const PB_URL = process.env.PB_URL || 'http://localhost:8090'

let settingsCache = null

async function loadSettings() {
  const authReq = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identity: process.env.PB_ADMIN_EMAIL || 'admin@smartbookings.local',
      password: process.env.PB_ADMIN_PASSWORD || 'admin123456',
    }),
  })
  const { token } = await authReq.json()

  const res = await fetch(`${PB_URL}/api/collections/settings/records?perPage=100`, {
    headers: { Authorization: token },
  })
  const data = await res.json()
  settingsCache = {}
  for (const s of data.items) settingsCache[s.key] = s.value
}

function getSetting(key) {
  return settingsCache?.[key] || ''
}

function generateSignature(params) {
  const passphrase = getSetting('payfast_passphrase')

  // Sort params alphabetically, filter empty
  const sorted = Object.keys(params)
    .filter(k => params[k] !== '' && params[k] !== undefined && k !== 'signature')
    .sort()
    .map(k => `${k}=${encodeURIComponent(params[k]).replace(/%20/g, '+')}`)
    .join('&')

  // Always append passphrase (even if empty)
  const sigString = `${sorted}&passphrase=${encodeURIComponent(passphrase || '').replace(/%20/g, '+')}`

  return crypto.createHash('md5').update(sigString).digest('hex')
}

module.exports = { loadSettings, generateSignature, getSetting }
