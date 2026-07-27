import { useEffect, useState, useCallback, useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { format, addDays, startOfWeek, endOfWeek } from 'date-fns'
import { RefreshCw, Zap, UserPlus, Ban, LayoutGrid, Columns } from 'lucide-react'
import pb, { type Room, type Booking, type TimeSlot, type Block } from '../lib/pocketbase'
import { useRealtime } from '../hooks/useRealtime'
import { useBranding } from '../lib/branding'
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import BlockModal from '../components/BlockModal'
import QuickBook from '../components/QuickBook'
import WeekCalendar from '../components/WeekCalendar'

interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  color: string
  backgroundColor?: string
  extendedProps: {
    type: 'booking' | 'block' | 'slot'
    status: string
    paymentStatus?: string
    roomName: string
    customerName?: string
    customerEmail?: string
    customerPhone?: string
    playerCount?: number
    reference?: string
    waiverSigned?: boolean
  }
}

export default function Calendar() {
  const [viewMode, setViewMode] = useState<'full' | 'week'>('full')
  const [rooms, setRooms] = useState<Room[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [showBlockModal, setShowBlockModal] = useState(false)
  const [showQuickBook, setShowQuickBook] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<{ start: Date; end: Date; room?: string } | null>(null)
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const calendarRef = useRef<FullCalendar>(null)
  const { branding } = useBranding()

  // Detect mobile viewport
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const loadCalendarData = useCallback(async () => {
    try {
      const roomsData = await pb.collection('rooms').getFullList<Room>({
        sort: 'sort_order',
        filter: 'is_active = true',
      })
      setRooms(roomsData)

      const [bookingsData, blocksData, hostsData] = await Promise.all([
        pb.collection('bookings').getFullList<Booking>({
          filter: 'status != "cancelled"',
          expand: 'room,time_slot',
        }),
        pb.collection('blocks').getFullList<Block>({
          expand: 'room',
        }),
        pb.collection('booking_staff').getFullList({ expand: 'staff' }).catch(() => [] as any[]),
      ])

      // Build host lookup: bookingId → GM name
      const hostMap: Record<string, string> = {}
      const hostsArr = Array.isArray(hostsData) ? hostsData : []
      for (const h of hostsArr) {
        hostMap[h.booking] = h.expand?.staff?.name || ''
      }

      const calendarEvents: CalendarEvent[] = []

      for (const b of bookingsData) {
        const room = roomsData.find(r => r.id === b.room)
        const ts = b.expand?.time_slot as TimeSlot | undefined
        if (!room || !ts) continue

        const gmName = hostMap[b.id]
        const dateStr = ts.date.split(' ')[0]
        calendarEvents.push({
          id: `booking-${b.id}`,
          title: `${b.customer_name} (${b.party_size}p)${gmName ? ` • ${gmName}` : ''}`,
          start: `${dateStr}T${ts.start_time}:00`,
          end: `${dateStr}T${ts.end_time}:00`,
          color: room.color,
          extendedProps: {
            type: 'booking',
            status: b.status,
            paymentStatus: b.payment_status,
            roomName: room.name,
            customerName: b.customer_name,
            customerEmail: b.customer_email,
            customerPhone: b.customer_phone,
            playerCount: b.party_size,
            reference: b.reference,
            waiverSigned: b.waiver_signed,
          },
        })
      }

      for (const block of blocksData) {
        const room = roomsData.find(r => r.id === block.room)
        calendarEvents.push({
          id: `block-${block.id}`,
          title: block.reason || 'Blocked',
          start: `${block.date}T${block.start_time}`,
          end: `${block.date}T${block.end_time}`,
          color: '#6B7280',
          extendedProps: {
            type: 'block',
            status: 'blocked',
            roomName: room?.name || 'Unknown',
          },
        })
      }

      setEvents(calendarEvents)
    } catch (e) {
      console.error('Failed to load calendar data:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCalendarData()
  }, [loadCalendarData])

  // Realtime subscriptions
  useRealtime('bookings', (action, record) => {
    console.log(`[SSE] Booking ${action}:`, record.id)
    loadCalendarData() // Reload on any booking change
  })

  useRealtime('blocks', (action, record) => {
    console.log(`[SSE] Block ${action}:`, record.id)
    loadCalendarData()
  })

  useRealtime('time_slots', (action, record) => {
    console.log(`[SSE] Slot ${action}:`, record.id)
  })

  // Track realtime connection
  useEffect(() => {
    const checkConnection = () => {
      pb.health.check().then(() => setRealtimeConnected(true)).catch(() => setRealtimeConnected(false))
    }
    checkConnection()
    const interval = setInterval(checkConnection, 10000)
    return () => clearInterval(interval)
  }, [])

  const [slotAction, setSlotAction] = useState<'book' | 'block' | null>(null)

  const handleDateSelect = (selectInfo: any) => {
    setSelectedSlot({
      start: selectInfo.start,
      end: selectInfo.end,
    })
    setSlotAction(null) // Show action picker
  }

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)

  const handleEventClick = (clickInfo: any) => {
    setSelectedEvent(clickInfo.event)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading calendar...</div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Calendar</h1>
          <div className="flex items-center gap-1 mt-2">
            <Button
              variant={viewMode === 'full' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('full')}
            >
              <Columns size={14} className="mr-1.5" /> Full
            </Button>
            <Button
              variant={viewMode === 'week' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('week')}
            >
              <LayoutGrid size={14} className="mr-1.5" /> Week
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Realtime indicator */}
          <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-gray-100 text-[10px] sm:text-xs">
            <Zap size={isMobile ? 10 : 12} className={realtimeConnected ? 'text-green-600' : 'text-gray-600'} />
            <span className={realtimeConnected ? 'text-green-600 hidden sm:inline' : 'text-gray-600 hidden sm:inline'}>
              {realtimeConnected ? 'Live' : 'Disconnected'}
            </span>
          </div>
          <button
            onClick={() => loadCalendarData()}
            className="p-1.5 sm:p-2 rounded-lg bg-gray-100 text-gray-500 hover:text-gray-900 hover:bg-gray-200 transition-colors"
          >
            <RefreshCw size={isMobile ? 14 : 16} />
          </button>
        </div>
      </div>

      {viewMode === 'week' && <WeekCalendar />}

      {viewMode === 'full' && (
      <>
      {/* Room color legend — compact on mobile */}
      <div className="flex flex-wrap gap-1.5 sm:gap-3 mb-3 sm:mb-4">
        {rooms.map(room => (
          <div key={room.id} className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs text-gray-600">
            <span className="w-2 h-2 sm:w-3 sm:h-3 rounded-full" style={{ backgroundColor: room.color }} />
            <span className="hidden sm:inline">{room.name}</span>
            <span className="sm:hidden">{room.name.split(' ').pop()}</span>
          </div>
        ))}
        <div className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs text-gray-600">
          <span className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-gray-500" />
          <span className="hidden sm:inline">Blocked</span>
        </div>
      </div>

      {/* FullCalendar */}
      <Card className="p-2 sm:p-4 calendar-wrapper"><CardContent className="p-0">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={isMobile ? 'timeGridDay' : 'timeGridWeek'}
          headerToolbar={isMobile ? {
            left: 'prev',
            center: 'title',
            right: 'next',
          } : {
            left: 'prev,next today',
            center: 'title',
            right: 'timeGridWeek,timeGridDay',
          }}
          slotMinTime="09:00:00"
          slotMaxTime="20:30:00"
          slotDuration="00:30:00"
          allDaySlot={false}
          weekends={true}
          selectable={true}
          selectMirror={true}
          dayMaxEvents={isMobile ? 1 : 3}
          events={events}
          select={handleDateSelect}
          eventClick={handleEventClick}
          height={isMobile ? 'auto' : 'calc(100vh - 280px)'}
          contentHeight={isMobile ? 500 : undefined}
          eventDisplay="block"
          nowIndicator={true}
        />
        </CardContent>
      </Card>

      {/* Modals */}
      {showBlockModal && selectedSlot && (
        <BlockModal
          rooms={rooms}
          slot={selectedSlot}
          onClose={() => {
            setShowBlockModal(false)
            setSelectedSlot(null)
          }}
          onComplete={() => {
            setShowBlockModal(false)
            setSelectedSlot(null)
            loadCalendarData()
          }}
        />
      )}

      {showQuickBook && selectedSlot && (
        <QuickBook
          rooms={rooms}
          slot={selectedSlot}
          onClose={() => {
            setShowQuickBook(false)
            setSelectedSlot(null)
          }}
          onComplete={() => {
            setShowQuickBook(false)
            setSelectedSlot(null)
            loadCalendarData()
          }}
        />
      )}

      {/* Action picker when selecting empty slot */}
      <Dialog open={!!(selectedSlot && !slotAction && !showBlockModal && !showQuickBook)} onOpenChange={(open) => { if (!open) setSelectedSlot(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>What would you like to do?</DialogTitle>
          </DialogHeader>
          {selectedSlot && (
            <>
              <p className="text-gray-900 font-bold mb-4">
                {format(selectedSlot.start, 'EEE, MMM d • HH:mm')} — {format(selectedSlot.end, 'HH:mm')}
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => { setShowQuickBook(true) }}
                  className="flex-1 flex flex-col items-center gap-2 p-4 h-auto"
                >
                  <UserPlus size={24} className="text-sb-red" />
                  <span className="text-sm font-bold text-gray-900">Book Session</span>
                  <span className="text-xs text-gray-500">Walk-in or phone booking</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setShowBlockModal(true) }}
                  className="flex-1 flex flex-col items-center gap-2 p-4 h-auto"
                >
                  <Ban size={24} className="text-gray-400" />
                  <span className="text-sm font-bold text-gray-900">Block Slot</span>
                  <span className="text-xs text-gray-500">Maintenance or event</span>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Event Detail Modal */}
      <Dialog open={!!selectedEvent} onOpenChange={(open) => { if (!open) setSelectedEvent(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              {selectedEvent && <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedEvent.backgroundColor }} />}
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                {selectedEvent?.extendedProps.type === 'booking' ? 'Booking' : 'Blocked'}
              </span>
            </div>
          </DialogHeader>

          {selectedEvent?.extendedProps.type === 'booking' ? (
            <div className="space-y-3">
              <div>
                <p className="text-lg font-bold text-gray-900">{selectedEvent.extendedProps.customerName}</p>
                <p className="text-sm text-gray-600">{selectedEvent.extendedProps.roomName}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-500 text-xs">Reference</p>
                  <p className="text-sb-orange font-mono text-sm">{selectedEvent.extendedProps.reference}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-500 text-xs">Players</p>
                  <p className="text-gray-900 font-bold">{selectedEvent.extendedProps.playerCount}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-500 text-xs">Booking Status</p>
                  <Badge variant={
                    selectedEvent.extendedProps.status === 'confirmed' ? 'success' :
                    selectedEvent.extendedProps.status === 'pending' ? 'warning' :
                    'secondary'
                  }>{selectedEvent.extendedProps.status}</Badge>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-500 text-xs">Payment</p>
                  <Badge variant={
                    selectedEvent.extendedProps.paymentStatus === 'paid' ? 'success' :
                    'warning'
                  }>{selectedEvent.extendedProps.paymentStatus}</Badge>
                </div>
              </div>
              <div className="text-sm space-y-1">
                <div className="flex justify-between text-gray-600">
                  <span>Email</span><span className="text-gray-900">{selectedEvent.extendedProps.customerEmail}</span>
                </div>
                {selectedEvent.extendedProps.customerPhone && (
                  <div className="flex justify-between text-gray-600">
                    <span>Phone</span><span className="text-gray-900">{selectedEvent.extendedProps.customerPhone}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600">
                  <span>Waiver</span>
                  <span className={selectedEvent.extendedProps.waiverSigned ? 'text-green-600' : 'text-yellow-600'}>
                    {selectedEvent.extendedProps.waiverSigned ? '✓ Signed' : 'Pending'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-lg font-bold text-gray-900 mb-2">{selectedEvent?.title}</p>
              <p className="text-sm text-gray-600">
                {selectedEvent?.start && format(selectedEvent.start, 'EEE, MMM d • HH:mm')}
                {selectedEvent?.end && ` — ${format(selectedEvent.end, 'HH:mm')}`}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
      </>
      )}
    </div>
  )
}

<style>{`
  /* FullCalendar light theme */
  .calendar-wrapper .fc {
    --fc-border-color: #e5e7eb;
    --fc-button-bg-color: #fff;
    --fc-button-border-color: #d1d5db;
    --fc-button-text-color: #374151;
    --fc-button-hover-bg-color: #f3f4f6;
    --fc-button-active-bg-color: #FF4500;
    --fc-button-active-text-color: #fff;
    --fc-today-bg-color: rgba(255,69,0,0.04);
    --fc-page-bg-color: #fff;
    --fc-neutral-bg-color: #f9fafb;
  }
  .calendar-wrapper .fc .fc-toolbar-title {
    color: #111827;
    font-size: 1.1rem;
    font-weight: 700;
  }
  .calendar-wrapper .fc .fc-button {
    color: #374151;
    font-size: 0.8rem;
    font-weight: 600;
    padding: 6px 12px;
    border-radius: 6px;
  }
  .calendar-wrapper .fc .fc-button-active {
    color: white !important;
  }
  .calendar-wrapper .fc .fc-timegrid-slot-label {
    color: #6B7280;
    font-size: 0.75rem;
  }
  .calendar-wrapper .fc .fc-col-header-cell {
    background: #f9fafb;
    color: #374151;
    font-weight: 600;
    font-size: 0.8rem;
    padding: 8px 0;
  }
  .calendar-wrapper .fc .fc-col-header-cell-cushion {
    color: #374151;
  }
  .calendar-wrapper .fc .fc-timegrid-slot {
    height: 2rem;
  }
  .calendar-wrapper .fc .fc-timegrid-slot-minor {
    border-color: #e5e7eb;
  }
  .calendar-wrapper .fc .fc-timegrid-divider {
    border-color: #e5e7eb;
  }
  .calendar-wrapper .fc .fc-timegrid-now-indicator-line {
    border-color: #FF4500;
  }
  .calendar-wrapper .fc .fc-timegrid-now-indicator-arrow {
    border-color: #FF4500;
  }
  .calendar-wrapper .fc .fc-event {
    border-radius: 4px;
    font-size: 0.75rem;
    padding: 2px 6px;
    border: none;
    font-weight: 500;
  }
  .calendar-wrapper .fc .fc-daygrid-day {
    background: transparent;
  }
  .calendar-wrapper .fc .fc-scrollgrid {
    border-color: #e5e7eb;
  }
  .calendar-wrapper .fc th {
    border-color: #e5e7eb;
  }
  .calendar-wrapper .fc td {
    border-color: #e5e7eb;
  }
  .calendar-wrapper .fc .fc-timegrid-body {
    min-height: 400px;
  }

  /* Mobile calendar adjustments */
  @media (max-width: 767px) {
    .calendar-wrapper .fc .fc-toolbar {
      flex-wrap: wrap;
      gap: 6px;
    }
    .calendar-wrapper .fc .fc-toolbar-title {
      font-size: 0.9rem !important;
    }
    .calendar-wrapper .fc .fc-button {
      font-size: 0.7rem !important;
      padding: 4px 8px !important;
    }
    .calendar-wrapper .fc .fc-timegrid-slot {
      height: 1.5rem !important;
    }
    .calendar-wrapper .fc .fc-timegrid-slot-label {
      font-size: 0.65rem !important;
    }
    .calendar-wrapper .fc .fc-col-header-cell {
      font-size: 0.7rem !important;
      padding: 4px 0 !important;
    }
    .calendar-wrapper .fc .fc-event {
      font-size: 0.65rem !important;
      padding: 1px 4px !important;
    }
    .calendar-wrapper .fc .fc-timegrid-body {
      min-height: 300px;
    }
    .calendar-wrapper .fc .fc-timegrid-now-indicator-arrow {
      display: none;
    }
  }
`}</style>
