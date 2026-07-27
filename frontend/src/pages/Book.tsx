import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Calendar, Users, Clock, ChevronRight, CreditCard, Loader2, CheckCircle } from 'lucide-react'
import { format, addDays, isSameDay, parseISO } from 'date-fns'
import pb, { type Room, type TimeSlot } from '../lib/pocketbase'
import { md5 } from '../lib/md5'
import { useToast } from '../lib/toast'
import { useBranding } from '../lib/branding'

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
  { key: 'rooms', label: 'Choose Room', icon: Users },
  { key: 'date', label: 'Pick Date', icon: Calendar },
  { key: 'slot', label: 'Pick Time', icon: Clock },
  { key: 'details', label: 'Your Details', icon: Users },
  { key: 'payment', label: 'Payment', icon: CreditCard },
]

const roomEmoji = (slug: string): string => {
  const map: Record<string, string> = {
    asylum: '\u{1F3E5}',
    trapped: '\u{1F525}',
    hunted: '\u{1F3AF}',
    nightmare: '\u{1F631}',
    basement: '\u{1F512}',
    witch: '\u{1F9D9}',
  }
  return map[slug] ?? '\u{1F6AA}'
}

export default function Book() {
  const { branding } = useBranding()
  const { toast } = useToast()
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
  const fullAmount = formData.room ? formData.playerCount * formData.room.price_per_player : 0
  const depositAmount = formData.room ? Math.min(formData.room.min_players * formData.room.price_per_player, fullAmount) : 0
  const amountToPay = formData.paymentType === 'deposit' ? Math.min(depositAmount, fullAmount) : fullAmount
  const balanceDue = fullAmount - amountToPay

  const handleBooking = async () => {
    if (!formData.room || !formData.slot || !formData.playerName || !formData.playerEmail) return
    setSubmitting(true)

    try {
      const reference = `GR8-${Date.now().toString(36).toUpperCase()}`

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
        player_count: formData.playerCount,
        price_per_player: formData.room.price_per_player,
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
            player_count: formData.playerCount,
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
      toast('Something went wrong. Please try again.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // MD5 signature for Payfast
  const generateMD5 = (str: string): string => md5(str)

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
      <header className="border-b border-white/10 py-4 px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <a href="https://gr8.smartintegrate.co.za" className="text-xl font-black text-white tracking-tight">
            {branding.business_name}
          </a>
          <a href="https://gr8.smartintegrate.co.za" className="text-sm text-gray-400 hover:text-white transition-colors">
            ← Back to site
          </a>
        </div>
      </header>

      {/* Progress bar */}
      <div className="border-b border-white/5 py-4 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between">
            {steps.map((s, i) => {
              const Icon = s.icon
              const currentIdx = steps.findIndex(st => st.key === step)
              const isActive = i === currentIdx
              const isComplete = i < currentIdx
              return (
                <div key={s.key} className="flex items-center">
                  <div className={`flex items-center gap-2 ${isActive ? 'text-gr8-orange' : isComplete ? 'text-green-400' : 'text-gray-600'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                      isActive ? 'bg-gr8-red text-white' : isComplete ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-gray-600'
                    }`}>
                      {isComplete ? '✓' : i + 1}
                    </div>
                    <span className="text-xs font-medium hidden sm:block">{s.label}</span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`w-8 h-px mx-2 ${i < currentIdx ? 'bg-green-500/50' : 'bg-white/10'}`} />
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
            <h1 className="text-2xl sm:text-3xl font-black text-white mb-2">Choose Your {branding.resource_label}</h1>
            <p className="text-gray-500 mb-8">Pick an escape room for your adventure.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {rooms.map(room => (
                <button
                  key={room.id}
                  onClick={() => selectRoom(room)}
                  className="bg-[#1e1e1e] border border-gray-700/50 rounded-xl overflow-hidden text-left hover:border-gr8-red/50 hover:shadow-lg hover:shadow-red-500/10 transition-all group"
                >
                  <div
                    className="h-28 sm:h-40 bg-cover bg-center relative"
                    style={{ backgroundColor: room.color + '22' }}
                  >
                    <span className="absolute inset-0 flex items-center justify-center text-5xl opacity-30 select-none">
                      {roomEmoji(room.slug)}
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1e1e1e] to-transparent" />
                    <div className="absolute bottom-3 left-3 flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: room.color }} />
                      {branding.show_difficulty && room.difficulty && (
                        <span className="text-[10px] font-bold text-white bg-black/50 px-2 py-0.5 rounded-full">
                          {room.difficulty}/10
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="text-lg font-bold text-white mb-1 transition-colors">
                      {room.name}
                    </h3>
                    <p className="text-sm text-gray-400 mb-3 line-clamp-2">{room.description}</p>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">
                        {room.duration_minutes}min
                        {branding.show_player_count ? ` • ${room.min_players}-${room.max_players} players` : ''}
                      </span>
                      <span className="text-gr8-orange font-bold">R{room.price_per_player}{branding.pricing_model === 'per_person' ? '/pp' : ''}</span>
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
            <button onClick={() => setStep('rooms')} className="text-sm text-gray-500 hover:text-white mb-4 flex items-center gap-1">
              ← Back to {branding.resource_label_plural.toLowerCase()}
            </button>
            <h1 className="text-2xl sm:text-3xl font-black text-white mb-2">Pick a Date</h1>
            <p className="text-gray-500 mb-8">
              <span className="font-medium" style={{ color: formData.room.color }}>{formData.room.name}</span> — Select a date for your game.
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
                        ? 'bg-[#1e1e1e] border border-gray-700/50 hover:border-gr8-red/50 hover:bg-gr8-red/10 cursor-pointer'
                        : 'bg-white/3 border border-transparent text-gray-700 cursor-not-allowed'
                    }`}
                  >
                    <p className="text-[10px] text-gray-500 uppercase">{format(date, 'EEE')}</p>
                    <p className="text-lg font-bold text-white">{format(date, 'd')}</p>
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
            <button onClick={() => setStep('date')} className="text-sm text-gray-500 hover:text-white mb-4 flex items-center gap-1">
              ← Back to dates
            </button>
            <h1 className="text-2xl sm:text-3xl font-black text-white mb-2">Pick a Time</h1>
            <p className="text-gray-500 mb-8">
              <span className="font-medium" style={{ color: formData.room.color }}>{formData.room.name}</span> — {format(formData.date, 'EEEE, MMMM d')}
            </p>
            {slots.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-gray-500 text-lg">No available slots for this date.</p>
                <button onClick={() => setStep('date')} className="mt-4 text-gr8-orange hover:underline">
                  Try another date
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {slots.map(slot => (
                  <button
                    key={slot.id}
                    onClick={() => selectSlot(slot)}
                    className="bg-[#1e1e1e] border border-gray-700/50 rounded-xl p-4 text-center hover:border-gr8-red/50 hover:bg-gr8-red/10 transition-all"
                  >
                    <p className="text-xl font-bold text-white">{slot.start_time}</p>
                    <p className="text-xs text-gray-500 mt-1">{slot.end_time}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step: Your Details */}
        {step === 'details' && formData.room && formData.slot && (
          <div>
            <button onClick={() => setStep('slot')} className="text-sm text-gray-500 hover:text-white mb-4 flex items-center gap-1">
              ← Back to times
            </button>
            <h1 className="text-2xl sm:text-3xl font-black text-white mb-2">Your Details</h1>
            <p className="text-gray-500 mb-8">Tell us about your group.</p>

            {/* Booking summary */}
            <div className="bg-[#1e1e1e] border border-gray-700/50 rounded-xl p-5 mb-8">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: formData.room.color }} />
                <span className="font-bold text-white">{formData.room.name}</span>
              </div>
              <p className="text-gray-400 text-sm">
                {formData.date && format(formData.date, 'EEEE, MMMM d')} • {formData.slot.start_time} — {formData.slot.end_time}
              </p>
            </div>

            <div className="max-w-md space-y-5">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Full Name *</label>
                <input
                  type="text"
                  value={formData.playerName}
                  onChange={e => setFormData(prev => ({ ...prev, playerName: e.target.value.trim() }))}
                  className="w-full bg-white/5 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-gr8-red transition-colors"
                  placeholder="John Smith"
                  minLength={2}
                  maxLength={100}
                  required
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Email *</label>
                <input
                  type="email"
                  value={formData.playerEmail}
                  onChange={e => setFormData(prev => ({ ...prev, playerEmail: e.target.value.trim() }))}
                  className="w-full bg-white/5 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-gr8-red transition-colors"
                  placeholder="john@example.com"
                  maxLength={254}
                  required
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Phone (optional)</label>
                <input
                  type="tel"
                  value={formData.playerPhone}
                  onChange={e => setFormData(prev => ({ ...prev, playerPhone: e.target.value }))}
                  className="w-full bg-white/5 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-gr8-red transition-colors"
                  placeholder="076 362 0765"
                />
              </div>
              {branding.show_player_count && (
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Number of Players</label>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setFormData(prev => ({ ...prev, playerCount: Math.max(formData.room!.min_players, prev.playerCount - 1) }))}
                    className="w-10 h-10 rounded-lg bg-white/5 border border-gray-700 text-white font-bold hover:bg-white/10 transition-colors"
                  >
                    −
                  </button>
                  <span className="text-2xl font-bold text-white w-12 text-center">{formData.playerCount}</span>
                  <button
                    onClick={() => setFormData(prev => ({ ...prev, playerCount: Math.min(formData.room!.max_players, prev.playerCount + 1) }))}
                    className="w-10 h-10 rounded-lg bg-white/5 border border-gray-700 text-white font-bold hover:bg-white/10 transition-colors"
                  >
                    +
                  </button>
                </div>
                <p className="text-xs text-gray-600 mt-1">{formData.room.min_players}–{formData.room.max_players} players allowed</p>
              </div>
              )}

              {/* Price summary */}
              <div className="bg-[#1e1e1e] border border-gray-700/50 rounded-xl p-4">
                <div className="flex justify-between text-sm text-gray-400 mb-2">
                  <span>{formData.playerCount} × R{formData.room.price_per_player}</span>
                  <span>R{formData.playerCount * formData.room.price_per_player}</span>
                </div>
                <div className="flex justify-between font-bold text-white text-lg pt-2 border-t border-gray-700/50">
                  <span>Total</span>
                  <span className="text-gr8-orange">R{formData.playerCount * formData.room.price_per_player}</span>
                </div>
              </div>

              <button
                onClick={() => {
                  if (formData.playerName && formData.playerEmail) setStep('payment')
                }}
                disabled={!formData.playerName || !formData.playerEmail}
                className="w-full btn-gr8 py-4 text-lg flex items-center justify-center gap-2"
              >
                {branding.booking_verb}
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}

        {/* Step: Payment */}
        {step === 'payment' && formData.room && formData.slot && (
          <div>
            <button onClick={() => setStep('details')} className="text-sm text-gray-500 hover:text-white mb-4 flex items-center gap-1">
              ← Back to details
            </button>
            <h1 className="text-2xl sm:text-3xl font-black text-white mb-2">Confirm & Pay</h1>
            <p className="text-gray-500 mb-8">Review your booking and choose payment option.</p>

            <div className="max-w-lg">
              {/* Booking summary */}
              <div className="bg-[#1e1e1e] border border-gray-700/50 rounded-xl p-6 mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-5 h-5 rounded-full" style={{ backgroundColor: formData.room.color }} />
                  <span className="text-lg font-bold text-white">{formData.room.name}</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-400">
                    <span>Date</span>
                    <span className="text-white">{formData.date && format(formData.date, 'EEEE, MMMM d, yyyy')}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Time</span>
                    <span className="text-white">{formData.slot.start_time} — {formData.slot.end_time}</span>
                  </div>
                  {branding.show_player_count && (
                  <div className="flex justify-between text-gray-400">
                    <span>Players</span>
                    <span className="text-white">{formData.playerCount} × R{formData.room.price_per_player}</span>
                  </div>
                  )}
                  <div className="flex justify-between text-gray-400">
                    <span>Name</span>
                    <span className="text-white">{formData.playerName}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Email</span>
                    <span className="text-white">{formData.playerEmail}</span>
                  </div>
                </div>
              </div>

              {/* Payment option selector */}
              <div className="mb-6">
                <label className="text-sm text-gray-400 mb-2 block font-medium">Payment Option</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setFormData(prev => ({ ...prev, paymentType: 'deposit' }))}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      formData.paymentType === 'deposit'
                        ? 'border-gr8-red bg-gr8-red/10'
                        : 'border-gray-700/50 bg-white/5 hover:border-gray-600'
                    }`}
                  >
                    <p className="text-white font-bold mb-1">Deposit</p>
                    <p className="text-2xl font-black text-gr8-orange">R{depositAmount}</p>
                    <p className="text-xs text-gray-500 mt-1">Covers {formData.room.min_players} player{formData.room.min_players !== 1 ? 's' : ''}. R{balanceDue} balance due on arrival.</p>
                  </button>
                  <button
                    onClick={() => setFormData(prev => ({ ...prev, paymentType: 'full' }))}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      formData.paymentType === 'full'
                        ? 'border-gr8-red bg-gr8-red/10'
                        : 'border-gray-700/50 bg-white/5 hover:border-gray-600'
                    }`}
                  >
                    <p className="text-white font-bold mb-1">Pay Full</p>
                    <p className="text-2xl font-black text-gr8-orange">R{fullAmount}</p>
                    <p className="text-xs text-gray-500 mt-1">Pay for all {formData.playerCount} players now.</p>
                  </button>
                </div>
              </div>

              {/* Price breakdown */}
              <div className="bg-[#1e1e1e] border border-gray-700/50 rounded-xl p-4 mb-6">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-400">
                    <span>Full amount ({formData.playerCount} × R{formData.room.price_per_player})</span>
                    <span className="text-white">R{fullAmount}</span>
                  </div>
                  <div className="flex justify-between text-gr8-orange font-bold">
                    <span>Pay now</span>
                    <span>R{amountToPay}</span>
                  </div>
                  {balanceDue > 0 && (
                    <div className="flex justify-between text-gray-500">
                      <span>Balance due at venue</span>
                      <span>R{balanceDue}</span>
                    </div>
                  )}
                </div>
              </div>

              {payfastConfigured ? (
                <div className="bg-white/5 border border-gray-700/50 rounded-xl p-4 mb-6 text-sm text-gray-400">
                  <p>You'll be redirected to Payfast to complete payment securely. After payment, you'll receive a confirmation email with your booking details.</p>
                </div>
              ) : (
                <div className="bg-gr8-gold/10 border border-gr8-gold/30 rounded-xl p-4 mb-6 text-sm">
                  <p className="text-gr8-orange font-bold mb-1">Demo Mode</p>
                  <p className="text-gray-400">Payfast not configured. Booking will be confirmed instantly for testing.</p>
                </div>
              )}

              <button
                onClick={handleBooking}
                disabled={submitting}
                className="w-full btn-gr8 py-4 text-lg flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <><Loader2 size={20} className="animate-spin" /> Processing...</>
                ) : payfastConfigured ? (
                  <><CreditCard size={20} /> Pay R{amountToPay} via Payfast</>
                ) : (
                  <><CheckCircle size={20} /> Confirm Booking (Demo)</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
