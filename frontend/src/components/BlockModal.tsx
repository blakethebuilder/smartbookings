import { useState } from 'react'
import { X, Ban, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import pb, { type Room } from '../lib/pocketbase'
import { useToast } from '../lib/toast'

interface Props {
  rooms: Room[]
  slot: { start: Date; end: Date }
  onClose: () => void
  onComplete: () => void
}

export default function BlockModal({ rooms, slot, onClose, onComplete }: Props) {
  const { toast } = useToast()
  const [selectedRoom, setSelectedRoom] = useState(rooms[0]?.id || '')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!selectedRoom) return
    setSaving(true)

    try {
      await pb.collection('blocks').create({
        room: selectedRoom,
        date: format(slot.start, 'yyyy-MM-dd'),
        start_time: format(slot.start, 'HH:mm'),
        end_time: format(slot.end, 'HH:mm'),
        reason: reason || 'GM Block',
      })

      // Also update any time_slots in this range to 'blocked'
      const slots = await pb.collection('time_slots').getList(1, 100, {
        filter: `room = "${selectedRoom}" && date = "${format(slot.start, 'yyyy-MM-dd')}"`,
      })

      for (const s of slots.items) {
        if (s.start_time >= format(slot.start, 'HH:mm') && s.start_time < format(slot.end, 'HH:mm')) {
          await pb.collection('time_slots').update(s.id, { status: 'blocked' })
        }
      }

      onComplete()
    } catch (e) {
      console.error('Failed to create block:', e)
      toast('Failed to block the time slot. Please try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Ban size={20} className="text-gray-400" />
            Block Time Slot
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-white/5 rounded-lg p-3 text-sm">
            <p className="text-gray-400">
              {format(slot.start, 'EEEE, MMM d')} • {format(slot.start, 'HH:mm')} — {format(slot.end, 'HH:mm')}
            </p>
          </div>

          <div>
            <label className="text-sm text-gray-400 mb-1 block">Room</label>
            <select
              value={selectedRoom}
              onChange={e => setSelectedRoom(e.target.value)}
              className="w-full bg-white/5 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-sb-red"
            >
              {rooms.map(room => (
                <option key={room.id} value={room.id} className="bg-sb-card">
                  {room.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-gray-400 mb-1 block">Reason (optional)</label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Maintenance, Team event, Private function"
              className="w-full bg-white/5 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-sb-red placeholder:text-gray-600"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg bg-white/5 text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-gray-600 text-white font-bold hover:bg-gray-500 transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
            {saving ? 'Blocking...' : 'Block Slot'}
          </button>
        </div>
      </div>
    </div>
  )
}
