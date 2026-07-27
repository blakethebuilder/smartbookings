import { useState } from 'react'
import { Ban, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import pb, { type Room } from '../lib/pocketbase'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from "@/components/ui/input"

interface Props {
  rooms: Room[]
  slot: { start: Date; end: Date }
  onClose: () => void
  onComplete: () => void
}

export default function BlockModal({ rooms, slot, onClose, onComplete }: Props) {
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
      toast.error('Failed to block the time slot. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban size={20} className="text-gray-500" />
            Block Time Slot
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <p className="text-gray-500">
              {format(slot.start, 'EEEE, MMM d')} • {format(slot.start, 'HH:mm')} — {format(slot.end, 'HH:mm')}
            </p>
          </div>

          <div>
            <label className="text-sm text-gray-500 mb-1 block">Room</label>
            <select
              value={selectedRoom}
              onChange={e => setSelectedRoom(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 text-sm focus:outline-none focus:border-sb-red"
            >
              {rooms.map(room => (
                <option key={room.id} value={room.id} className="bg-white">
                  {room.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-gray-500 mb-1 block">Reason (optional)</label>
            <Input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Maintenance, Team event, Private function"
              className="bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-600"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 size={16} className="animate-spin" /> Blocking...</> : <><Ban size={16} /> Block Slot</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
