import { useState } from 'react'
import { X, Calendar, Loader2 } from 'lucide-react'
import { format, addDays, isSameDay, eachDayOfInterval, nextDay, isBefore } from 'date-fns'
import pb, { type Room } from '../lib/pocketbase'
import { generateSlots, isBusinessDay } from '../lib/slots'

interface Props {
  rooms: Room[]
  onClose: () => void
  onComplete: () => void
}

export default function SlotGenerator({ rooms, onClose, onComplete }: Props) {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [daysAhead, setDaysAhead] = useState(14)
  const [selectedRooms, setSelectedRooms] = useState<string[]>(rooms.map(r => r.id))
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState('')

  const toggleRoom = (id: string) => {
    setSelectedRooms(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    )
  }

  const handleGenerate = async () => {
    setGenerating(true)
    const start = new Date(startDate)
    const end = addDays(start, daysAhead)
    const days = eachDayOfInterval({ start, end }).filter(isBusinessDay)

    let slotsCreated = 0
    let slotsSkipped = 0

    for (const room of rooms.filter(r => selectedRooms.includes(r.id))) {
      for (const day of days) {
        const slots = generateSlots(
          day,
          room.duration_minutes,
          room.reset_buffer_minutes,
        )

        for (const slot of slots) {
          // Check if slot already exists
          const existing = await pb.collection('time_slots').getList(1, 1, {
            filter: `room = "${room.id}" && date = "${format(day, 'yyyy-MM-dd')}" && start_time = "${slot.start}"`,
          })

          if (existing.items.length > 0) {
            slotsSkipped++
            continue
          }

          await pb.collection('time_slots').create({
            room: room.id,
            date: format(day, 'yyyy-MM-dd'),
            start_time: slot.start,
            end_time: slot.end,
            status: 'available',
          })
          slotsCreated++
        }

        setProgress(`${room.name} — ${format(day, 'EEE MMM d')}`)
      }
    }

    setProgress(`Done! ${slotsCreated} slots created, ${slotsSkipped} skipped.`)
    setTimeout(onComplete, 1500)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-lg">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Generate Time Slots</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full bg-white/5 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-sb-red"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">Days Ahead</label>
              <input
                type="number"
                value={daysAhead}
                onChange={e => setDaysAhead(parseInt(e.target.value) || 14)}
                min={1}
                max={90}
                className="w-full bg-white/5 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-sb-red"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-400 mb-2 block">Rooms</label>
            <div className="flex flex-wrap gap-2">
              {rooms.map(room => (
                <button
                  key={room.id}
                  onClick={() => toggleRoom(room.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    selectedRooms.includes(room.id)
                      ? 'text-white'
                      : 'bg-white/5 text-gray-500 hover:text-white'
                  }`}
                  style={selectedRooms.includes(room.id) ? { backgroundColor: room.color } : {}}
                >
                  {room.name}
                </button>
              ))}
            </div>
          </div>

          {progress && (
            <div className="bg-white/5 rounded-lg p-3 text-sm text-gray-300">
              {generating && <Loader2 size={14} className="inline animate-spin mr-2" />}
              {progress}
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg bg-white/5 text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating || selectedRooms.length === 0}
            className="flex-1 btn-sb flex items-center justify-center gap-2"
          >
            {generating ? (
              <><Loader2 size={16} className="animate-spin" /> Generating...</>
            ) : (
              <><Calendar size={16} /> Generate Slots</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
