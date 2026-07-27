#!/usr/bin/env node

/**
 * Auto-generate time slots if fewer than 14 days of availability exist.
 * Runs on startup and every 24 hours via cron in seed.sh.
 */

const PB_URL = process.argv[2] || 'http://localhost:8090'
const DAYS_AHEAD = 30
const MIN_DAYS_BUFFER = 14

let token = null

async function api(method, path, data = null) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
    },
  }
  if (data) opts.body = JSON.stringify(data)
  const res = await fetch(`${PB_URL}${path}`, opts)
  return res.json()
}

async function auth() {
  const email = process.env.PB_ADMIN_EMAIL || 'admin@smartbookings.local'
  const password = process.env.PB_ADMIN_PASSWORD || 'admin123456'
  const data = await api('POST', '/api/collections/_superusers/auth-with-password', {
    identity: email,
    password,
  })
  token = data.token
}

function getBusinessHours(date) {
  const day = date.getDay()
  if (day === 5 || day === 6) return { open: '09:30', close: '20:00' }
  return { open: '09:30', close: '18:30' }
}

function generateSlots(date, durationMinutes, resetBufferMinutes) {
  const { open, close } = getBusinessHours(date)
  const [openH, openM] = open.split(':').map(Number)
  const [closeH, closeM] = close.split(':').map(Number)

  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const slotStart = new Date(dayStart)
  slotStart.setHours(openH, openM, 0, 0)
  const dayEnd = new Date(dayStart)
  dayEnd.setHours(closeH, closeM, 0, 0)

  const totalBlock = durationMinutes + resetBufferMinutes
  const slots = []
  let cursor = new Date(slotStart)

  while (true) {
    const slotEnd = new Date(cursor.getTime() + durationMinutes * 60000)
    const blockEnd = new Date(cursor.getTime() + totalBlock * 60000)

    if (dayEnd <= slotEnd || dayEnd <= blockEnd) break

    slots.push({
      start: cursor.toTimeString().slice(0, 5),
      end: slotEnd.toTimeString().slice(0, 5),
    })

    cursor = blockEnd
  }

  return slots
}

function formatDate(date) {
  return date.toISOString().split('T')[0]
}

async function main() {
  try {
    await auth()

    // Get rooms
    const roomsData = await api('GET', '/api/collections/rooms/records?filter=(is_active=true)&sort=sort_order')
    const rooms = roomsData.items || []
    if (rooms.length === 0) {
      console.log('  No rooms found, skipping')
      return
    }

    // Check how many days of slots exist
    const today = new Date()
    const checkDate = new Date(today)
    checkDate.setDate(checkDate.getDate() + MIN_DAYS_BUFFER)

    const existingSlots = await api('GET', `/api/collections/time_slots/records?filter=(date>="${formatDate(checkDate)}")&perPage=1`)
    const daysAhead = existingSlots.totalItems > 0 ? DAYS_AHEAD : DAYS_AHEAD * 2 // Generate more if behind

    if (existingSlots.totalItems > 0) {
      console.log(`  Slots exist beyond ${MIN_DAYS_BUFFER} days — OK`)
      return
    }

    console.log(`  Generating ${daysAhead} days of slots...`)

    const startDate = new Date(today)
    let slotsCreated = 0

    for (let dayOffset = 1; dayOffset <= daysAhead; dayOffset++) {
      const date = new Date(startDate)
      date.setDate(date.getDate() + dayOffset)

      for (const room of rooms) {
        const slots = generateSlots(date, room.duration_minutes, room.reset_buffer_minutes)

        for (const slot of slots) {
          const dateStr = formatDate(date)

          // Check if slot already exists
          const existing = await api('GET', `/api/collections/time_slots/records?filter=(room="${room.id}")&&(date~"${dateStr}")&&(start_time="${slot.start}")&perPage=1`)
          if (existing.totalItems > 0) continue

          await api('POST', '/api/collections/time_slots/records', {
            room: room.id,
            date: dateStr,
            start_time: slot.start,
            end_time: slot.end,
            status: 'available',
          })
          slotsCreated++
        }
      }
    }

    console.log(`  ✓ Created ${slotsCreated} slots`)
  } catch (e) {
    console.error('  Auto-slots error:', e.message)
  }
}

main()
