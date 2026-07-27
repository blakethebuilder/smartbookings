import { useEffect, useState } from 'react'
import { UserPlus, Loader2, Copy, Check, ExternalLink, Download, CreditCard } from 'lucide-react'
import { format } from 'date-fns'
import pb, { type Booking, type Room, type TimeSlot } from '../lib/pocketbase'
import { useBranding } from '../lib/branding'
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import AssignStaff from '../components/AssignStaff'

interface HostInfo {
  staffName: string
  staffColor: string
  status: string
}

export default function Bookings() {
  const { branding } = useBranding()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [rooms, setRooms] = useState<Record<string, Room>>({})
  const [slots, setSlots] = useState<Record<string, TimeSlot>>({})
  const [hosts, setHosts] = useState<Record<string, HostInfo>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [assignModal, setAssignModal] = useState<{ booking: Booking; room: Room; timeSlot: TimeSlot } | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [cancelConfirm, setCancelConfirm] = useState<Booking | null>(null)

  const copyWaiverLink = (reference: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/waiver/${reference}`)
    setCopiedId(reference)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const cancelBooking = async (b: Booking) => {
    try {
      await pb.collection('bookings').update(b.id, { status: 'cancelled' })
      if (b.time_slot) {
        await pb.collection('time_slots').update(b.time_slot, { status: 'available' })
      }
      loadData()
    } catch (e) {
      console.error('Failed to cancel booking:', e)
    }
  }

  const togglePayment = async (b: Booking) => {
    const newStatus = b.payment_status === 'paid' ? 'unpaid' : 'paid'
    const newBookingStatus = newStatus === 'paid' && b.status === 'pending' ? 'confirmed' : b.status
    try {
      await pb.collection('bookings').update(b.id, {
        payment_status: newStatus,
        status: newBookingStatus,
      })
      loadData()
    } catch (e) {
      console.error('Failed to update payment:', e)
    }
  }

  const exportCSV = () => {
    const headers = ['Reference', 'Customer', 'Email', 'Phone', 'Room', 'Date', 'Time', 'Players', 'Total', 'Deposit', 'Balance', 'Payment Type', 'Status', 'Payment', 'Waiver']
    const rows = filtered.map(b => {
      const room = rooms[b.room]
      const ts = slots[b.time_slot]
      return [
        b.reference,
        b.customer_name,
        b.customer_email,
        b.customer_phone || '',
        room?.name || '',
        ts ? format(new Date(ts.date), 'yyyy-MM-dd') : '',
        ts ? `${ts.start_time}-${ts.end_time}` : '',
        b.party_size,
        b.total_amount,
        b.deposit_amount || 0,
        b.balance_due || 0,
        b.payment_type || '',
        b.status,
        b.payment_status,
        b.waiver_signed ? 'Yes' : 'No',
      ]
    })

    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bookings-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const loadData = async () => {
    try {
      const [bookingsData, roomsList, slotsList, hostsList] = await Promise.all([
        pb.collection('bookings').getFullList<Booking>({ sort: '-id' }),
        pb.collection('rooms').getFullList<Room>(),
        pb.collection('time_slots').getFullList<TimeSlot>(),
        pb.collection('booking_staff').getFullList({ expand: 'staff' }).catch(() => [] as any[]),
      ])

      // Build lookup maps
      const roomMap: Record<string, Room> = {}
      roomsList.forEach(r => { roomMap[r.id] = r })

      const slotMap: Record<string, TimeSlot> = {}
      slotsList.forEach(s => { slotMap[s.id] = s })

      const hostMap: Record<string, HostInfo> = {}
      const hostsArr = Array.isArray(hostsList) ? hostsList : []
      for (const h of hostsArr) {
        const staff = h.expand?.staff
        hostMap[h.booking] = {
          staffName: staff?.name || 'Unknown',
          staffColor: staff?.avatar_color || '#666',
          status: h.status,
        }
      }

      setRooms(roomMap)
      setSlots(slotMap)
      setHosts(hostMap)
      setBookings(bookingsData)
    } catch (e) {
      console.error('Failed to load bookings:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const filtered = filter === 'all' ? bookings : bookings.filter(b => b.status === filter)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-sb-red" size={32} />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Bookings</h1>
          <p className="text-gray-500 mt-1">{bookings.length} total bookings</p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200 text-sm font-medium transition-colors"
        >
          <Download size={16} />
          Download CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {['all', 'pending', 'confirmed', 'cancelled', 'completed'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-sb-orange text-white'
                : 'bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Bookings table */}
      <Card>
        <CardContent className="p-0">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-500">No bookings found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-2 sm:px-4 text-gray-500 font-medium">Ref</th>
                  <th className="text-left py-3 px-2 sm:px-4 text-gray-500 font-medium">Customer</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium hidden sm:table-cell">{branding.resource_label}</th>
                  <th className="text-left py-3 px-2 sm:px-4 text-gray-500 font-medium">Date</th>
                  {branding.show_player_count && <th className="text-left py-3 px-4 text-gray-500 font-medium hidden sm:table-cell">Players</th>}
                  <th className="text-left py-3 px-2 sm:px-4 text-gray-500 font-medium">Total</th>
                  <th className="text-left py-3 px-2 sm:px-4 text-gray-500 font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium hidden sm:table-cell">Staff</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium hidden sm:table-cell">Payment</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium hidden sm:table-cell">Waiver</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => {
                  const room = rooms[b.room]
                  const ts = slots[b.time_slot]
                  const host = hosts[b.id]

                  return (
                    <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-2 sm:px-4 font-mono text-xs text-sb-orange">{b.reference}</td>
                      <td className="py-3 px-2 sm:px-4">
                        <p className="text-gray-900 font-medium text-sm">{b.customer_name}</p>
                        <p className="text-xs text-gray-500 truncate max-w-[120px] sm:max-w-none">{b.customer_email}</p>
                      </td>
                      <td className="py-3 px-4 hidden sm:table-cell">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: room?.color }} />
                          <span className="text-gray-700 text-xs">{room?.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-2 sm:px-4 text-gray-600 text-xs">
                        {ts ? `${format(new Date(ts.date), 'MMM d')} ${ts.start_time}` : '—'}
                      </td>
                      {branding.show_player_count && <td className="py-3 px-4 text-gray-600 text-center hidden sm:table-cell">{b.party_size}</td>}
                      <td className="py-3 px-2 sm:px-4 text-gray-600 text-sm">R{b.total_amount}</td>
                      <td className="py-3 px-2 sm:px-4">
                        <Badge variant={
                          b.status === 'confirmed' ? 'success' :
                          b.status === 'pending' ? 'warning' :
                          b.status === 'cancelled' ? 'destructive' :
                          'secondary'
                        }>
                          {b.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        {host ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                              style={{ backgroundColor: host.staffColor }}>
                              {host.staffName[0]}
                            </div>
                            <span className="text-xs text-gray-700">{host.staffName}</span>
                          </div>
                        ) : room && ts ? (
                          <button
                            onClick={() => setAssignModal({ booking: b, room, timeSlot: ts })}
                            className="flex items-center gap-1 px-2 py-1 rounded bg-gray-100 text-gray-500 hover:text-sb-orange hover:bg-sb-orange/10 text-xs transition-colors"
                          >
                            <UserPlus size={12} /> Assign
                          </button>
                        ) : (
                          <span className="text-xs text-gray-600">—</span>
                        )}
                      </td>
                      <td className="py-3 px-2 sm:px-4 hidden sm:table-cell">
                        <button
                          onClick={() => togglePayment(b)}
                          className="text-xs cursor-pointer hover:opacity-80 transition-opacity"
                          title="Click to toggle paid/unpaid"
                        >
                          <Badge variant={
                            b.payment_status === 'paid' ? 'success' :
                            b.payment_status === 'refunded' ? 'secondary' :
                            'secondary'
                          }>
                            {b.payment_status === 'paid' ? 'Paid' :
                             b.payment_status === 'refunded' ? 'Refunded' :
                             b.payment_type === 'deposit' ? 'Dep Unpaid' : 'Unpaid'}
                          </Badge>
                          {b.balance_due > 0 && (
                            <p className="text-gray-500 mt-1">R{b.balance_due} due</p>
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        {b.waiver_signed ? (
                          <span className="text-green-600 text-xs font-bold">✓ Signed</span>
                        ) : (
                          <button
                            onClick={() => copyWaiverLink(b.reference)}
                            className="flex items-center gap-1 px-2 py-1 rounded bg-gray-100 text-gray-500 hover:text-sb-orange hover:bg-sb-orange/10 text-xs transition-colors"
                          >
                            {copiedId === b.reference ? (
                              <><Check size={12} /> Copied</>
                            ) : (
                              <><Copy size={12} /> Send Waiver</>
                            )}
                          </button>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {(b.status === 'pending' || b.status === 'confirmed') ? (
                          <button
                            onClick={() => setCancelConfirm(b)}
                            className="px-2 py-1 rounded bg-red-500/20 text-red-600 text-xs font-bold hover:bg-red-500/30 transition-colors"
                          >
                            Cancel
                          </button>
                        ) : (
                          <span className="text-xs text-gray-600">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        </CardContent>
      </Card>

      {/* Assign Staff Modal */}
      {assignModal && (
        <AssignStaff
          booking={assignModal.booking}
          room={assignModal.room}
          timeSlot={assignModal.timeSlot}
          onClose={() => setAssignModal(null)}
          onComplete={() => {
            setAssignModal(null)
            loadData()
          }}
        />
      )}

      {/* Cancel Confirmation Dialog */}
      <Dialog open={!!cancelConfirm} onOpenChange={(open) => { if (!open) setCancelConfirm(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Booking?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Cancel booking {cancelConfirm?.reference} for {cancelConfirm?.customer_name}? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelConfirm(null)}>Keep Booking</Button>
            <Button variant="destructive" onClick={() => { if (cancelConfirm) cancelBooking(cancelConfirm); setCancelConfirm(null); }}>
              Yes, Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
