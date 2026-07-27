#!/usr/bin/env node

/**
 * PocketBase Seed Script
 * Run after PocketBase starts to create collections + seed data.
 * Usage: node seed.js [pb_url]
 */

const PB_URL = process.env.PB_URL || process.argv[2] || 'http://localhost:8090'
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || 'grandmaster@smartbookings.local'
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || 'gr8@2026!'

let token = null

async function api(method, path, body = null) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
    },
  }
  if (body) opts.body = JSON.stringify(body)

  const res = await fetch(`${PB_URL}${path}`, opts)
  if (!res.ok) {
    const err = await res.text()
    if (err.includes('already exists')) return null // skip duplicates
    throw new Error(`${method} ${path}: ${res.status} - ${err}`)
  }
  return res.json()
}

async function auth() {
  const data = await api('POST', '/api/collections/_superusers/auth-with-password', {
    identity: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  })
  token = data.token
  console.log('✓ Authenticated')
}

async function createSuperuser() {
  // Superuser creation is handled by seed.sh via PocketBase CLI
  // This function just validates auth works
  console.log('  (superuser created via CLI)')
}

async function createCollections() {
  const collections = [
    {
      name: 'clients',
      type: 'base',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'subdomain', type: 'text', required: true, unique: true },
        { name: 'business_type', type: 'select', required: true, values: ['medical', 'salon', 'restaurant', 'custom'] },
        { name: 'resource_label', type: 'text' },
        { name: 'resource_label_plural', type: 'text' },
        { name: 'staff_role_admin', type: 'text' },
        { name: 'staff_role_worker', type: 'text' },
        { name: 'booking_verb', type: 'text' },
        { name: 'pricing_model', type: 'select', values: ['per_person', 'per_slot', 'flat'] },
        { name: 'primary_color', type: 'text' },
        { name: 'logo_url', type: 'text' },
        { name: 'customer_fields', type: 'text' },
        { name: 'duration_unit', type: 'text' },
        { name: 'show_difficulty', type: 'bool' },
        { name: 'show_player_count', type: 'bool' },
        { name: 'is_active', type: 'bool', required: true },
      ],
      listRule: '',
      viewRule: '',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
    },
    {
      name: 'rooms',
      type: 'base',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'slug', type: 'text', required: true, unique: true },
        { name: 'description', type: 'text' },
        { name: 'story', type: 'editor' },
        { name: 'difficulty', type: 'number' },
        { name: 'duration_minutes', type: 'number', required: true },
        { name: 'reset_buffer_minutes', type: 'number', required: true },
        { name: 'min_players', type: 'number', required: true },
        { name: 'max_players', type: 'number', required: true },
        { name: 'price_per_player', type: 'number', required: true },
        { name: 'currency', type: 'text', required: true },
        { name: 'color', type: 'text' },
        { name: 'is_active', type: 'bool', required: true },
        { name: 'sort_order', type: 'number' },
        { name: 'client_id', type: 'relation', collectionId: '__clients__', maxSelect: 1 },
      ],
      listRule: '',
      viewRule: '',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
    },
    {
      name: 'time_slots',
      type: 'base',
      fields: [
        { name: 'room', type: 'relation', required: true, collectionId: '__rooms__', maxSelect: 1, cascadeDelete: true },
        { name: 'date', type: 'date', required: true },
        { name: 'start_time', type: 'text', required: true },
        { name: 'end_time', type: 'text', required: true },
        { name: 'status', type: 'select', required: true, values: ['available', 'reserved', 'full', 'blocked'] },
        { name: 'client_id', type: 'relation', collectionId: '__clients__', maxSelect: 1 },
      ],
      listRule: '',
      viewRule: '',
      createRule: '@request.auth.id != ""',
      updateRule: '',
      deleteRule: '@request.auth.id != ""',
    },
    {
      name: 'bookings',
      type: 'base',
      fields: [
        { name: 'reference', type: 'text', required: true, unique: true },
        { name: 'time_slot', type: 'relation', required: true, collectionId: '__time_slots__', maxSelect: 1, cascadeDelete: true },
        { name: 'room', type: 'relation', required: true, collectionId: '__rooms__', maxSelect: 1 },
        { name: 'customer_name', type: 'text', required: true },
        { name: 'customer_email', type: 'text', required: true },
        { name: 'customer_phone', type: 'text' },
        { name: 'player_count', type: 'number', required: true },
        { name: 'price_per_player', type: 'number', required: true },
        { name: 'total_amount', type: 'number', required: true },
        { name: 'currency', type: 'text', required: true },
        { name: 'status', type: 'select', required: true, values: ['pending', 'confirmed', 'cancelled', 'completed'] },
        { name: 'payment_status', type: 'select', required: true, values: ['unpaid', 'paid', 'refunded', 'failed'] },
        { name: 'payment_method', type: 'text' },
        { name: 'payment_id', type: 'text' },
        { name: 'notes', type: 'text' },
        { name: 'deposit_amount', type: 'number' },
        { name: 'balance_due', type: 'number' },
        { name: 'payment_type', type: 'select', values: ['deposit', 'full'] },
        { name: 'waiver_signed', type: 'bool' },
        { name: 'waiver_url', type: 'text' },
        { name: 'reminder_sent', type: 'bool' },
        { name: 'client_id', type: 'relation', collectionId: '__clients__', maxSelect: 1 },
      ],
      listRule: '@request.auth.id != ""',
      viewRule: '',
      createRule: '',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
    },
    {
      name: 'gm_blocks',
      type: 'base',
      fields: [
        { name: 'room', type: 'relation', required: true, collectionId: '__rooms__', maxSelect: 1, cascadeDelete: true },
        { name: 'date', type: 'date', required: true },
        { name: 'start_time', type: 'text', required: true },
        { name: 'end_time', type: 'text', required: true },
        { name: 'reason', type: 'text' },
      ],
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
    },
    {
      name: 'settings',
      type: 'base',
      fields: [
        { name: 'key', type: 'text', required: true, unique: true },
        { name: 'value', type: 'text' },
        { name: 'description', type: 'text' },
      ],
      listRule: '',
      viewRule: '',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
    },
    {
      name: 'waivers',
      type: 'base',
      fields: [
        { name: 'booking', type: 'relation', required: true, collectionId: '__bookings__', maxSelect: 1, cascadeDelete: true },
        { name: 'player_name', type: 'text', required: true },
        { name: 'player_email', type: 'text', required: true },
        { name: 'player_id_number', type: 'text' },
        { name: 'guardian_name', type: 'text' },
        { name: 'guardian_id_number', type: 'text' },
        { name: 'is_minor', type: 'bool' },
        { name: 'consent_medical', type: 'bool', required: true },
        { name: 'consent_rules', type: 'bool', required: true },
        { name: 'consent_photo', type: 'bool' },
        { name: 'signature_data', type: 'text', required: true },
        { name: 'ip_address', type: 'text' },
        { name: 'signed_at', type: 'date', required: true },
        { name: 'status', type: 'select', required: true, values: ['signed', 'pending', 'expired'] },
      ],
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
    },
    {
      name: 'staff',
      type: 'base',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'email', type: 'text', required: true, unique: true },
        { name: 'phone', type: 'text' },
        { name: 'role', type: 'select', required: true, values: ['grandmaster', 'gamemaster'] },
        { name: 'avatar_color', type: 'text' },
        { name: 'is_active', type: 'bool', required: true },
        { name: 'password', type: 'text' },
        { name: 'client_id', type: 'relation', collectionId: '__clients__', maxSelect: 1 },
        { name: 'is_superadmin', type: 'bool' },
      ],
      listRule: '',
      viewRule: '',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
    },
    {
      name: 'game_hosts',
      type: 'base',
      fields: [
        { name: 'booking', type: 'relation', required: true, collectionId: '__bookings__', maxSelect: 1, cascadeDelete: true },
        { name: 'staff', type: 'relation', required: true, collectionId: '__staff__', maxSelect: 1 },
        { name: 'assigned_at', type: 'date', required: true },
        { name: 'status', type: 'select', required: true, values: ['assigned', 'checked_in', 'in_progress', 'completed'] },
        { name: 'hints_used', type: 'number' },
        { name: 'notes', type: 'text' },
      ],
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
    },
  ]

  const ids = {}

  for (const col of collections) {
    // Replace collection ID references
    const fields = col.fields.map(f => {
      if (f.collectionId && f.collectionId.startsWith('__')) {
        const ref = f.collectionId.replace(/__/g, '')
        return { ...f, collectionId: ids[ref] || '' }
      }
      return f
    })

    try {
      const result = await api('POST', '/api/collections', { ...col, fields })
      if (result) {
        ids[col.name] = result.id
        console.log(`✓ Collection: ${col.name} (${result.id})`)
      } else {
        // Already exists, get its ID and update rules
        const existing = await api('GET', `/api/collections/${col.name}`)
        ids[col.name] = existing.id
        // Update rules if they're null
        if (existing.listRule === null || existing.viewRule === null) {
          await api('PATCH', `/api/collections/${existing.id}`, {
            listRule: col.listRule,
            viewRule: col.viewRule,
            createRule: col.createRule,
            updateRule: col.updateRule,
            deleteRule: col.deleteRule,
          })
          console.log(`  Collection: ${col.name} (rules updated)`)
        } else {
          console.log(`  Collection: ${col.name} (existing ${existing.id})`)
        }
      }
    } catch (e) {
      // Try to get existing
      try {
        const existing = await api('GET', `/api/collections/${col.name}`)
        ids[col.name] = existing.id
        console.log(`  Collection: ${col.name} (existing ${existing.id})`)
      } catch {
        console.error(`✗ Failed: ${col.name}: ${e.message}`)
      }
    }
  }

  return ids
}

async function seedClients() {
  const clients = [
    { name: 'Fourways Medical Centre', subdomain: 'fourwaysmed', business_type: 'medical', resource_label: 'Doctor', resource_label_plural: 'Doctors', staff_role_admin: 'Admin', staff_role_worker: 'Doctor', booking_verb: 'Book Appointment', pricing_model: 'per_slot', primary_color: '#2563EB', logo_url: '', customer_fields: 'name,email,phone,id_number,medical_aid', duration_unit: 'minutes', show_difficulty: false, show_player_count: false, is_active: true },
    { name: 'Demo Business', subdomain: 'demo', business_type: 'custom', resource_label: 'Resource', resource_label_plural: 'Resources', staff_role_admin: 'Admin', staff_role_worker: 'Staff', booking_verb: 'Book Now', pricing_model: 'per_slot', primary_color: '#FF4500', logo_url: '', customer_fields: 'name,email,phone', duration_unit: 'minutes', show_difficulty: false, show_player_count: false, is_active: true },
  ]

  for (const c of clients) {
    try {
      await api('POST', '/api/collections/clients/records', c)
      console.log(`✓ Client: ${c.name} (${c.subdomain})`)
    } catch (e) {
      console.log(`  Client: ${c.name} (exists)`)
    }
  }
}

async function seedRooms() {
  // Rooms are per-client — seeded via the UI by superadmins
  console.log('  (rooms are client-specific — add via dashboard)')
}

async function seedStaff() {
  const staff = [
    { name: 'Daylin', email: 'daylin@smartbookings.local', role: 'grandmaster', avatar_color: '#E53935', is_active: true, password: '2536' },
    { name: 'Thabo', email: 'thabo@smartbookings.local', role: 'gamemaster', avatar_color: '#FFB900', is_active: true, password: '5678' },
    { name: 'Zanele', email: 'zanele@smartbookings.local', role: 'gamemaster', avatar_color: '#4CAF50', is_active: true, password: '9012' },
    { name: 'Ryan', email: 'ryan@smartbookings.local', role: 'gamemaster', avatar_color: '#9C27B0', is_active: true, password: '3456' },
  ]

  for (const s of staff) {
    try {
      await api('POST', '/api/collections/staff/records', s)
      console.log(`✓ Staff: ${s.name} (${s.role})`)
    } catch (e) {
      console.log(`  Staff: ${s.name} (exists)`)
    }
  }
}

async function seedSettings() {
  const settings = [
    { key: 'business_name', value: 'SmartBookings', description: 'Business name' },
    { key: 'business_type', value: 'custom', description: 'medical | salon | restaurant | custom' },
    { key: 'resource_label', value: 'Resource', description: 'Singular: Doctor, Stylist, Table' },
    { key: 'resource_label_plural', value: 'Resources', description: 'Plural label for resources' },
    { key: 'staff_role_admin', value: 'Admin', description: 'Admin role label' },
    { key: 'staff_role_worker', value: 'Staff', description: 'Worker/staff role label' },
    { key: 'booking_verb', value: 'Book Now', description: 'CTA text for booking button' },
    { key: 'pricing_model', value: 'per_slot', description: 'per_person | per_slot | flat' },
    { key: 'primary_color', value: '#FF4500', description: 'Primary brand color (hex)' },
    { key: 'logo_url', value: '', description: 'URL to logo image' },
    { key: 'customer_fields', value: 'name,email,phone', description: 'Comma-separated customer form fields' },
    { key: 'duration_unit', value: 'minutes', description: 'minutes | slots' },
    { key: 'show_difficulty', value: 'true', description: 'Show difficulty rating on resources' },
    { key: 'show_player_count', value: 'true', description: 'Show player/party count selector' },
    { key: 'business_hours', value: 'Mon-Thu 09:30-18:30, Fri-Sat 09:30-20:00, Sun 09:30-18:30', description: 'Operating hours' },
    { key: 'default_currency', value: 'ZAR', description: 'Default currency' },
    { key: 'default_reset_buffer', value: '15', description: 'Reset buffer minutes' },
    { key: 'game_duration', value: '60', description: 'Default game duration' },
    { key: 'payfast_merchant_id', value: '10000100', description: 'Payfast merchant ID' },
    { key: 'payfast_merchant_key', value: '46f0cd694581a', description: 'Payfast merchant key' },
    { key: 'payfast_passphrase', value: 'sandbox_passphrase', description: 'Payfast passphrase' },
    { key: 'payfast_mode', value: 'sandbox', description: 'sandbox or live' },
    { key: 'evolution_api_url', value: '', description: 'Evolution API URL' },
    { key: 'evolution_api_key', value: '', description: 'Evolution API key' },
    { key: 'evolution_instance', value: '', description: 'Evolution instance' },
    { key: 'whatsapp_enabled', value: 'false', description: 'Enable WhatsApp' },
    { key: 'reminder_hours_before', value: '3', description: 'Hours before game for reminder' },
    { key: 'waiver_enabled', value: 'true', description: 'Enable waivers' },
    { key: 'waiver_hours_before', value: '24', description: 'Hours before game for waiver' },
    { key: 'cancellation_hours_before', value: '24', description: 'Hours before game when cancellation is allowed' },
    { key: 'cancellation_admin_fee', value: '50', description: 'Admin fee retained on deposit cancellation' },
  ]

  for (const s of settings) {
    try {
      await api('POST', '/api/collections/settings/records', s)
      console.log(`✓ Setting: ${s.key}`)
    } catch (e) {
      console.log(`  Setting: ${s.key} (exists)`)
    }
  }
}

async function generateTimeSlots() {
  const roomsRes = await api('GET', '/api/collections/rooms/records?filter=(is_active=true)&sort=sort_order&perPage=100')
  const rooms = roomsRes.items

  const now = new Date()
  const slotsCreated = { total: 0 }

  for (let dayOffset = 1; dayOffset <= 30; dayOffset++) {
    const date = new Date(now)
    date.setDate(date.getDate() + dayOffset)
    const dow = date.getDay()

    const dateStr = date.toISOString().split('T')[0] // YYYY-MM-DD

    for (const room of rooms) {
      const duration = room.duration_minutes
      const buffer = room.reset_buffer_minutes
      const totalBlock = duration + buffer

      let hour = 9, minute = 30

      while (true) {
        const endMin = hour * 60 + minute + duration
        const blockMin = hour * 60 + minute + totalBlock
        if (endMin > 18 * 60 || blockMin > 18 * 60) break

        const endH = Math.floor(endMin / 60)
        const endM = endMin % 60

        try {
          await api('POST', '/api/collections/time_slots/records', {
            room: room.id,
            date: dateStr,
            start_time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
            end_time: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`,
            status: 'available',
          })
          slotsCreated.total++
        } catch (e) {
          // skip duplicates
        }

        const next = blockMin
        hour = Math.floor(next / 60)
        minute = next % 60
      }
    }
  }

  console.log(`✓ Generated ${slotsCreated.total} time slots (14 days)`)
}

// ─── Main ──────────────────────────────────────────────────
async function main() {
  console.log(`\n🌱 Seeding PocketBase at ${PB_URL}\n`)

  try {
    await createSuperuser()
    await auth()
    await createCollections()
    await seedClients()
    await seedRooms()
    await seedStaff()
    await seedSettings()
    await generateTimeSlots()
    console.log('\n✅ Seed complete!\n')
  } catch (e) {
    console.error('\n❌ Seed failed:', e.message)
    process.exit(1)
  }
}

main()
