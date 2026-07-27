import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { AlertCircle, CheckCircle, Shield, Loader2, Info } from 'lucide-react'
import { format } from 'date-fns'
import pb, { type Booking, type Room, type TimeSlot } from '../lib/pocketbase'
import { useBranding } from '../lib/branding'

interface WaiverForm {
  playerName: string
  playerEmail: string
  playerIdNumber: string
  guardianName: string
  guardianIdNumber: string
  isMinor: boolean
  consentMedical: boolean
  consentRules: boolean
  consentPhoto: boolean
}

export default function Waiver() {
  const { branding } = useBranding()
  const { id } = useParams()
  const [booking, setBooking] = useState<Booking | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [timeSlot, setTimeSlot] = useState<TimeSlot | null>(null)
  const [existingWaiver, setExistingWaiver] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const canvasInited = useRef(false)

  const [form, setForm] = useState<WaiverForm>({
    playerName: '',
    playerEmail: '',
    playerIdNumber: '',
    guardianName: '',
    guardianIdNumber: '',
    isMinor: false,
    consentMedical: false,
    consentRules: false,
    consentPhoto: false,
  })

  // Load booking
  useEffect(() => {
    if (!id) return
    pb.collection('bookings').getFirstListItem<Booking>(
      `reference = "${id}" || id = "${id}"`,
      { expand: 'room,time_slot' },
    ).then(async b => {
      setBooking(b)
      if (b.expand?.room) setRoom(b.expand.room as Room)
      if (b.expand?.time_slot) setTimeSlot(b.expand.time_slot as TimeSlot)

      // Pre-fill form from booking
      setForm(prev => ({
        ...prev,
        playerName: b.customer_name,
        playerEmail: b.customer_email,
      }))

      // Check if waiver already exists
      try {
        const existing = await pb.collection('waivers').getFirstListItem(
          `booking = "${b.id}"`,
        )
        if (existing) setExistingWaiver(true)
      } catch {
        // No existing waiver — good
      }

      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id])

  // Canvas drawing
  useEffect(() => {
    if (loading) return

    const timer = requestAnimationFrame(() => {
      const canvas = canvasRef.current
      if (!canvas || canvasInited.current) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Set canvas size with fallback
      const width = canvas.offsetWidth || 600
      const height = canvas.offsetHeight || 120
      canvas.width = width
      canvas.height = height

      // Light background
      ctx.fillStyle = '#F3F4F6'
      ctx.fillRect(0, 0, width, height)

      // Guide line
      ctx.strokeStyle = '#9CA3AF'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(20, height - 30)
      ctx.lineTo(width - 20, height - 30)
      ctx.stroke()

      ctx.fillStyle = '#9CA3AF'
      ctx.font = '11px sans-serif'
      ctx.fillText('Sign here', 20, height - 10)

      canvasInited.current = true
    })

    return () => cancelAnimationFrame(timer)
  }, [loading])

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true)
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left
    const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top

    ctx.strokeStyle = '#111827'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left
    const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top

    ctx.lineTo(x, y)
    ctx.stroke()
    setHasSignature(true)
  }

  const endDraw = () => setIsDrawing(false)

  const clearSignature = () => {
    canvasInited.current = false
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#F3F4F6'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#9CA3AF'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(20, canvas.height - 30)
    ctx.lineTo(canvas.width - 20, canvas.height - 30)
    ctx.stroke()
    ctx.fillStyle = '#9CA3AF'
    ctx.font = '11px sans-serif'
    ctx.fillText('Sign here', 20, canvas.height - 10)
    setHasSignature(false)
  }

  const handleSubmit = async () => {
    if (!booking || !hasSignature) return

    // Validate
    if (!form.consentMedical || !form.consentRules) {
      setError('You must agree to the medical and rules consents.')
      return
    }

    if (form.isMinor && !form.guardianName) {
      setError('Guardian name is required for players under 16.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const canvas = canvasRef.current!
      const signatureData = canvas.toDataURL('image/png')

      await pb.collection('waivers').create({
        booking: booking.id,
        player_name: form.playerName,
        player_email: form.playerEmail,
        player_id_number: form.playerIdNumber,
        guardian_name: form.guardianName,
        guardian_id_number: form.guardianIdNumber,
        is_minor: form.isMinor,
        consent_medical: form.consentMedical,
        consent_rules: form.consentRules,
        consent_photo: form.consentPhoto,
        signature_data: signatureData,
        signed_at: new Date().toISOString(),
        status: 'signed',
      })

      // Update booking waiver status
      await pb.collection('bookings').update(booking.id, {
        waiver_signed: true,
        waiver_url: window.location.href,
      })

      setSubmitted(true)
    } catch (e: any) {
      console.error('Waiver submit failed:', e)
      setError(e?.message || 'Failed to submit waiver. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

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
        <div className="text-center max-w-md px-6">
          <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Booking not found</h1>
          <p className="text-gray-600">This waiver link is invalid or has expired.</p>
        </div>
      </div>
    )
  }

  if (existingWaiver || submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <CheckCircle size={64} className="text-green-400 mx-auto mb-4" />
          <h1 className="text-3xl font-black text-gray-900 mb-2">Waiver Signed!</h1>
          <p className="text-gray-600 mb-6">
            You're all set for <span className="text-gray-900 font-bold">{room?.name}</span> on{' '}
            {timeSlot && format(new Date(timeSlot.date), 'EEEE, MMMM d')}.
          </p>
          <p className="text-sm text-gray-600">
            Please arrive 15 minutes early. No phones or recording devices allowed in the rooms.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm py-4 px-6">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Shield size={24} className="text-gr8-orange" />
          <div>
            <h1 className="text-lg font-bold text-gray-900">Player Indemnity Waiver</h1>
            <p className="text-xs text-gray-600">{branding.business_name} — Fourways, Johannesburg</p>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Booking info */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-4 mb-8 flex items-center gap-4">
          {room && <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: room.color }} />}
          <div>
            <p className="text-gray-900 font-bold">{room?.name}</p>
            <p className="text-sm text-gray-600">
              {timeSlot && format(new Date(timeSlot.date), 'EEEE, MMMM d')} • {timeSlot?.start_time} — {timeSlot?.end_time}
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-gray-600">Booking</p>
            <p className="text-sm font-mono text-gr8-orange">{booking.reference}</p>
          </div>
        </div>

        {/* Waiver content */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Assumption of Risk & Indemnity</h2>
          <div className="space-y-4 text-sm text-gray-600 leading-relaxed">
            <p>
              I, the undersigned participant, acknowledge that escape room activities involve physical and mental challenges, and I voluntarily assume all risks associated with participation in escape room games at <strong className="text-gray-900">{branding.business_name}</strong>.
            </p>
            <p>
              I understand that escape rooms may involve confined spaces, low lighting, physical exertion, and mentally stimulating puzzles. I confirm that I am physically and mentally capable of participating.
            </p>
            <p>
              I agree to follow all rules and instructions provided by the {branding.staff_role_worker}, including but not limited to: no use of excessive force, no cell phones or recording devices, and no food or drinks in the game rooms.
            </p>
            <p>
              I hereby release, waive, discharge, and covenant not to sue {branding.business_name}, its owners, employees, and agents from any and all liability, claims, demands, actions, and rights of action arising out of or related to any loss, damage, or injury that may be sustained by me during participation.
            </p>
            <p>
              I understand that photographs or videos may be taken during the experience and grant permission for such media to be used for promotional purposes, unless I indicate otherwise below.
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Your Details</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Full Name *</label>
                <input
                  type="text"
                  value={form.playerName}
                  onChange={e => setForm(prev => ({ ...prev, playerName: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-gr8-orange"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Email *</label>
                <input
                  type="email"
                  value={form.playerEmail}
                  onChange={e => setForm(prev => ({ ...prev, playerEmail: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-gr8-orange"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-600 mb-1 block">ID / Passport Number</label>
                <input
                  type="text"
                  value={form.playerIdNumber}
                  onChange={e => setForm(prev => ({ ...prev, playerIdNumber: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-gr8-orange"
                />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <input
                  type="checkbox"
                  id="isMinor"
                  checked={form.isMinor}
                  onChange={e => setForm(prev => ({ ...prev, isMinor: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 bg-gray-50 text-gr8-orange focus:ring-gr8-orange"
                />
                <label htmlFor="isMinor" className="text-sm text-gray-600">I am under 16 years old</label>
              </div>
            </div>

            {form.isMinor && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Guardian Full Name *</label>
                  <input
                    type="text"
                    value={form.guardianName}
                    onChange={e => setForm(prev => ({ ...prev, guardianName: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-gr8-orange"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Guardian ID Number</label>
                  <input
                    type="text"
                    value={form.guardianIdNumber}
                    onChange={e => setForm(prev => ({ ...prev, guardianIdNumber: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-gr8-orange"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Consents */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Consents</h2>
          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={form.consentMedical}
                onChange={e => setForm(prev => ({ ...prev, consentMedical: e.target.checked }))}
                className="w-4 h-4 mt-0.5 rounded border-gray-300 bg-gray-50 text-gr8-orange focus:ring-gr8-orange"
              />
              <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">
                <strong className="text-gray-900">Medical:</strong> I confirm that I have no medical conditions that would prevent me from safely participating. I will inform the {branding.staff_role_worker} of any relevant conditions before the game. *
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={form.consentRules}
                onChange={e => setForm(prev => ({ ...prev, consentRules: e.target.checked }))}
                className="w-4 h-4 mt-0.5 rounded border-gray-300 bg-gray-50 text-gr8-orange focus:ring-gr8-orange"
              />
              <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">
                <strong className="text-gray-900">Rules:</strong> I agree to follow all rules and instructions from the {branding.staff_role_worker}, including no phones, no excessive force, and no food/drinks in the rooms. *
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={form.consentPhoto}
                onChange={e => setForm(prev => ({ ...prev, consentPhoto: e.target.checked }))}
                className="w-4 h-4 mt-0.5 rounded border-gray-300 bg-gray-50 text-gr8-orange focus:ring-gr8-orange"
              />
              <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">
                <strong className="text-gray-900">Photos/Videos:</strong> I grant permission for photos or videos taken during my experience to be used for promotional purposes. (Optional)
              </span>
            </label>
          </div>
        </div>

        {/* Signature */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Signature</h2>
          <p className="text-sm text-gray-600 mb-4">Sign below with your finger or mouse</p>
          <div className="border border-gray-300 rounded-lg overflow-hidden mb-3">
            <canvas
              ref={canvasRef}
              className="w-full cursor-crosshair touch-none"
              style={{ height: '120px' }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
          </div>
          <button
            onClick={clearSignature}
            className="text-sm text-gray-500 hover:text-gr8-orange transition-colors"
          >
            Clear signature
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting || !hasSignature || !form.consentMedical || !form.consentRules || !form.playerName || !form.playerEmail}
          className="w-full btn-gr8 py-3 sm:py-4 text-base sm:text-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <><Loader2 size={20} className="animate-spin" /> Submitting...</>
          ) : (
            <><Shield size={20} /> Sign & Submit Waiver</>
          )}
        </button>

        <p className="text-center text-xs text-gray-500 mt-4">
          By signing this waiver, you confirm that you have read, understood, and agree to the terms above.
        </p>
      </div>
    </div>
  )
}
