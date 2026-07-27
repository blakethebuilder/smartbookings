import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { CheckCircle, Calendar, Clock, Users, Home, AlertCircle, Loader2, Copy, Check, Shield, Download, XCircle } from 'lucide-react'
import { format } from 'date-fns'
import pb, { type Booking, type Room, type TimeSlot } from '../lib/pocketbase'
import { useBranding } from '../lib/branding'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

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
        <Loader2 className="animate-spin text-sb-orange" size={32} />
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Booking not found</h1>
          <p className="text-gray-600 mb-6">Reference "{reference}" doesn't match any booking.</p>
          <Button asChild>
            <a href="#" onClick={(e) => { e.preventDefault(); window.history.back(); }}>Go to Website</a>
          </Button>
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
      `DESCRIPTION:${branding.business_name} - ${room.name}\\nBooking: ${booking.reference}\\nPlayers: ${booking.party_size}\\nPlease arrive on time for your booking.`,
      `LOCATION:${branding.business_name}`,
      `STATUS:CONFIRMED`,
      `END:VEVENT`,
      'END:VCALENDAR',
    ].join('\r\n')

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `booking-${room.name.toLowerCase().replace(/\s+/g, '-')}.ics`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm py-4 px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <a href="#" onClick={(e) => { e.preventDefault(); window.history.back(); }} className="text-xl font-bold text-gray-900 tracking-tight">
            {branding.business_name}
          </a>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 sm:py-16 text-center">
        <div className="mb-8">
          {confirming ? (
            <Loader2 size={64} className="text-sb-orange mx-auto mb-4 animate-spin" />
          ) : booking.status === 'cancelled' ? (
            <XCircle size={64} className="text-red-400 mx-auto mb-4" />
          ) : isConfirmed ? (
            <CheckCircle size={64} className="text-green-400 mx-auto mb-4" />
          ) : (
            <AlertCircle size={64} className="text-yellow-400 mx-auto mb-4" />
          )}

          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            {confirming ? 'Confirming Payment...' : booking.status === 'cancelled' ? 'Booking Cancelled' : isConfirmed ? 'Booking Confirmed!' : 'Booking Received'}
          </h1>
          <p className="text-gray-600">
            Reference: <span className="text-sb-orange font-mono font-bold">{booking.reference}</span>
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
              <span className="text-gray-900">{booking.party_size} players</span>
            </div>
            <div className="flex items-center gap-3 text-gray-600">
              <span className="text-gray-500">👤</span>
              <span className="text-gray-900">{booking.customer_name} ({booking.customer_email})</span>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between">
            <span className="text-gray-600">Total</span>
            <span className="text-sb-orange font-bold text-lg">R{booking.total_amount}</span>
          </div>
        </div>

        {!isConfirmed && !confirming && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-8 text-sm text-left">
            <p className="text-orange-700 font-bold mb-1">Payment Pending</p>
            <p className="text-orange-700">Your booking has been saved. We'll confirm once payment is received.</p>
          </div>
        )}

        {/* Share Waiver Link */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 mb-8 text-left">
          <div className="flex items-center gap-3 mb-3">
            <Shield size={20} className="text-sb-orange" />
            <h3 className="text-lg font-bold text-gray-900">Player Waiver</h3>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            All players must sign an indemnity waiver before the game. Share this link with your group:
          </p>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-300 rounded-lg p-3">
            <Input
              readOnly
              value={`${window.location.origin}/waiver/${booking.reference}`}
              className="flex-1 font-mono bg-transparent"
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/waiver/${booking.reference}`)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-orange-50 text-sb-orange text-sm font-medium hover:bg-orange-100 transition-colors"
            >
              {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            Each player should open this link and sign before arriving. Waivers are also available at reception.
          </p>
        </div>

        {/* Calendar download */}
        <button onClick={downloadICS} className="w-full bg-white border border-gray-200 shadow-sm rounded-xl p-4 mb-6 text-left hover:bg-gray-50 transition-colors flex items-center gap-3">
          <Download size={20} className="text-sb-orange" />
          <div>
            <p className="text-gray-900 font-medium text-sm">Add to Calendar</p>
            <p className="text-xs text-gray-600">Download .ics file for Google Calendar, Apple Calendar, Outlook</p>
          </div>
        </button>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-8 text-sm text-gray-600 text-left">
          <p className="mb-2">A confirmation email will be sent to <strong className="text-gray-900">{booking.customer_email}</strong></p>
          <p>Please arrive <strong className="text-gray-900">15 minutes early</strong>. Please follow venue guidelines during your visit.</p>
        </div>

        {/* Cancel Booking */}
        {(booking.status === 'pending' || booking.status === 'confirmed') && (
          <div className="border border-red-200 bg-red-50 rounded-xl p-6 mb-8 text-left">
            <div className="flex items-center gap-3 mb-3">
              <XCircle size={20} className="text-red-500" />
              <h3 className="text-lg font-bold text-gray-900">Cancel Booking</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Free cancellation up to {cancelHoursBefore} hours before your game. A R{cancelAdminFee} admin fee applies on deposits.
            </p>
            <button
              onClick={() => setShowCancelDialog(true)}
              className="px-4 py-2 rounded-lg bg-red-100 text-red-600 text-sm font-bold hover:bg-red-200 transition-colors"
            >
              Cancel Booking
            </button>
          </div>
        )}

        {/* Cancelled message */}
        {booking.status === 'cancelled' && (
          <div className="border border-orange-200 bg-orange-50 rounded-xl p-6 mb-8 text-left">
            <div className="flex items-center gap-3 mb-3">
              <XCircle size={20} className="text-orange-500" />
              <h3 className="text-lg font-bold text-gray-900">Booking Cancelled</h3>
            </div>
            <p className="text-sm text-gray-600">
              Your booking has been cancelled. Refunds, if applicable, will be processed within 5-7 business days.
            </p>
          </div>
        )}

        {/* Cancel Confirmation Dialog */}
        <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Cancel Booking?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to cancel your booking{room ? ` for ${room.name}` : ''}?
              {booking.payment_type === 'deposit' && booking.deposit_amount > 0 && (
                <> If you paid a deposit, R{Math.max(0, Number(booking.deposit_amount) - Number(cancelAdminFee))} will be refunded within 5-7 business days.</>
              )}
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCancelDialog(false)} disabled={cancelling}>
                Keep Booking
              </Button>
              <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
                {cancelling ? 'Cancelling...' : 'Yes, Cancel'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild>
            <a href="#" onClick={(e) => { e.preventDefault(); window.history.back(); }}>
              <Home size={18} /> Back to Site
            </a>
          </Button>
          <Link to="/book" className="px-8 py-3 rounded-lg border border-gray-200 text-gray-600 hover:text-sb-orange hover:border-sb-orange transition-colors flex items-center justify-center gap-2">
            Book Another {branding.resource_label}
          </Link>
        </div>
      </div>
    </div>
  )
}
