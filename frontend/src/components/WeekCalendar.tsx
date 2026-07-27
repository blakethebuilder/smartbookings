import { useEffect, useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Clock, MapPin, User, Loader2 } from 'lucide-react'
import {
  startOfWeek, endOfWeek, addWeeks, subWeeks,
  eachDayOfInterval, format, isToday
} from 'date-fns'
import pb, { type Room, type Booking, type TimeSlot, type Block } from '../lib/pocketbase'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface SlotEvent {
  time: string
  endTime: string
  room: Room
  booking?: Booking
  block?: Block
  type: 'booking' | 'block' | 'available'
}

export default function WeekCalendar() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [blocks, setBlocks] = useState<Block[]>([])
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [selectedEvent, setSelectedEvent] = useState<SlotEvent | null>(null)

  const loadData = async () => {
    try {
      const [r, b, bl, ts] = await Promise.all([
        pb.collection('rooms').getFullList<Room>({ sort: 'sort_order', filter: 'is_active = true' }),
        pb.collection('bookings').getFullList<Booking>({ filter: 'status != "cancelled"', expand: 'time_slot' }),
        pb.collection('blocks').getFullList<Block>(),
        pb.collection('time_slots').getFullList<TimeSlot>({ sort: 'date,start_time' }),
      ])
      setRooms(r)
      setBookings(b)
      setBlocks(bl)
      setTimeSlots(ts)
    } catch (e) {
      console.error('WeekCalendar load failed:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const days = useMemo(() => eachDayOfInterval({ start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 1 }) }), [weekStart])

  const prevWeek = () => setWeekStart(w => subWeeks(w, 1))
  const nextWeek = () => setWeekStart(w => addWeeks(w, 1))
  const goToday = () => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))

  // Build slot grid: time → day → events
  const timeSlots_0830_1830 = Array.from({ length: 21 }, (_, i) => {
    const h = Math.floor(i / 2) + 8
    const m = i % 2 === 0 ? '00' : '30'
    return `${String(h).padStart(2, '0')}:${m}`
  })

  const getEventsForSlot = (day: Date, time: string): SlotEvent[] => {
    const dayStr = format(day, 'yyyy-MM-dd')

    return rooms.map(room => {
      const booking = bookings.find(b => {
        const ts = timeSlots.find(s => s.id === b.time_slot)
        return ts && ts.date?.startsWith(dayStr) && ts.start_time === time && b.room === room.id
      })
      const block = blocks.find(b =>
        b.date === dayStr && b.start_time === time && b.room === room.id
      )

      if (booking) return { time, endTime: timeSlots.find(s => s.id === booking.time_slot)?.end_time || '', room, booking, type: 'booking' as const }
      if (block) return { time, endTime: block.end_time, room, block, type: 'block' as const }
      return { time, endTime: '', room, type: 'available' as const }
    })
  }

  const statusVariant = (status: string) => {
    switch (status) {
      case 'confirmed': case 'paid': case 'completed': return 'success'
      case 'pending': case 'assigned': return 'warning'
      case 'cancelled': case 'failed': return 'destructive'
      default: return 'secondary'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-sb-red" size={32} />
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prevWeek}><ChevronLeft size={16} /></Button>
          <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
          <Button variant="outline" size="sm" onClick={nextWeek}><ChevronRight size={16} /></Button>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">
          {format(weekStart, 'MMM d')} – {format(endOfWeek(weekStart, { weekStartsOn: 1 }), 'MMM d, yyyy')}
        </h2>
        <Button variant="ghost" size="sm" onClick={loadData}>Refresh</Button>
      </div>

      {/* Room legend */}
      <div className="flex flex-wrap gap-3 mb-4">
        {rooms.map(room => (
          <div key={room.id} className="flex items-center gap-1.5 text-xs text-gray-600">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: room.color }} />
            {room.name}
          </div>
        ))}
      </div>

      {/* Grid */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <div className="min-w-[600px]">
            {/* Day headers */}
            <div className="grid border-b" style={{ gridTemplateColumns: `60px repeat(${days.length}, 1fr)` }}>
              <div className="p-2 text-xs text-gray-400 font-medium border-r" />
              {days.map(day => (
                <div key={day.toISOString()} className={`p-2 text-center border-r last:border-r-0 ${isToday(day) ? 'bg-sb-orange/5' : ''}`}>
                  <p className="text-xs text-gray-500 font-medium">{format(day, 'EEE')}</p>
                  <p className={`text-sm font-bold ${isToday(day) ? 'text-sb-orange' : 'text-gray-900'}`}>{format(day, 'd')}</p>
                </div>
              ))}
            </div>

            {/* Time rows */}
            <div className="max-h-[600px] overflow-y-auto">
              {timeSlots_0830_1830.map(time => (
                <div key={time} className="grid border-b last:border-b-0 hover:bg-gray-50/50 transition-colors" style={{ gridTemplateColumns: `60px repeat(${days.length}, 1fr)` }}>
                  <div className="p-1.5 text-[10px] text-gray-400 font-medium border-r flex items-start justify-end pr-2">
                    {time}
                  </div>
                  {days.map(day => {
                    const events = getEventsForSlot(day, time)
                    return (
                      <div key={day.toISOString()} className="p-0.5 border-r last:border-r-0 min-h-[28px] flex gap-0.5">
                        {events.filter(e => e.type !== 'available').map((event, i) => (
                          <button
                            key={`${event.type}-${i}`}
                            onClick={() => setSelectedEvent(event)}
                            className={`flex-1 rounded px-1 py-0.5 text-[9px] font-medium text-left truncate cursor-pointer transition-colors ${
                              event.type === 'booking'
                                ? 'text-white hover:opacity-80'
                                : 'bg-red-100 text-red-700 hover:bg-red-200'
                            }`}
                            style={event.type === 'booking' ? { backgroundColor: event.room.color } : undefined}
                            title={`${event.room.name}: ${event.type === 'booking' ? event.booking?.customer_name : event.block?.reason}`}
                          >
                            {event.type === 'booking' ? event.booking?.customer_name?.charAt(0) : '✕'}
                          </button>
                        ))}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Event Detail Dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedEvent?.room.color }} />
              {selectedEvent?.room.name}
            </DialogTitle>
          </DialogHeader>
          {selectedEvent?.booking && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <User size={14} className="text-gray-400" />
                <span className="font-medium">{selectedEvent.booking.customer_name}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock size={14} className="text-gray-400" />
                <span>{selectedEvent.time} – {selectedEvent.endTime}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MapPin size={14} className="text-gray-400" />
                <span>{selectedEvent.room.name}</span>
              </div>
              <div className="flex gap-2">
                <Badge variant={statusVariant(selectedEvent.booking.status)}>{selectedEvent.booking.status}</Badge>
                <Badge variant={statusVariant(selectedEvent.booking.payment_status)}>{selectedEvent.booking.payment_status}</Badge>
              </div>
              {selectedEvent.booking.customer_email && (
                <p className="text-xs text-gray-500">{selectedEvent.booking.customer_email}</p>
              )}
              {selectedEvent.booking.customer_phone && (
                <p className="text-xs text-gray-500">{selectedEvent.booking.customer_phone}</p>
              )}
            </div>
          )}
          {selectedEvent?.block && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Clock size={14} className="text-gray-400" />
                <span>{selectedEvent.time} – {selectedEvent.endTime}</span>
              </div>
              <Badge variant="destructive">Blocked</Badge>
              {selectedEvent.block.reason && (
                <p className="text-sm text-gray-600">{selectedEvent.block.reason}</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}