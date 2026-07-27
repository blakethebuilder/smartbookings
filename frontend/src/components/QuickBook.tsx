import { useState } from 'react'
import { Loader2, UserPlus } from 'lucide-react'
import { format } from 'date-fns'
import pb, { type Room, type TimeSlot } from '../lib/pocketbase'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from "@/components/ui/input"

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
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus size={18} className="text-sb-red" />
            Quick Book
          </DialogTitle>
        </DialogHeader>

        <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
          <p className="text-gray-500">
            {format(slot.start, 'EEEE, MMM d')} • {format(slot.start, 'HH:mm')} — {format(slot.end, 'HH:mm')}
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-500 mb-1 block">Room</label>
            <select
              value={selectedRoom}
              onChange={e => setSelectedRoom(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 text-sm focus:outline-none focus:border-sb-red"
            >
              {rooms.map(r => (
                <option key={r.id} value={r.id} className="bg-white">{r.name} — R{r.unit_price}/pp</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Name *</label>
              <Input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)}
                className="bg-gray-50 border-gray-200 text-gray-900" />
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Email *</label>
              <Input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)}
                className="bg-gray-50 border-gray-200 text-gray-900" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Phone</label>
              <Input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
                className="bg-gray-50 border-gray-200 text-gray-900" />
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Players</label>
              <div className="flex items-center gap-2">
                <button onClick={() => setPlayerCount(Math.max(1, playerCount - 1))}
                  className="w-10 h-10 rounded bg-gray-50 border border-gray-200 text-gray-900 font-bold text-sm">−</button>
                <span className="text-gray-900 font-bold w-6 text-center">{playerCount}</span>
                <button onClick={() => setPlayerCount(Math.min(room?.max_capacity || 8, playerCount + 1))}
                  className="w-10 h-10 rounded bg-gray-50 border border-gray-200 text-gray-900 font-bold text-sm">+</button>
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-500 mb-1 block">Notes</label>
            <Input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Birthday party, walk-in"
              className="bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-600" />
          </div>

          {/* Price summary */}
          <div className="bg-gray-50 rounded-lg p-3 flex justify-between items-center">
            <span className="text-gray-500 text-sm">{playerCount} × R{room?.unit_price || 0}</span>
            <span className="text-sb-orange font-bold">R{totalAmount}</span>
          </div>
        </div>

        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !customerName || !customerEmail}>
            {saving ? <><Loader2 size={14} className="animate-spin" /> Booking...</> : <><UserPlus size={14} /> Book Now</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
