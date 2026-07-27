import PocketBase from 'pocketbase'

const pb = new PocketBase('/')
pb.autoCancellation(false)

export default pb

export interface Room {
  id: string
  name: string
  slug: string
  description: string
  story: string
  difficulty: number | null
  duration_minutes: number
  reset_buffer_minutes: number
  min_capacity: number
  max_capacity: number
  unit_price: number
  currency: string
  image: string
  color: string
  is_active: boolean
  sort_order: number
  created: string
  updated: string
}

export interface TimeSlot {
  id: string
  room: string
  date: string
  start_time: string
  end_time: string
  status: 'available' | 'reserved' | 'full' | 'blocked'
  created: string
  updated: string
}

export interface Booking {
  id: string
  reference: string
  time_slot: string
  room: string
  customer_name: string
  customer_email: string
  customer_phone: string
  party_size: number
  unit_price: number
  total_amount: number
  deposit_amount: number
  balance_due: number
  payment_type: 'deposit' | 'full'
  currency: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
  payment_status: 'unpaid' | 'paid' | 'refunded' | 'failed'
  payment_method: string
  payment_id: string
  notes: string
  waiver_signed: boolean
  waiver_url: string
  reminder_sent: boolean
  created: string
  updated: string
  expand?: {
    room?: Room
    time_slot?: TimeSlot
  }
}

export interface Block {
  id: string
  room: string
  date: string
  start_time: string
  end_time: string
  reason: string
  created: string
  updated: string
}
