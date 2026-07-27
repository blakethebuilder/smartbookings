import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { CheckCircle, Calendar, Clock, Users, Home, AlertCircle, Loader2, Share2, Copy, Check, Shield, Download, XCircle } from 'lucide-react'
import { format } from 'date-fns'
import pb, { type Booking, type Room, type TimeSlot } from '../lib/pocketbase'
import { useBranding } from '../lib/branding'

export default function BookConfirm() {
  const { branding } = useBranding()
  const { reference } = useParams()
  const [booking, setBooking] = useState<Booking | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [timeSlot, setTimeSlot] = useState<TimeSlot | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelHoursBefore, setCancelHoursBefore] = useState('24')
  const [cancelAdminFee, setCancelAdminFee] = useState('50')

  useEffect(() => {
    if (!reference) return

    pb.collection('bookings').getFirstListItem<Booking>(
      `reference = "${reference}"`,
      { expand: 'room,time_slot' },
    ).then(async b => {
      setBooking(b)
      if (b.expand?.room) setRoom(b.expand.room as Room)
      if (b.expand?.time_slot) setTimeSlot(b.expand.time_slot as TimeSlot)

      // Load cancellation settings
      try {
        const hoursSetting = await pb.collection('settings').getFirstListItem('key = "cancellation_hours_before"')
        const feeSetting = await pb.collection('settings').getFirstListItem('key = "cancellation_admin_fee"')
        if (hoursSetting) setCancelHoursBefore(hoursSetting.value)
        if (feeSetting) setCancelAdminFee(feeSetting.value)
      } catch (_) {
        // Use defaults
      }

      // Security: Don't auto-confirm — ITN webhook handles real confirmation
      // For sandbox testing, admin can manually confirm via dashboard

      setLoading(false)
    }).catch(err => {
      console.error('[BookConfirm] Failed to load booking:', err)
      setLoading(false)
    })
  }, [reference])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-gr8-orange" size={32} />
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Booking not found</h1>
          <p className="text-gray-500 mb-6">Reference "{reference}" doesn't match any booking.</p>
          <a href="https://gr8.smartintegrate.co.za" className="btn-gr8 px-6 py-3 inline-block">Go to Website</a>
        </div>
      </div>
    )
  }

  const isConfirmed = booking.status === 'confirmed' || booking.payment_status === 'paid'

  const handleCancel = async () => {
    setCancelling(true)
    try {
      await pb.collection('bookings').update(booking.id, { status: 'cancelled' })
      if (booking.time_slot) {
        await pb.collection('time_slots').update(booking.time_slot, { status: 'available' })
      }
      setBooking(prev => prev ? { ...prev, status: 'cancelled' } : null)
      setShowCancelDialog(false)
    } catch (e) {
      console.error('Failed to cancel booking:', e)
    } finally {
      setCancelling(false)
    }
  }

  // Generate ICS file for calendar download
  const downloadICS = () => {
    if (!room || !timeSlot) return
    const dateStr = timeSlot.date.split(' ')[0]
    const startDateTime = `${dateStr}T${timeSlot.start_time}:00`
    const endDateTime = `${dateStr}T${timeSlot.end_time}:00`

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      `PRODID:-//${branding.business_name}//Booking//EN`,
      'BEGIN:VEVENT',
      `DTSTART:${startDateTime.replace(/[-:]/g, '').replace('T', 'T')}`,
      `DTEND:${endDateTime.replace(/[-:]/g, '').replace('T', 'T')}`,
      `SUMMARY:${branding.resource_label} - ${room.name}`,
      `DESCRIPTION:${branding.business_name} - ${room.name}\\nBooking: ${booking.reference}\\nPlayers: ${booking.player_count}\\nPlease arrive 15 minutes early. No phones allowed.`,
      `LOCATION:${branding.business_name}, Pineslopes Office Park, Fourways, Johannesburg`,
      `STATUS:CONFIRMED`,
      `END:VEVENT`,
      'END:VCALENDAR',
    ].join('\r\n')

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gr8escape-${room.name.toLowerCase().replace(/\s+/g, '-')}.ics`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm py-4 px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <a href="https://gr8.smartintegrate.co.za" className="text-xl font-black text-gray-900 tracking-tight">
            {branding.business_name}
          </a>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 sm:py-16 text-center">
        <div className="mb-8">
          {confirming ? (
            <Loader2 size={64} className="text-gr8-orange mx-auto mb-4 animate-spin" />
          ) : booking.status === 'cancelled' ? (
            <XCircle size={64} className="text-red-400 mx-auto mb-4" />
          ) : isConfirmed ? (
            <CheckCircle size={64} className="text-green-400 mx-auto mb-4" />
          ) : (
            <AlertCircle size={64} className="text-yellow-400 mx-auto mb-4" />
          )}

          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 mb-2">
            {confirming ? 'Confirming Payment...' : booking.status === 'cancelled' ? 'Booking Cancelled' : isConfirmed ? 'Booking Confirmed!' : 'Booking Received'}
          </h1>
          <p className="text-gray-600">
            Reference: <span className="text-gr8-orange font-mono font-bold">{booking.reference}</span>
          </p>
        </div>

        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 mb-8 text-left">
          <div className="flex items-center gap-3 mb-4">
            {room && <div className="w-4 h-4 rounded-full" style={{ backgroundColor: room.color }} />}
            <span className="text-lg font-bold text-gray-900">{room?.name || branding.resource_label}</span>
          </div>
          <div className="space-y-3 text-sm">
            {timeSlot && (
              <div className="flex items-center gap-3 text-gray-600">
                <Calendar size={16} className="text-gray-500" />
                <span className="text-gray-900">
                  {format(new Date(timeSlot.date), 'EEEE, MMMM d, yyyy')} • {timeSlot.start_time} — {timeSlot.end_time}
                </span>
              </div>
            )}
            <div className="flex items-center gap-3 text-gray-600">
              <Clock size={16} className="text-gray-500" />
              <span className="text-gray-900">{room?.duration_minutes || 60} minutes</span>
            </div>
            <div className="flex items-center gap-3 text-gray-600">
              <Users size={16} className="text-gray-500" />
              <span className="text-gray-900">{booking.player_count} players</span>
            </div>
            <div className="flex items-center gap-3 text-gray-600">
              <span className="text-gray-500">👤</span>
              <span className="text-gray-900">{booking.customer_name} ({booking.customer_email})</span>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between">
            <span className="text-gray-600">Total</span>
            <span className="text-gr8-orange font-bold text-lg">R{booking.total_amount}</span>
          </div>
        </div>

        {!isConfirmed && !confirming && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-8 text-sm text-left">
            <p className="text-orange-700 font-bold mb-1">Payment Pending</p>
            <p className="text-orange-700">Your booking has been saved. We'll confirm once payment is received.</p>
          </div>
        )}

        {/* Share Waiver Link */}
        <div className="bg-[#1e1e1e] border border-gr8-red/30 rounded-xl p-6 mb-8 text-left">
          <div className="flex items-center gap-3 mb-3">
            <Shield size={20} className="text-gr8-orange" />
            <h3 className="text-lg font-bold text-white">Player Waiver</h3>
          </div>
          <p className="text-sm text-gray-400 mb-4">
            All players must sign an indemnity waiver before the game. Share this link with your group:
          </p>
          <div className="flex items-center gap-2 bg-white/5 border border-gray-700 rounded-lg p-3">
            <input
              readOnly
              value={`${window.location.origin}/waiver/${booking.reference}`}
              className="flex-1 bg-transparent text-sm text-gray-300 font-mono outline-none"
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/waiver/${booking.reference}`)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gr8-red/20 text-gr8-orange text-sm font-medium hover:bg-gr8-red/30 transition-colors"
            >
              {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            Each player should open this link and sign before arriving. Waivers are also available at reception.
          </p>
        </div>

        {/* Calendar download */}
        <button onClick={downloadICS} className="w-full bg-white/5 border border-gray-700/50 rounded-xl p-4 mb-6 text-left hover:bg-white/10 transition-colors flex items-center gap-3">
          <Download size={20} className="text-gr8-orange" />
          <div>
            <p className="text-white font-medium text-sm">Add to Calendar</p>
            <p className="text-xs text-gray-500">Download .ics file for Google Calendar, Apple Calendar, Outlook</p>
          </div>
        </button>

        <div className="bg-white/5 border border-gray-700/50 rounded-xl p-4 mb-8 text-sm text-gray-400 text-left">
          <p className="mb-2">A confirmation email will be sent to <strong className="text-white">{booking.customer_email}</strong></p>
          <p>Please arrive <strong className="text-white">15 minutes early</strong>. No phones or recording devices allowed in the rooms.</p>
        </div>

        {/* Cancel Booking */}
        {(booking.status === 'pending' || booking.status === 'confirmed') && (
          <div className="border border-red-500/30 bg-red-500/5 rounded-xl p-6 mb-8 text-left">
            <div className="flex items-center gap-3 mb-3">
              <XCircle size={20} className="text-red-400" />
              <h3 className="text-lg font-bold text-white">Cancel Booking</h3>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              Free cancellation up to {cancelHoursBefore} hours before your game. A R{cancelAdminFee} admin fee applies on deposits.
            </p>
            <button
              onClick={() => setShowCancelDialog(true)}
              className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 text-sm font-bold hover:bg-red-500/30 transition-colors"
            >
              Cancel Booking
            </button>
          </div>
        )}

        {/* Cancelled message */}
        {booking.status === 'cancelled' && (
          <div className="border border-orange-500/30 bg-orange-500/5 rounded-xl p-6 mb-8 text-left">
            <div className="flex items-center gap-3 mb-3">
              <XCircle size={20} className="text-orange-400" />
              <h3 className="text-lg font-bold text-white">Booking Cancelled</h3>
            </div>
            <p className="text-sm text-gray-400">
              Your booking has been cancelled. Refunds, if applicable, will be processed within 5-7 business days.
            </p>
          </div>
        )}

        {/* Cancel Confirmation Dialog */}
        {showCancelDialog && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-[#1e1e1e] border border-gray-700 rounded-xl p-6 max-w-md w-full">
              <h3 className="text-lg font-bold text-white mb-2">Cancel Booking?</h3>
              <p className="text-sm text-gray-400 mb-4">
                Are you sure you want to cancel your booking{room ? ` for ${room.name}` : ''}?
                {booking.payment_type === 'deposit' && booking.deposit_amount > 0 && (
                  <> If you paid a deposit, R{Math.max(0, Number(booking.deposit_amount) - Number(cancelAdminFee))} will be refunded within 5-7 business days.</>
                )}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCancelDialog(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-gray-400 text-sm font-medium hover:text-white hover:border-gray-500 transition-colors"
                  disabled={cancelling}
                >
                  Keep Booking
                </button>
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="flex-1 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 text-sm font-bold hover:bg-red-500/30 transition-colors disabled:opacity-50"
                >
                  {cancelling ? 'Cancelling...' : 'Yes, Cancel'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a href="https://gr8.smartintegrate.co.za" className="btn-gr8 px-8 py-3 flex items-center justify-center gap-2">
            <Home size={18} /> Back to Site
          </a>
          <Link to="/book" className="px-8 py-3 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors flex items-center justify-center gap-2">
            Book Another {branding.resource_label}
          </Link>
        </div>
      </div>
    </div>
  )
}
