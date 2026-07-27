import { useState } from 'react'
import { X, Loader2, UserPlus } from 'lucide-react'
import { format } from 'date-fns'
import pb, { type Room, type TimeSlot } from '../lib/pocketbase'

interface Props {
  rooms: Room[]
  slot: { start: Date; end: Date }
  onClose: () => void
  onComplete: () => void
}

export default function QuickBook({ rooms, slot, onClose, onComplete }: Props) {
  const [selectedRoom, setSelectedRoom] = useState(rooms[0]?.id || '')
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [playerCount, setPlayerCount] = useState(2)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const room = rooms.find(r => r.id === selectedRoom)
  const totalAmount = (room?.unit_price || 0) * playerCount

  const handleSave = async () => {
    if (!selectedRoom || !customerName || !customerEmail) {
      setError('Name and email are required')
      return
    }
    setSaving(true)
    setError('')

    try {
      // Find or create the time slot
      const dateStr = format(slot.start, 'yyyy-MM-dd')
      const startTime = format(slot.start, 'HH:mm')
      const endTime = format(slot.end, 'HH:mm')

      let timeSlot: TimeSlot | null = null

      // Try to find existing slot
      try {
        const existing = await pb.collection('time_slots').getFirstListItem<TimeSlot>(
          `room = "${selectedRoom}" && date~"${dateStr}" && start_time = "${startTime}"`
        )
        timeSlot = existing
      } catch {
        // No slot found — create one
        timeSlot = await pb.collection('time_slots').create<TimeSlot>({
          room: selectedRoom,
          date: dateStr,
          start_time: startTime,
          end_time: endTime,
          status: 'available',
        })
      }

      // Create booking
      const reference = `QB-${Date.now().toString(36).toUpperCase()}`
      const booking = await pb.collection('bookings').create({
        reference,
        time_slot: timeSlot.id,
        room: selectedRoom,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        party_size: playerCount,
        unit_price: room?.unit_price || 0,
        total_amount: totalAmount,
        currency: room?.currency || 'ZAR',
        status: 'confirmed',
        payment_status: 'paid',
        payment_method: 'walk_in',
        notes: notes || 'Walk-in booking',
      })

      // Mark slot as full
      await pb.collection('time_slots').update(timeSlot.id, { status: 'full' })

      onComplete()
    } catch (e: any) {
      console.error('Quick book failed:', e)
      setError(e?.message || 'Failed to create booking')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <UserPlus size={18} className="text-sb-red" />
            Quick Book
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        <div className="bg-white/5 rounded-lg p-3 mb-4 text-sm">
          <p className="text-gray-400">
            {format(slot.start, 'EEEE, MMM d')} • {format(slot.start, 'HH:mm')} — {format(slot.end, 'HH:mm')}
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-400 mb-1 block">Room</label>
            <select
              value={selectedRoom}
              onChange={e => setSelectedRoom(e.target.value)}
              className="w-full bg-white/5 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-sb-red"
            >
              {rooms.map(r => (
                <option key={r.id} value={r.id} className="bg-sb-card">{r.name} — R{r.unit_price}/pp</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Name *</label>
              <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)}
                className="w-full bg-white/5 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sb-red" />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Email *</label>
              <input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)}
                className="w-full bg-white/5 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sb-red" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Phone</label>
              <input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
                className="w-full bg-white/5 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sb-red" />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Players</label>
              <div className="flex items-center gap-2">
                <button onClick={() => setPlayerCount(Math.max(1, playerCount - 1))}
                  className="w-10 h-10 rounded bg-white/5 border border-gray-700 text-white font-bold text-sm">−</button>
                <span className="text-white font-bold w-6 text-center">{playerCount}</span>
                <button onClick={() => setPlayerCount(Math.min(room?.max_capacity || 8, playerCount + 1))}
                  className="w-10 h-10 rounded bg-white/5 border border-gray-700 text-white font-bold text-sm">+</button>
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-400 mb-1 block">Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Birthday party, walk-in"
              className="w-full bg-white/5 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sb-red placeholder:text-gray-600" />
          </div>

          {/* Price summary */}
          <div className="bg-white/5 rounded-lg p-3 flex justify-between items-center">
            <span className="text-gray-400 text-sm">{playerCount} × R{room?.unit_price || 0}</span>
            <span className="text-sb-gold font-bold">R{totalAmount}</span>
          </div>
        </div>

        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}

        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg bg-white/5 text-gray-400 hover:text-white text-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving || !customerName || !customerEmail}
            className="flex-1 btn-sb py-2 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            {saving ? 'Booking...' : 'Book Now'}
          </button>
        </div>
      </div>
    </div>
  )
}
