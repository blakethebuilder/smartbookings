import { useEffect, useState, useMemo } from 'react'
import { TrendingUp, DollarSign, BarChart3, CreditCard, Wallet, Loader2 } from 'lucide-react'
import pb, { type Booking } from '../lib/pocketbase'
import { useAuth } from '../lib/auth'
import { useBranding } from '../lib/branding'
import { useRealtime } from '../hooks/useRealtime'
import { Card, CardContent } from '@/components/ui/card'

export default function Finances() {
  const { staff } = useAuth()
  const { branding } = useBranding()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    try {
      const bookingsData = await pb.collection('bookings').getFullList<Booking>({ sort: '-id' })
      setBookings(bookingsData)
    } catch (e) {
      console.error('Failed to load finances:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])
  useRealtime('bookings', () => loadData())

  const paidBookings = useMemo(() => bookings.filter(b => b.payment_status === 'paid'), [bookings])
  const depositBookings = useMemo(() => bookings.filter(b => b.payment_type === 'deposit'), [bookings])
  const fullBookings = useMemo(() => bookings.filter(b => b.payment_type === 'full'), [bookings])

  const revenueAllTime = useMemo(() =>
    paidBookings.reduce((sum, b) => sum + b.total_amount, 0), [paidBookings])

  const depositsCollected = useMemo(() =>
    depositBookings.filter(b => b.payment_status === 'paid')
      .reduce((sum, b) => sum + (b.deposit_amount || 0), 0), [depositBookings])

  const balanceDue = useMemo(() =>
    depositBookings.filter(b => b.status !== 'cancelled')
      .reduce((sum, b) => sum + (b.balance_due || 0), 0), [depositBookings])

  const fullPayments = useMemo(() =>
    fullBookings.filter(b => b.payment_status === 'paid')
      .reduce((sum, b) => sum + b.total_amount, 0), [fullBookings])

  const pendingPayments = useMemo(() =>
    bookings.filter(b => b.payment_status === 'unpaid' && b.status !== 'cancelled').length, [bookings])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-sb-red" size={32} />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
          Finances
        </h1>
        <p className="text-gray-500 mt-1 text-sm">
          Revenue, deposits, and payment tracking for {branding.business_name}
        </p>
      </div>

      {/* Revenue Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-xl bg-green-500/10">
                <BarChart3 size={22} className="text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-gray-900">R{revenueAllTime.toLocaleString()}</p>
                <p className="text-xs text-gray-500 font-medium">Total Revenue</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-xl bg-sb-orange/10">
                <DollarSign size={22} className="text-sb-orange" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-gray-900">{paidBookings.length}</p>
                <p className="text-xs text-gray-500 font-medium">Paid Bookings</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-xl bg-amber-500/10">
                <TrendingUp size={22} className="text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-gray-900">{pendingPayments}</p>
                <p className="text-xs text-gray-500 font-medium">Pending Payments</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Deposit vs Full Payment */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-gray-500 font-medium mb-1">Deposits Collected</p>
            <p className="text-2xl font-bold tabular-nums text-sb-orange">
              R{depositsCollected.toLocaleString()}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{depositBookings.filter(b => b.payment_status === 'paid').length} bookings</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-gray-500 font-medium mb-1">Balance Due</p>
            <p className="text-2xl font-bold tabular-nums text-amber-600">
              R{balanceDue.toLocaleString()}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">To collect from customers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-gray-500 font-medium mb-1">Full Payments</p>
            <p className="text-2xl font-bold tabular-nums text-green-600">
              R{fullPayments.toLocaleString()}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{fullBookings.filter(b => b.payment_status === 'paid').length} bookings</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs text-gray-500 font-medium mb-1">Avg. Booking Value</p>
            <p className="text-2xl font-bold tabular-nums text-gray-900">
              R{paidBookings.length > 0 ? Math.round(revenueAllTime / paidBookings.length).toLocaleString() : '0'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Per paid booking</p>
          </CardContent>
        </Card>
      </div>

      {/* Payment Status Breakdown */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment Status</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Paid', count: bookings.filter(b => b.payment_status === 'paid').length, color: 'text-green-600' },
              { label: 'Unpaid', count: bookings.filter(b => b.payment_status === 'unpaid').length, color: 'text-amber-600' },
              { label: 'Refunded', count: bookings.filter(b => b.payment_status === 'refunded').length, color: 'text-blue-600' },
              { label: 'Failed', count: bookings.filter(b => b.payment_status === 'failed').length, color: 'text-red-600' },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.count}</p>
                <p className="text-xs text-gray-500 font-medium mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}