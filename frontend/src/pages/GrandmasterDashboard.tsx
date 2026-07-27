import { useEffect, useState, useMemo } from 'react'
import {
  TrendingUp,
  DollarSign,
  Users,
  Calendar,
  Clock,
  Loader2,
  BarChart3,
  Award,
  AlertCircle,
  CheckCircle,
  XCircle,
  Hourglass,
  BedDouble,
} from 'lucide-react'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns'
import pb, { type Room, type Booking, type TimeSlot } from '../lib/pocketbase'
import { useAuth } from '../lib/auth'
import { useBranding } from '../lib/branding'
import { useRealtime } from '../hooks/useRealtime'

interface GameHostRecord {
  id: string
  booking: string
  staff: string
  assigned_at: string
  status: string
  hints_used: number
  notes: string
  expand?: {
    booking?: Booking
    staff?: { id: string; name: string; avatar_color: string; role: string }
  }
}

interface GmBlock {
  id: string
  room: string
  date: string
  start_time: string
  end_time: string
  reason: string
}

interface StaffRecord {
  id: string
  name: string
  email: string
  role: 'grandmaster' | 'gamemaster'
  avatar_color: string
  is_active: boolean
}

interface GmStats {
  staffId: string
  name: string
  avatarColor: string
  gamesHosted: number
  hintsUsed: number
  statusBreakdown: Record<string, number>
}

interface RoomStats {
  room: Room
  totalBookings: number
  thisWeekBookings: number
  thisMonthBookings: number
  revenue: number
}

export default function GrandmasterDashboard() {
  const { staff, isGrandmaster } = useAuth()
  const { branding } = useBranding()
  const [rooms, setRooms] = useState<Room[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [gameHosts, setGameHosts] = useState<GameHostRecord[]>([])
  const [staffList, setStaffList] = useState<StaffRecord[]>([])
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
  const [gmBlocks, setGmBlocks] = useState<GmBlock[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    try {
      const [
        roomsData,
        bookingsData,
        hostsData,
        staffData,
        slotsData,
        blocksData,
      ] = await Promise.all([
        pb.collection('rooms').getFullList<Room>({ sort: 'sort_order' }),
        pb.collection('bookings').getFullList<Booking>({ sort: '-id' }),
        pb.collection('game_hosts').getFullList<GameHostRecord>({
          expand: 'booking,staff',
          sort: '-assigned_at',
        }),
        pb.collection('staff').getFullList<StaffRecord>({ filter: 'is_active = true' }),
        pb.collection('time_slots').getFullList<TimeSlot>({ sort: 'date,start_time' }),
        pb.collection('gm_blocks').getFullList<GmBlock>({ sort: 'date,start_time' }),
      ])

      setRooms(roomsData)
      setBookings(bookingsData)
      setGameHosts(hostsData)
      setStaffList(staffData)
      setTimeSlots(slotsData)
      setGmBlocks(blocksData)
    } catch (e) {
      console.error('Failed to load grandmaster data:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  useRealtime('bookings', () => loadData())
  useRealtime('game_hosts', () => loadData())
  useRealtime('time_slots', () => loadData())
  useRealtime('gm_blocks', () => loadData())

  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)

  const paidBookings = useMemo(() => bookings.filter(b => b.payment_status === 'paid'), [bookings])

  // PocketBase v0.25 doesn't expose 'created' field — show all-time revenue for now
  const revenueThisWeek = useMemo(() => {
    return paidBookings.reduce((sum, b) => sum + b.total_amount, 0)
  }, [paidBookings])

  const revenueThisMonth = useMemo(() => {
    return paidBookings.reduce((sum, b) => sum + b.total_amount, 0)
  }, [paidBookings])

  const revenueAllTime = useMemo(() => {
    return paidBookings.reduce((sum, b) => sum + b.total_amount, 0)
  }, [paidBookings])

  const bookingStats = useMemo(() => {
    const total = bookings.length
    const confirmed = bookings.filter(b => b.status === 'confirmed').length
    const pending = bookings.filter(b => b.status === 'pending').length
    const cancelled = bookings.filter(b => b.status === 'cancelled').length
    return { total, confirmed, pending, cancelled }
  }, [bookings])

  const gmStats = useMemo(() => {
    const statsMap = new Map<string, GmStats>()

    for (const host of gameHosts) {
      const staffId = host.staff
      if (!staffId) continue

      if (!statsMap.has(staffId)) {
        const staffMember = host.expand?.staff
        statsMap.set(staffId, {
          staffId,
          name: staffMember?.name || 'Unknown',
          avatarColor: staffMember?.avatar_color || '#666',
          gamesHosted: 0,
          hintsUsed: 0,
          statusBreakdown: {},
        })
      }

      const stat = statsMap.get(staffId)!
      stat.gamesHosted++
      stat.hintsUsed += host.hints_used || 0
      stat.statusBreakdown[host.status] = (stat.statusBreakdown[host.status] || 0) + 1
    }

    return Array.from(statsMap.values()).sort((a, b) => b.gamesHosted - a.gamesHosted)
  }, [gameHosts])

  const roomStats = useMemo(() => {
    return rooms.map(room => {
      const roomBookings = bookings.filter(b => b.room === room.id)
      const thisWeek = roomBookings.filter(b => {
        try {
          const slot = timeSlots.find(s => s.id === b.time_slot)
          if (!slot) return false
          return isWithinInterval(parseISO(slot.date), { start: weekStart, end: weekEnd })
        } catch { return false }
      })
      const thisMonth = roomBookings.filter(b => {
        try {
          const slot = timeSlots.find(s => s.id === b.time_slot)
          if (!slot) return false
          return isWithinInterval(parseISO(slot.date), { start: monthStart, end: monthEnd })
        } catch { return false }
      })
      const revenue = roomBookings
        .filter(b => b.payment_status === 'paid')
        .reduce((sum, b) => sum + b.total_amount, 0)

      return {
        room,
        totalBookings: roomBookings.length,
        thisWeekBookings: thisWeek.length,
        thisMonthBookings: thisMonth.length,
        revenue,
      }
    }).sort((a, b) => b.totalBookings - a.totalBookings)
  }, [rooms, bookings, timeSlots, weekStart.getTime(), weekEnd.getTime(), monthStart.getTime(), monthEnd.getTime()])

  const recentBookings = useMemo(() => bookings.slice(0, 10), [bookings])

  const todayStr = format(now, 'yyyy-MM-dd')
  const todaysSchedule = useMemo(() => {
    const todaySlots = timeSlots.filter(s => s.date === todayStr)
    const todayBlocks = gmBlocks.filter(b => b.date === todayStr)

    const slotEvents = todaySlots.map(slot => {
      const room = rooms.find(r => r.id === slot.room)
      const booking = bookings.find(b => b.time_slot === slot.id)
      return {
        type: 'slot' as const,
        time: slot.start_time,
        endTime: slot.end_time,
        room,
        slot,
        booking,
      }
    })

    const blockEvents = todayBlocks.map(block => {
      const room = rooms.find(r => r.id === block.room)
      return {
        type: 'block' as const,
        time: block.start_time,
        endTime: block.end_time,
        room,
        reason: block.reason,
      }
    })

    return [...slotEvents, ...blockEvents].sort((a, b) => a.time.localeCompare(b.time))
  }, [timeSlots, gmBlocks, rooms, bookings, todayStr])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-gr8-red" size={32} />
      </div>
    )
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-green-500/20 text-green-700'
      case 'pending': return 'bg-yellow-500/20 text-yellow-700'
      case 'cancelled': return 'bg-red-500/20 text-red-700'
      case 'completed': return 'bg-blue-500/20 text-blue-700'
      default: return 'bg-gray-500/20 text-gray-600'
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900">
          {branding.staff_role_admin} <span className="text-gr8-orange">Dashboard</span>
        </h1>
        <p className="text-gray-500 mt-1">
          Welcome back, {staff?.name}. Here's your business overview.
        </p>
      </div>

      {/* Revenue Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="card-dark">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gr8-red/10 text-gr8-red">
              <TrendingUp size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">R{revenueThisWeek.toLocaleString()}</p>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Revenue This Week</p>
            </div>
          </div>
        </div>
        <div className="card-dark">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gr8-orange/10 text-gr8-orange">
              <DollarSign size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">R{revenueThisMonth.toLocaleString()}</p>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Revenue This Month</p>
            </div>
          </div>
        </div>
        <div className="card-dark">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10 text-green-400">
              <BarChart3 size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">R{revenueAllTime.toLocaleString()}</p>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Revenue All Time</p>
            </div>
          </div>
        </div>
      </div>

      {/* Deposit vs Full Payment Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="card-dark">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Deposits Collected</p>
          <p className="text-2xl font-bold text-gr8-orange">
            R{bookings.filter(b => b.payment_type === 'deposit' && b.payment_status === 'paid')
              .reduce((sum, b) => sum + (b.deposit_amount || 640), 0).toLocaleString()}
          </p>
          <p className="text-xs text-gray-600">{bookings.filter(b => b.payment_type === 'deposit').length} bookings</p>
        </div>
        <div className="card-dark">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Balance Due at Venue</p>
          <p className="text-2xl font-bold text-yellow-600">
            R{bookings.filter(b => b.payment_type === 'deposit' && b.status !== 'cancelled')
              .reduce((sum, b) => sum + (b.balance_due || 0), 0).toLocaleString()}
          </p>
          <p className="text-xs text-gray-600">To collect on arrival</p>
        </div>
        <div className="card-dark">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Full Payments</p>
          <p className="text-2xl font-bold text-green-600">
            R{bookings.filter(b => b.payment_type === 'full' && b.payment_status === 'paid')
              .reduce((sum, b) => sum + b.total_amount, 0).toLocaleString()}
          </p>
          <p className="text-xs text-gray-600">{bookings.filter(b => b.payment_type === 'full').length} bookings</p>
        </div>
        <div className="card-dark">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Revenue</p>
          <p className="text-2xl font-bold text-gray-900">R{revenueAllTime.toLocaleString()}</p>
          <p className="text-xs text-gray-600">All confirmed bookings</p>
        </div>
      </div>

      {/* Bookings Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="card-dark text-center">
          <p className="text-2xl sm:text-3xl font-black text-gray-900">{bookingStats.total}</p>
          <p className="text-xs text-gray-500 uppercase tracking-wider mt-1">Total Bookings</p>
        </div>
        <div className="card-dark text-center">
          <p className="text-2xl sm:text-3xl font-black text-green-600">{bookingStats.confirmed}</p>
          <p className="text-xs text-gray-500 uppercase tracking-wider mt-1">Confirmed</p>
        </div>
        <div className="card-dark text-center">
          <p className="text-2xl sm:text-3xl font-black text-yellow-600">{bookingStats.pending}</p>
          <p className="text-xs text-gray-500 uppercase tracking-wider mt-1">Pending</p>
        </div>
        <div className="card-dark text-center">
          <p className="text-2xl sm:text-3xl font-black text-red-600">{bookingStats.cancelled}</p>
          <p className="text-xs text-gray-500 uppercase tracking-wider mt-1">Cancelled</p>
        </div>
      </div>

      {/* Bookings per Game Master */}
      <div className="card-dark mb-8">
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Award size={18} className="text-gr8-orange" />
          {branding.staff_role_worker} Performance
        </h2>
        {gmStats.length === 0 ? (
          <p className="text-gray-500 text-sm">No game host data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">{branding.staff_role_worker}</th>
                  <th className="text-center py-3 px-4 text-gray-500 font-medium">Games Hosted</th>
                  <th className="text-center py-3 px-4 text-gray-500 font-medium">Hints Given</th>
                  <th className="text-center py-3 px-4 text-gray-500 font-medium">Completed</th>
                  <th className="text-center py-3 px-4 text-gray-500 font-medium">In Progress</th>
                </tr>
              </thead>
              <tbody>
                {gmStats.map(gm => (
                  <tr key={gm.staffId} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ backgroundColor: gm.avatarColor }}
                        >
                          {gm.name.charAt(0)}
                        </div>
                        <span className="text-gray-900 font-medium">{gm.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center text-gray-900 font-bold">{gm.gamesHosted}</td>
                    <td className="py-3 px-4 text-center text-gr8-orange font-bold">{gm.hintsUsed}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-green-600 font-bold">{gm.statusBreakdown['completed'] || 0}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-blue-600 font-bold">{gm.statusBreakdown['in_progress'] || 0}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Room Occupancy */}
      <div className="card-dark mb-8">
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <BedDouble size={18} className="text-gr8-red" />
          {branding.resource_label} Occupancy
        </h2>
        {roomStats.length === 0 ? (
          <p className="text-gray-500 text-sm">No {branding.resource_label.toLowerCase()} data available.</p>
        ) : (
          <div className="space-y-3">
            {roomStats.map(({ room, totalBookings, thisWeekBookings, thisMonthBookings, revenue }) => {
              const maxBookings = Math.max(...roomStats.map(r => r.totalBookings), 1)
              const utilization = Math.round((totalBookings / maxBookings) * 100)

              return (
                <div key={room.id} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: room.color }} />
                      <span className="font-bold text-gray-900">{room.name}</span>
                    </div>
                    <span className="text-xs text-gray-500">R{revenue.toLocaleString()} revenue</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${utilization}%`,
                        backgroundColor: room.color,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{totalBookings} total bookings</span>
                    <span>{thisWeekBookings} this week</span>
                    <span>{thisMonthBookings} this month</span>
                    <span className="text-gr8-orange font-medium">{utilization}% utilization</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent Bookings */}
      <div className="card-dark mb-8">
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Clock size={18} className="text-gray-500" />
          Recent Bookings
        </h2>
        {recentBookings.length === 0 ? (
          <p className="text-gray-500 text-sm">No bookings yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Reference</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Customer</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">{branding.resource_label}</th>
                  {branding.show_player_count && <th className="text-center py-3 px-4 text-gray-500 font-medium">Players</th>}
                  <th className="text-right py-3 px-4 text-gray-500 font-medium">Amount</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Payment</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentBookings.map(b => {
                  const room = rooms.find(r => r.id === b.room)
                  return (
                    <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 font-mono text-xs text-gr8-orange">{b.reference}</td>
                      <td className="py-3 px-4 text-gray-900">{b.customer_name}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: room?.color || '#666' }} />
                          <span className="text-gray-600 text-xs">{room?.name || '—'}</span>
                        </div>
                      </td>
                      {branding.show_player_count && <td className="py-3 px-4 text-center text-gray-600">{b.player_count}</td>}
                      <td className="py-3 px-4 text-right text-gray-600">R{b.total_amount}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                          b.payment_status === 'paid' ? 'bg-green-500/20 text-green-700' :
                          b.payment_status === 'refunded' ? 'bg-yellow-500/20 text-yellow-700' :
                          b.payment_status === 'failed' ? 'bg-red-500/20 text-red-700' :
                          'bg-gray-500/20 text-gray-600'
                        }`}>
                          {b.payment_status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${statusColor(b.status)}`}>
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Today's Schedule */}
      <div className="card-dark">
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Calendar size={18} className="text-gr8-red" />
          Today's Schedule
          <span className="text-sm font-normal text-gray-500 ml-2">{format(now, 'EEEE, d MMMM yyyy')}</span>
        </h2>
        {todaysSchedule.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">Nothing scheduled for today.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {todaysSchedule.map((event, i) => (
              <div
                key={`${event.type}-${i}`}
                className={`flex items-center gap-4 p-3 rounded-lg ${
                  event.type === 'block' ? 'bg-red-500/5 border border-red-500/20' : 'bg-gray-50'
                }`}
              >
                <div className="text-center min-w-[80px]">
                  <p className="text-sm font-bold text-gray-900">{event.time}</p>
                  <p className="text-[10px] text-gray-500">{event.endTime}</p>
                </div>
                {event.room && (
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: event.room.color }} />
                )}
                <div className="flex-1 min-w-0">
                  {event.type === 'block' ? (
                    <div className="flex items-center gap-2">
                      <AlertCircle size={14} className="text-red-600 flex-shrink-0" />
                      <span className="text-red-600 font-medium text-sm">Blocked: {event.reason}</span>
                      {event.room && <span className="text-gray-500 text-xs">— {event.room.name}</span>}
                    </div>
                  ) : (
                    <div>
                      <p className="text-gray-900 font-medium text-sm">
                        {event.room?.name || `Unknown ${branding.resource_label}`}
                      </p>
                      {event.booking ? (
                        <p className="text-gray-500 text-xs">
                          {event.booking.customer_name}{branding.show_player_count ? ` • ${event.booking.player_count} players` : ''} •{' '}
                          <span className={`font-bold ${
                            event.booking.status === 'confirmed' ? 'text-green-600' :
                            event.booking.status === 'pending' ? 'text-yellow-600' :
                            'text-gray-500'
                          }`}>
                            {event.booking.status}
                          </span>
                        </p>
                      ) : (
                        <p className="text-gray-500 text-xs">
                          {event.slot?.status === 'available' ? 'Available' : event.slot?.status || '—'}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                {event.type !== 'block' && event.slot && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    event.slot.status === 'available' ? 'bg-green-500/20 text-green-700' :
                    event.slot.status === 'reserved' ? 'bg-blue-500/20 text-blue-700' :
                    event.slot.status === 'full' ? 'bg-red-500/20 text-red-700' :
                    'bg-gray-500/20 text-gray-600'
                  }`}>
                    {event.slot.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
