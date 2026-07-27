import { useState, useEffect } from 'react'
import { X, UserPlus, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import pb, { type Booking, type Room, type TimeSlot } from '../lib/pocketbase'

interface StaffMember {
  id: string
  name: string
  role: string
  avatar_color: string
}

interface Props {
  booking: Booking
  room: Room
  timeSlot: TimeSlot
  onClose: () => void
  onComplete: () => void
}

export default function AssignStaff({ booking, room, timeSlot, onClose, onComplete }: Props) {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [selectedStaff, setSelectedStaff] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    pb.collection('staff').getFullList<StaffMember>({
      filter: 'is_active = true && role = "staff"',
      sort: 'name',
    }).then(s => {
      setStaff(s)
      setLoading(false)
    })
  }, [])

  const handleAssign = async () => {
    if (!selectedStaff) return
    setSaving(true)

    try {
      await pb.collection('booking_staff').create({
        booking: booking.id,
        staff: selectedStaff,
        assigned_at: new Date().toISOString(),
        status: 'assigned',
        hints_used: 0,
      })
      onComplete()
    } catch (e) {
      console.error('Failed to assign staff:', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <UserPlus size={18} className="text-sb-red" />
            <h2 className="text-lg font-bold text-white">Assign Staff</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        <div className="bg-white/5 rounded-lg p-3 mb-4 text-sm">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: room.color }} />
            <span className="font-bold text-white">{room.name}</span>
          </div>
          <p className="text-gray-400">
            {booking.customer_name} • {booking.party_size} players<br />
            {format(new Date(timeSlot.date), 'EEE, MMM d')} • {timeSlot.start_time} — {timeSlot.end_time}
          </p>
        </div>

        {loading ? (
          <div className="py-8 text-center"><Loader2 className="animate-spin text-gray-500 mx-auto" size={24} /></div>
        ) : (
          <div className="space-y-2 mb-4">
            {staff.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedStaff(s.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                  selectedStaff === s.id
                    ? 'border-sb-red bg-sb-red/10'
                    : 'border-gray-700/50 hover:border-gray-600'
                }`}
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: s.avatar_color }}>
                  {s.name[0]}
                </div>
                <span className="text-white font-medium">{s.name}</span>
              </button>
            ))}
            {staff.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-4">No active staff found.</p>
            )}
          </div>
        )}

        <button
          onClick={handleAssign}
          disabled={!selectedStaff || saving}
          className="w-full btn-sb py-3 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
          {saving ? 'Assigning...' : 'Assign Staff'}
        </button>
      </div>
    </div>
  )
}
