import { useEffect, useState } from 'react'
import { Clock, Users, AlertTriangle, CheckCircle, Eye, ChevronRight, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import pb, { type Booking, type Room, type TimeSlot } from '../lib/pocketbase'
import { useAuth } from '../lib/auth'
import { useBranding } from '../lib/branding'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useRealtime } from '../hooks/useRealtime'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface HostedGame {
  id: string
  booking: Booking
  room: Room
  timeSlot: TimeSlot
  status: string
  hintsUsed: number
}

export default function StaffDashboard() {
  const { staff } = useAuth()
  const { branding } = useBranding()
  const [games, setGames] = useState<HostedGame[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGame, setSelectedGame] = useState<HostedGame | null>(null)

  const loadGames = async () => {
    if (!staff) return
    try {
      const hosts = await pb.collection('booking_staff').getFullList({
        filter: `staff = "${staff.id}" && status != "completed"`,
        expand: 'booking,booking.room,booking.time_slot',
        sort: '-assigned_at',
      })

      const hosted: HostedGame[] = hosts.map(h => ({
        id: h.id,
        booking: h.expand?.booking as Booking,
        room: h.expand?.booking?.expand?.room as Room,
        timeSlot: h.expand?.booking?.expand?.time_slot as TimeSlot,
        status: h.status,
        hintsUsed: h.hints_used || 0,
      })).filter(g => g.booking && g.room)

      setGames(hosted)
    } catch (e) {
      console.error('Failed to load games:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadGames() }, [staff])

  useRealtime('booking_staff', () => loadGames())
  useRealtime('bookings', () => loadGames())

  const updateHostStatus = async (hostId: string, status: string) => {
    await pb.collection('booking_staff').update(hostId, { status })
    loadGames()
  }

  const addHint = async (hostId: string, current: number) => {
    await pb.collection('booking_staff').update(hostId, { hints_used: current + 1 })
    loadGames()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-sb-red" size={32} />
      </div>
    )
  }

  const activeGames = games.filter(g => g.status === 'in_progress')
  const upcomingGames = games.filter(g => g.status === 'assigned' || g.status === 'checked_in')

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          Welcome, <span className="text-sb-orange">{staff?.name}</span>
        </h1>
        <p className="text-gray-500 mt-1">{branding.staff_role_worker} Dashboard</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 mb-8">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl sm:text-3xl font-black text-sb-red">{activeGames.length}</p>
            <p className="text-xs text-gray-500 uppercase tracking-wider mt-1">Active Bookings</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl sm:text-3xl font-black text-sb-orange">{upcomingGames.length}</p>
            <p className="text-xs text-gray-500 uppercase tracking-wider mt-1">Upcoming Bookings</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl sm:text-3xl font-black text-gray-900">{games.reduce((sum, g) => sum + g.hintsUsed, 0)}</p>
            <p className="text-xs text-gray-500 uppercase tracking-wider mt-1">Notes Added</p>
          </CardContent>
        </Card>
      </div>

      {/* Active Bookings */}
      {activeGames.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Active Bookings
          </h2>
          <div className="space-y-3">
            {activeGames.map(game => (
              <GameCard
                key={game.id}
                game={game}
                onSelect={() => setSelectedGame(game)}
                onEnd={() => updateHostStatus(game.id, 'completed')}
                onHint={() => addHint(game.id, game.hintsUsed)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Bookings */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-4">Upcoming Bookings</h2>
        {upcomingGames.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center py-8">
              <p className="text-gray-500">No upcoming games assigned to you.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {upcomingGames.map(game => (
              <GameCard
                key={game.id}
                game={game}
                onSelect={() => setSelectedGame(game)}
                onStart={() => updateHostStatus(game.id, 'in_progress')}
                onCheckIn={() => updateHostStatus(game.id, 'checked_in')}
              />
            ))}
          </div>
        )}
      </div>

      {/* Game Detail Modal */}
      <Dialog open={!!selectedGame} onOpenChange={(open) => { if (!open) setSelectedGame(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              {selectedGame && <div className="w-4 h-4 rounded-full" style={{ backgroundColor: selectedGame.room.color }} />}
              <div>
                <DialogTitle>{selectedGame?.room.name}</DialogTitle>
                <p className="text-xs text-gray-500">{selectedGame?.booking.reference}</p>
              </div>
            </div>
          </DialogHeader>

          {selectedGame && (
            <>
              <div className="space-y-3 mb-6">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Customer</p>
                  <p className="text-gray-900 font-medium">{selectedGame.booking.customer_name}</p>
                  <p className="text-xs text-gray-600">{selectedGame.booking.customer_email}</p>
                  {selectedGame.booking.customer_phone && (
                    <p className="text-xs text-gray-600">{selectedGame.booking.customer_phone}</p>
                  )}
                </div>
                <div className={`grid ${branding.show_player_count ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
                  {branding.show_player_count && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">Party</p>
                      <p className="text-gray-900 font-bold text-lg">{selectedGame.booking.party_size}</p>
                    </div>
                  )}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">Time</p>
                    <p className="text-gray-900 font-bold text-lg">{selectedGame.timeSlot.start_time}</p>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Waiver Status</p>
                  <p className={selectedGame.booking.waiver_signed ? 'text-green-600 font-medium' : 'text-yellow-600 font-medium'}>
                    {selectedGame.booking.waiver_signed ? '✓ All players signed' : '⚠ Waivers pending'}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Notes Added</p>
                  <p className="text-gray-900 font-bold text-lg">{selectedGame.hintsUsed}</p>
                </div>
              </div>

              <div className="flex gap-2">
                {selectedGame.status === 'assigned' && (
                  <Button variant="default" onClick={() => { updateHostStatus(selectedGame.id, 'checked_in'); setSelectedGame(null) }}
                    className="flex-1" style={{ backgroundColor: 'var(--sb-orange)' }}>
                    Check In Players
                  </Button>
                )}
                {selectedGame.status === 'checked_in' && (
                  <Button variant="default" onClick={() => { updateHostStatus(selectedGame.id, 'in_progress'); setSelectedGame(null) }}
                    className="flex-1 bg-green-600 hover:bg-green-700">
                    Start Booking
                  </Button>
                )}
                {selectedGame.status === 'in_progress' && (
                  <>
                    <Button variant="outline" onClick={() => addHint(selectedGame.id, selectedGame.hintsUsed)}
                      className="flex-1">
                      Add Note ({selectedGame.hintsUsed})
                    </Button>
                    <Button variant="destructive" onClick={() => { updateHostStatus(selectedGame.id, 'completed'); setSelectedGame(null) }}
                      className="flex-1">
                      Complete Booking
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function GameCard({ game, onSelect, onStart, onCheckIn, onEnd, onHint }: {
  game: HostedGame
  onSelect: () => void
  onStart?: () => void
  onCheckIn?: () => void
  onEnd?: () => void
  onHint?: () => void
}) {
  const { branding } = useBranding()
  const statusVariant = (status: string) => {
    switch (status) {
      case 'assigned': return 'warning'
      case 'checked_in': return 'warning'
      case 'in_progress': return 'success'
      default: return 'secondary'
    }
  }

  return (
    <Card className="flex items-center gap-4 cursor-pointer hover:border-gray-300 transition-colors" onClick={onSelect}>
      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: game.room.color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-bold text-gray-900 truncate">{game.room.name}</p>
          <Badge variant={statusVariant(game.status)}>
            {game.status.replace('_', ' ').toUpperCase()}
          </Badge>
        </div>
        <p className="text-sm text-gray-600">{game.booking.customer_name}{branding.show_player_count ? ` • ${game.booking.party_size} guests` : ''}</p>
        <p className="text-xs text-gray-500">{game.timeSlot.start_time} — {game.timeSlot.end_time}</p>
      </div>
      <div className="flex items-center gap-2">
        {game.hintsUsed > 0 && (
          <span className="text-xs text-gray-500">{game.hintsUsed} notes</span>
        )}
        <ChevronRight size={16} className="text-gray-400" />
      </div>
    </Card>
  )
}
