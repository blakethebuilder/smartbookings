import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Calendar, Users, Clock, ChevronRight, CreditCard, Loader2, CheckCircle } from 'lucide-react'
import { format, addDays, isSameDay, parseISO } from 'date-fns'
import pb, { type Room, type TimeSlot } from '../lib/pocketbase'
import { md5 } from '../lib/md5'
import { toast } from 'sonner'
import { useBranding } from '../lib/branding'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Step = 'rooms' | 'date' | 'slot' | 'details' | 'payment' | 'confirm'

interface FormData {
  room: Room | null
  date: Date | null
  slot: TimeSlot | null
  playerName: string
  playerEmail: string
  playerPhone: string
  playerCount: number
  paymentType: 'deposit' | 'full'
}

const steps = [
  { key: 'rooms', label: 'Select', icon: Calendar },
  { key: 'date', label: 'Date', icon: Calendar },
  { key: 'slot', label: 'Time', icon: Clock },
  { key: 'details', label: 'Details', icon: Users },
  { key: 'payment', label: 'Confirm', icon: CreditCard },
]

export default function Book() {
  const { branding } = useBranding()
  const [searchParams] = useSearchParams()
  const [step, setStep] = useState<Step>('rooms')
  const [rooms, setRooms] = useState<Room[]>([])
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [payfastConfigured, setPayfastConfigured] = useState<boolean | null>(null)
  const [formData, setFormData] = useState<FormData>({
    room: null,
    date: null,
    slot: null,
    playerName: '',
    playerEmail: '',
    playerPhone: '',
    playerCount: 2,
    paymentType: 'deposit',
  })

  // Read URL params from availability page
  const paramRoom = searchParams.get('room')
  const paramDate = searchParams.get('date')
  const paramTime = searchParams.get('time')

  // Load rooms and check Payfast config
  useEffect(() => {
    Promise.all([
      pb.collection('rooms').getFullList<Room>({
        sort: 'sort_order',
        filter: 'is_active = true',
      }),
      pb.collection('settings').getFullList(),
    ]).then(([roomsData, settings]) => {
      setRooms(roomsData)
      const merchantId = settings.find(s => s.key === 'payfast_merchant_id')?.value
      setPayfastConfigured(!!merchantId)
      setLoading(false)
    }).catch(err => {
      console.error('[Book] Failed to load:', err)
      setPayfastConfigured(false)
      setLoading(false)
    })
  }, [])

  // Auto-select from URL params once rooms are loaded
  useEffect(() => {
    if (loading || rooms.length === 0) return
    if (!paramRoom) return

    const matchedRoom = rooms.find(r => r.slug === paramRoom)
    if (!matchedRoom) return

    setFormData(prev => ({ ...prev, room: matchedRoom }))

    if (paramDate && paramTime) {
      // Full auto-select: room + date + time → jump to details
      const dateObj = parseISO(paramDate)
      setFormData(prev => ({ ...prev, room: matchedRoom, date: dateObj }))
      setStep('slot')

      pb.collection('time_slots').getFullList<TimeSlot>({
        filter: `room = "${matchedRoom.id}" && date~"${paramDate}" && status = "available"`,
        sort: 'start_time',
      }).then(slotsData => {
        setSlots(slotsData)
        const matchedSlot = slotsData.find(s => s.start_time === paramTime)
        if (matchedSlot) {
          setFormData(prev => ({ ...prev, slot: matchedSlot }))
          setStep('details')
        }
      })
    } else {
      // Room only → skip to date selection
      setStep('date')
    }
  }, [rooms, loading, paramRoom, paramDate, paramTime])

  // Load slots when room + date selected
  useEffect(() => {
    if (!formData.room || !formData.date) return
    pb.collection('time_slots').getFullList<TimeSlot>({
      filter: `room = "${formData.room.id}" && date~"${format(formData.date, 'yyyy-MM-dd')}" && status = "available"`,
      sort: 'start_time',
    }).then(setSlots).catch(err => {
      console.error('[Book] Failed to load slots:', err)
    })
  }, [formData.room, formData.date])

  const selectRoom = (room: Room) => {
    setFormData(prev => ({ ...prev, room, date: null, slot: null }))
    setStep('date')
  }

  const selectDate = (date: Date) => {
    setFormData(prev => ({ ...prev, date, slot: null }))
    setStep('slot')
  }

  const selectSlot = (slot: TimeSlot) => {
    setFormData(prev => ({ ...prev, slot }))
    setStep('details')
  }

  // Calculate amounts based on payment type
  const fullAmount = formData.room ? formData.playerCount * formData.room.unit_price : 0
  const depositAmount = formData.room ? Math.min(formData.room.min_capacity * formData.room.unit_price, fullAmount) : 0
  const amountToPay = formData.paymentType === 'deposit' ? Math.min(depositAmount, fullAmount) : fullAmount
  const balanceDue = fullAmount - amountToPay

  const handleBooking = async () => {
    if (!formData.room || !formData.slot || !formData.playerName || !formData.playerEmail) return
    setSubmitting(true)

    try {
      const reference = `SB-${Date.now().toString(36).toUpperCase()}`

      // Check if Payfast is configured
      const settings = await pb.collection('settings').getFullList()
      const get = (key: string) => settings.find(s => s.key === key)?.value || ''
      const merchantId = get('payfast_merchant_id')
      const isDemo = !merchantId

      // Create booking
      const booking = await pb.collection('bookings').create({
        reference,
        time_slot: formData.slot.id,
        room: formData.room.id,
        customer_name: formData.playerName,
        customer_email: formData.playerEmail,
        customer_phone: formData.playerPhone,
        party_size: formData.playerCount,
        unit_price: formData.room.unit_price,
        total_amount: fullAmount,
        deposit_amount: amountToPay,
        balance_due: balanceDue,
        payment_type: formData.paymentType,
        currency: formData.room.currency,
        status: isDemo ? 'confirmed' : 'pending',
        payment_status: isDemo ? 'paid' : 'unpaid',
      })

      // Mark slot as reserved/full
      await pb.collection('time_slots').update(formData.slot.id, { status: isDemo ? 'full' : 'reserved' })

      // Send WhatsApp confirmation if phone provided
      if (formData.playerPhone) {
        fetch('/api/whatsapp/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reference,
            customer_name: formData.playerName,
            customer_phone: formData.playerPhone,
            party_size: formData.playerCount,
            room_name: formData.room.name,
            date: formData.date && format(formData.date, 'EEEE, MMMM d'),
            time: `${formData.slot.start_time} — ${formData.slot.end_time}`,
            venue_name: branding.business_name,
          }),
        }).catch(() => {})
      }

      if (isDemo) {
        // Demo mode — skip Payfast, go straight to confirmation
        window.location.href = `/book/confirm/${reference}`
      } else {
        // Build Payfast form and submit
        const merchantKey = get('payfast_merchant_key')
        const passphrase = get('payfast_passphrase')
        const mode = get('payfast_mode')
        const processUrl = mode === 'live'
          ? 'https://www.payfast.co.za/eng/process'
          : 'https://sandbox.payfast.co.za/eng/process'

        // Build params for signature generation (alphabetical order, exclude passphrase & signature)
        const paramPairs: [string, string][] = [
          ['merchant_id', merchantId],
          ['merchant_key', merchantKey],
          ['return_url', `${window.location.origin}/book/confirm/${reference}`],
          ['cancel_url', `${window.location.origin}/book`],
          ['notify_url', `${window.location.origin}/api/payfast/itn`],
          ['name_first', formData.playerName.split(' ')[0] || ''],
          ['name_last', formData.playerName.split(' ').slice(1).join(' ') || ''],
          ['email_address', formData.playerEmail],
          ['m_payment_id', reference],
          ['amount', amountToPay.toFixed(2)],
          ['item_name', `${branding.resource_label} - ${formData.room.name}`],
          ['item_description', `Booking ${reference} - ${formData.playerCount} players`],
          ['custom_str1', booking.id],
          ['custom_str2', reference],
        ]

        // Generate signature: sort non-empty params, encode, ALWAYS append passphrase, MD5
        const sorted = paramPairs.filter(([, v]) => v !== '').sort((a, b) => a[0].localeCompare(b[0]))
        let signatureString = sorted.map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%20/g, '+')}`).join('&')
        // Payfast always expects &passphrase= (even if empty)
        signatureString += `&passphrase=${encodeURIComponent(passphrase || '').replace(/%20/g, '+')}`

        // Build hidden form
        const form = document.createElement('form')
        form.method = 'POST'
        form.action = processUrl
        form.style.display = 'none'

        // Generate signature
        const signature = generateMD5(signatureString)

        // Add all params as hidden inputs
        for (const [key, value] of sorted) {
          const input = document.createElement('input')
          input.type = 'hidden'
          input.name = key
          input.value = value
          form.appendChild(input)
        }

        // Add signature
        const sigInput = document.createElement('input')
        sigInput.type = 'hidden'
        sigInput.name = 'signature'
        sigInput.value = signature
        form.appendChild(sigInput)

        document.body.appendChild(form)
        form.submit()
      }
    } catch (e) {
      console.error('Booking failed:', e)
      toast.error('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // MD5 signature for Payfast
  const generateMD5 = (str: string): string => md5(str)

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-sb-orange" size={32} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm py-4 px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <a href="#" onClick={(e) => { e.preventDefault(); window.history.back(); }} className="text-xl font-bold text-gray-900 tracking-tight">
            {branding.business_name}
          </a>
          <a href="#" onClick={(e) => { e.preventDefault(); window.history.back(); }} className="text-sm text-gray-500 hover:text-sb-orange transition-colors">
            ← Back to site
          </a>
        </div>
      </header>

      {/* Progress bar */}
      <div className="bg-white border-b border-gray-200 py-4 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between">
            {steps.map((s, i) => {
              const Icon = s.icon
              const currentIdx = steps.findIndex(st => st.key === step)
              const isActive = i === currentIdx
              const isComplete = i < currentIdx
              return (
                <div key={s.key} className="flex items-center">
                  <div className={`flex items-center gap-2 ${isActive ? 'text-sb-orange' : isComplete ? 'text-green-500' : 'text-gray-400'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                      isActive ? 'bg-sb-orange text-white' : isComplete ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {isComplete ? '✓' : i + 1}
                    </div>
                    <span className="text-xs font-medium hidden sm:block">{s.label}</span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`w-8 h-px mx-2 ${i < currentIdx ? 'bg-green-300' : 'bg-gray-200'}`} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">

        {/* Step: Choose Room */}
        {step === 'rooms' && (
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Select a {branding.resource_label}</h1>
            <p className="text-gray-500 mb-8">Choose from available options below.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {rooms.map(room => (
                <button
                  key={room.id}
                  onClick={() => selectRoom(room)}
                  className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden text-left hover:border-sb-orange hover:shadow-md transition-all group"
                >
                  {room.image ? (
                    <div className="h-40 bg-cover bg-center" style={{ backgroundImage: `url(${pb.files.getUrl(room, room.image)})` }} />
                  ) : (
                    <div className="h-24 flex items-center justify-center" style={{ backgroundColor: room.color + '18' }}>
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: room.color }} />
                    </div>
                  )}
                  <div className="p-5">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1 group-hover:text-sb-orange transition-colors">
                      {room.name}
                    </h3>
                    <p className="text-sm text-gray-500 mb-4 line-clamp-2">{room.description || 'No description'}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><Clock size={12} /> {room.duration_minutes}min</span>
                        {branding.show_player_count && (
                          <span className="flex items-center gap-1"><Users size={12} /> {room.min_capacity}–{room.max_capacity}</span>
                        )}
                      </div>
                      <span className="text-sb-orange font-bold text-sm">
                        R{room.unit_price}{branding.pricing_model === 'per_person' ? '/person' : ''}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step: Pick Date */}
        {step === 'date' && formData.room && (
          <div>
            <button onClick={() => setStep('rooms')} className="text-sm text-gray-500 hover:text-sb-orange mb-4 flex items-center gap-1">
              ← Back to {branding.resource_label_plural.toLowerCase()}
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Select a Date</h1>
            <p className="text-gray-500 mb-8">
              <span className="font-medium" style={{ color: formData.room.color }}>{formData.room.name}</span> — Choose your preferred date.
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3">
              {Array.from({ length: 14 }, (_, i) => addDays(new Date(), i + 1)).map(date => {
                const dayOfWeek = date.getDay()
                const isBusinessDay = true // All 7 days open
                return (
                  <button
                    key={date.toISOString()}
                    onClick={() => isBusinessDay && selectDate(date)}
                    disabled={!isBusinessDay}
                    className={`p-3 rounded-xl text-center transition-all ${
                      isBusinessDay
                        ? 'bg-white border border-gray-200 hover:border-sb-orange cursor-pointer'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <p className="text-[10px] text-gray-500 uppercase">{format(date, 'EEE')}</p>
                    <p className="text-lg font-bold text-gray-900">{format(date, 'd')}</p>
                    <p className="text-[10px] text-gray-500">{format(date, 'MMM')}</p>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Step: Pick Time */}
        {step === 'slot' && formData.room && formData.date && (
          <div>
            <button onClick={() => setStep('date')} className="text-sm text-gray-500 hover:text-sb-orange mb-4 flex items-center gap-1">
              ← Back to dates
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Select a Time</h1>
            <p className="text-gray-600 mb-8">
              <span className="font-medium" style={{ color: formData.room.color }}>{formData.room.name}</span> — {format(formData.date, 'EEEE, MMMM d')}
            </p>
            {slots.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-gray-600 text-lg">No available slots for this date.</p>
                <button onClick={() => setStep('date')} className="mt-4 text-sb-orange hover:underline">
                  Try another date
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {slots.map(slot => (
                  <button
                    key={slot.id}
                    onClick={() => selectSlot(slot)}
                    className="bg-white border border-gray-200 rounded-xl p-4 text-center hover:border-sb-orange transition-all"
                  >
                    <p className="text-xl font-bold text-gray-900">{slot.start_time}</p>
                    <p className="text-xs text-gray-600 mt-1">{slot.end_time}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step: Your Details */}
        {step === 'details' && formData.room && formData.slot && (
          <div>
            <button onClick={() => setStep('slot')} className="text-sm text-gray-500 hover:text-sb-orange mb-4 flex items-center gap-1">
              ← Back to times
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Your Details</h1>
            <p className="text-gray-500 mb-8">Enter your contact information to complete the booking.</p>

            {/* Booking summary */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-8">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: formData.room.color }} />
                <span className="font-bold text-gray-900">{formData.room.name}</span>
              </div>
              <p className="text-gray-600 text-sm">
                {formData.date && format(formData.date, 'EEEE, MMMM d')} • {formData.slot.start_time} — {formData.slot.end_time}
              </p>
            </div>

            <div className="max-w-md space-y-5">
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Full Name *</label>
                <Input
                  type="text"
                  value={formData.playerName}
                  onChange={e => setFormData(prev => ({ ...prev, playerName: e.target.value.trim() }))}
                  className="w-full"
                  placeholder="John Smith"
                  minLength={2}
                  maxLength={100}
                  required
                />
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Email *</label>
                <Input
                  type="email"
                  value={formData.playerEmail}
                  onChange={e => setFormData(prev => ({ ...prev, playerEmail: e.target.value.trim() }))}
                  className="w-full"
                  placeholder="john@example.com"
                  maxLength={254}
                  required
                />
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Phone (optional)</label>
                <Input
                  type="tel"
                  value={formData.playerPhone}
                  onChange={e => setFormData(prev => ({ ...prev, playerPhone: e.target.value }))}
                  className="w-full"
                  placeholder="076 362 0765"
                />
              </div>
              {branding.show_player_count && (
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Party Size</label>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setFormData(prev => ({ ...prev, playerCount: Math.max(formData.room!.min_capacity, prev.playerCount - 1) }))}
                    className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-300 text-gray-900 font-bold hover:bg-gray-100 transition-colors"
                  >
                    −
                  </button>
                  <span className="text-2xl font-bold text-gray-900 w-12 text-center">{formData.playerCount}</span>
                  <button
                    onClick={() => setFormData(prev => ({ ...prev, playerCount: Math.min(formData.room!.max_capacity, prev.playerCount + 1) }))}
                    className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-300 text-gray-900 font-bold hover:bg-gray-100 transition-colors"
                  >
                    +
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">{formData.room.min_capacity}–{formData.room.max_capacity} people max</p>
              </div>
              )}

              {/* Price summary */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>{formData.playerCount} × R{formData.room.unit_price}</span>
                  <span>R{formData.playerCount * formData.room.unit_price}</span>
                </div>
                <div className="flex justify-between font-bold text-gray-900 text-lg pt-2 border-t border-gray-200">
                  <span>Total</span>
                  <span className="text-sb-orange">R{formData.playerCount * formData.room.unit_price}</span>
                </div>
              </div>

              <Button
                onClick={() => {
                  if (formData.playerName && formData.playerEmail) setStep('payment')
                }}
                disabled={!formData.playerName || !formData.playerEmail}
                className="w-full"
                size="lg"
              >
                {branding.booking_verb}
                <ChevronRight size={20} />
              </Button>
            </div>
          </div>
        )}

        {/* Step: Payment */}
        {step === 'payment' && formData.room && formData.slot && (
          <div>
            <button onClick={() => setStep('details')} className="text-sm text-gray-500 hover:text-sb-orange mb-4 flex items-center gap-1">
              ← Back to details
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Confirm & Pay</h1>
            <p className="text-gray-500 mb-8">Review your booking details and choose a payment option.</p>

            <div className="max-w-lg">
              {/* Booking summary */}
              <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-5 h-5 rounded-full" style={{ backgroundColor: formData.room.color }} />
                  <span className="text-lg font-bold text-gray-900">{formData.room.name}</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Date</span>
                    <span className="text-gray-900">{formData.date && format(formData.date, 'EEEE, MMMM d, yyyy')}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Time</span>
                    <span className="text-gray-900">{formData.slot.start_time} — {formData.slot.end_time}</span>
                  </div>
                  {branding.show_player_count && (
                  <div className="flex justify-between text-gray-600">
                    <span>Party size</span>
                    <span className="text-gray-900">{formData.playerCount} × R{formData.room.unit_price}</span>
                  </div>
                  )}
                  <div className="flex justify-between text-gray-600">
                    <span>Name</span>
                    <span className="text-gray-900">{formData.playerName}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Email</span>
                    <span className="text-gray-900">{formData.playerEmail}</span>
                  </div>
                </div>
              </div>

              {/* Payment option selector */}
              <div className="mb-6">
                <label className="text-sm text-gray-600 mb-2 block font-medium">Payment Option</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setFormData(prev => ({ ...prev, paymentType: 'deposit' }))}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      formData.paymentType === 'deposit'
                        ? 'border-sb-orange bg-orange-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <p className="text-gray-900 font-bold mb-1">Deposit</p>
                    <p className="text-2xl font-black text-sb-orange">R{depositAmount}</p>
                    <p className="text-xs text-gray-500 mt-1">Covers {formData.room.min_capacity} {formData.room.min_capacity !== 1 ? 'people' : 'person'}. R{balanceDue} due on arrival.</p>
                  </button>
                  <button
                    onClick={() => setFormData(prev => ({ ...prev, paymentType: 'full' }))}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      formData.paymentType === 'full'
                        ? 'border-sb-orange bg-orange-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <p className="text-gray-900 font-bold mb-1">Pay Full</p>
                    <p className="text-2xl font-black text-sb-orange">R{fullAmount}</p>
                    <p className="text-xs text-gray-500 mt-1">Full payment upfront — no balance on arrival.</p>
                  </button>
                </div>
              </div>

              {/* Price breakdown */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Full amount ({formData.playerCount} × R{formData.room.unit_price})</span>
                    <span className="text-gray-900">R{fullAmount}</span>
                  </div>
                  <div className="flex justify-between text-sb-orange font-bold">
                    <span>Pay now</span>
                    <span>R{amountToPay}</span>
                  </div>
                  {balanceDue > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Balance due at venue</span>
                      <span>R{balanceDue}</span>
                    </div>
                  )}
                </div>
              </div>

              {payfastConfigured ? (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6 text-sm text-gray-600">
                  <p>You'll be redirected to Payfast to complete payment securely. After payment, you'll receive a confirmation email with your booking details.</p>
                </div>
              ) : (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6 text-sm">
                  <p className="text-orange-700 font-bold mb-1">Demo Mode</p>
                  <p className="text-orange-700">Payfast not configured. Booking will be confirmed instantly for testing.</p>
                </div>
              )}

              <Button
                onClick={handleBooking}
                disabled={submitting}
                className="w-full"
                size="lg"
              >
                {submitting ? (
                  <><Loader2 className="animate-spin" /> Processing...</>
                ) : payfastConfigured ? (
                  <><CreditCard size={20} /> Pay R{amountToPay} via Payfast</>
                ) : (
                  <><CheckCircle size={20} /> Confirm Booking (Demo)</>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
