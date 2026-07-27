import { useEffect, useState } from 'react'
import { Calendar, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { format, addDays, isSameDay } from 'date-fns'
import pb, { type Room, type TimeSlot } from '../lib/pocketbase'
import { useBranding } from '../lib/branding'

export default function PublicAvailability() {
  const { branding } = useBranding()
  const [rooms, setRooms] = useState<Room[]>([])
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [weekOffset, setWeekOffset] = useState(0)

  useEffect(() => {
    async function load() {
      try {
        const roomsData = await pb.collection('rooms').getFullList<Room>({
          sort: 'sort_order',
          filter: 'is_active = true',
        })
        setRooms(roomsData)

        // Load slots for the next 4 weeks
        const startDate = addDays(new Date(), weekOffset * 7)
        const endDate = addDays(startDate, 28)

        const slotsData = await pb.collection('time_slots').getFullList<TimeSlot>({
          filter: `status = "available" && date >= "${format(startDate, 'yyyy-MM-dd')}" && date <= "${format(endDate, 'yyyy-MM-dd')}"`,
          sort: 'date,start_time',
        })
        setSlots(slotsData)
      } catch (e) {
        console.error('Failed to load availability:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [weekOffset])

  // Generate week days
  const weekStart = addDays(new Date(), weekOffset * 7)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  // Filter slots for selected date
  const slotsForDate = slots.filter(s => {
    const slotDate = new Date(s.date.split(' ')[0])
    return isSameDay(slotDate, selectedDate)
  })

  // Group slots by room
  const slotsByRoom = rooms.map(room => ({
    room,
    slots: slotsForDate.filter(s => s.room === room.id),
  }))

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-gr8-orange" size={32} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm py-4 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <a href="https://gr8.smartintegrate.co.za" className="text-xl font-black text-gray-900 tracking-tight">
            {branding.business_name}
          </a>
          <a href="/book" className="btn-gr8 text-sm px-5 py-2">{branding.booking_verb}</a>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-4xl font-black text-gray-900 mb-2">
            Check <span className="text-gr8-orange">Availability</span>
          </h1>
          <p className="text-gray-600">See what's free before you book. Open 7 days — Mon–Thu 9:30–18:30, Fri–Sat 9:30–20:00, Sun 9:30–18:30.</p>
        </div>

        {/* Week navigation */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <button
            onClick={() => setWeekOffset(prev => Math.max(0, prev - 1))}
            disabled={weekOffset === 0}
            className="p-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-gr8-orange hover:border-gr8-orange disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-gray-900 font-bold">
            {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d, yyyy')}
          </span>
          <button
            onClick={() => setWeekOffset(prev => prev + 1)}
            className="p-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-gr8-orange hover:border-gr8-orange transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Day selector */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2 justify-center">
          {weekDays.map(day => {
            const isBusinessDay = true // Open 7 days
            const isSelected = isSameDay(day, selectedDate)
            const slotsForDay = slots.filter(s => isSameDay(new Date(s.date.split(' ')[0]), day))

            return (
              <button
                key={day.toISOString()}
                onClick={() => isBusinessDay && setSelectedDate(day)}
                disabled={!isBusinessDay}
                className={`flex flex-col items-center min-w-[80px] p-3 rounded-xl transition-all ${
                  isSelected
                    ? 'bg-gr8-orange text-white'
                    : isBusinessDay
                      ? 'bg-white border border-gray-200 text-gray-700 hover:border-gr8-orange'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                <span className="text-xs uppercase">{format(day, 'EEE')}</span>
                <span className="text-xl font-bold">{format(day, 'd')}</span>
                <span className="text-xs">{format(day, 'MMM')}</span>
                {isBusinessDay && (
                  <span className={`text-[10px] mt-1 ${slotsForDay.length > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                    {slotsForDay.length} slots
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Slots by room */}
        <div className="space-y-6">
          {slotsByRoom.map(({ room, slots: roomSlots }) => (
            <div key={room.id} className="card-dark">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: room.color }} />
                <h3 className="text-lg font-bold text-gray-900">{room.name}</h3>
                <span className="text-xs text-gray-600">R{room.price_per_player}{branding.pricing_model === 'per_person' ? '/pp' : ''} • {room.duration_minutes}min</span>
              </div>

              {roomSlots.length === 0 ? (
                <p className="text-gray-600 text-sm py-4 text-center">No available slots for this date.</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {roomSlots.map(slot => (
                    <a
                      key={slot.id}
                      href={`/book?room=${room.slug}&date=${slot.date.split(' ')[0]}&time=${slot.start_time}`}
                      className="bg-white border border-gray-200 rounded-lg p-3 text-center hover:border-gr8-orange transition-all group"
                    >
                      <p className="text-gray-900 font-bold group-hover:text-gr8-orange transition-colors">{slot.start_time}</p>
                      <p className="text-[10px] text-gray-600">{slot.end_time}</p>
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center mt-10">
          <a href="/book" className="btn-gr8 text-base sm:text-lg px-6 sm:px-10 py-3 sm:py-4 inline-flex items-center gap-2">
            <Calendar size={20} /> Book Your Escape
          </a>
        </div>
      </div>
    </div>
  )
}
