import { useEffect, useState } from 'react'
import { Clock, Users, AlertTriangle, CheckCircle, Eye, ChevronRight, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import pb, { type Booking, type Room, type TimeSlot } from '../lib/pocketbase'
import { useAuth } from '../lib/auth'
import { useBranding } from '../lib/branding'
import { useRealtime } from '../hooks/useRealtime'

interface HostedGame {
  id: string
  booking: Booking
  room: Room
  timeSlot: TimeSlot
  status: string
  hintsUsed: number
}

export default function GMDashboard() {
  const { staff } = useAuth()
  const { branding } = useBranding()
  const [games, setGames] = useState<HostedGame[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGame, setSelectedGame] = useState<HostedGame | null>(null)

  const loadGames = async () => {
    if (!staff) return
    try {
      const hosts = await pb.collection('game_hosts').getFullList({
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

  useRealtime('game_hosts', () => loadGames())
  useRealtime('bookings', () => loadGames())

  const updateHostStatus = async (hostId: string, status: string) => {
    await pb.collection('game_hosts').update(hostId, { status })
    loadGames()
  }

  const addHint = async (hostId: string, current: number) => {
    await pb.collection('game_hosts').update(hostId, { hints_used: current + 1 })
    loadGames()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-gr8-red" size={32} />
      </div>
    )
  }

  const activeGames = games.filter(g => g.status === 'in_progress')
  const upcomingGames = games.filter(g => g.status === 'assigned' || g.status === 'checked_in')

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900">
          Welcome, <span className="text-gr8-orange">{staff?.name}</span>
        </h1>
        <p className="text-gray-500 mt-1">{branding.staff_role_worker} Dashboard</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 mb-8">
        <div className="card-dark text-center">
          <p className="text-2xl sm:text-3xl font-black text-gr8-red">{activeGames.length}</p>
          <p className="text-xs text-gray-500 uppercase tracking-wider mt-1">Active Games</p>
        </div>
        <div className="card-dark text-center">
          <p className="text-2xl sm:text-3xl font-black text-gr8-orange">{upcomingGames.length}</p>
          <p className="text-xs text-gray-500 uppercase tracking-wider mt-1">Upcoming</p>
        </div>
        <div className="card-dark text-center">
          <p className="text-2xl sm:text-3xl font-black text-gray-900">{games.reduce((sum, g) => sum + g.hintsUsed, 0)}</p>
          <p className="text-xs text-gray-500 uppercase tracking-wider mt-1">Hints Given</p>
        </div>
      </div>

      {/* Active Games */}
      {activeGames.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Active Games
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

      {/* Upcoming Games */}
      <div>
        <h2 className="text-lg font-bold text-white mb-4">Upcoming Games</h2>
        {upcomingGames.length === 0 ? (
          <div className="card-dark text-center py-8">
            <p className="text-gray-500">No upcoming games assigned to you.</p>
          </div>
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
      {selectedGame && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedGame(null)}>
          <div className="card-dark w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: selectedGame.room.color }} />
                <div>
                  <h3 className="font-bold text-gray-900">{selectedGame.room.name}</h3>
                  <p className="text-xs text-gray-500">{selectedGame.booking.reference}</p>
                </div>
              </div>
              <button onClick={() => setSelectedGame(null)} className="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
            </div>

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
                    <p className="text-xs text-gray-500">Players</p>
                    <p className="text-gray-900 font-bold text-lg">{selectedGame.booking.player_count}</p>
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
                <p className="text-xs text-gray-500">Hints Used</p>
                <p className="text-gray-900 font-bold text-lg">{selectedGame.hintsUsed}</p>
              </div>
            </div>

            <div className="flex gap-2">
              {selectedGame.status === 'assigned' && (
                <button onClick={() => { updateHostStatus(selectedGame.id, 'checked_in'); setSelectedGame(null) }}
                  className="flex-1 px-4 py-2 rounded-lg bg-gr8-orange text-black font-bold text-sm">
                  Check In Players
                </button>
              )}
              {selectedGame.status === 'checked_in' && (
                <button onClick={() => { updateHostStatus(selectedGame.id, 'in_progress'); setSelectedGame(null) }}
                  className="flex-1 px-4 py-2 rounded-lg bg-green-600 text-white font-bold text-sm">
                  Start Game
                </button>
              )}
              {selectedGame.status === 'in_progress' && (
                <>
                  <button onClick={() => addHint(selectedGame.id, selectedGame.hintsUsed)}
                    className="flex-1 px-4 py-2 rounded-lg bg-gray-100 text-gray-900 font-bold text-sm">
                    Give Hint ({selectedGame.hintsUsed})
                  </button>
                  <button onClick={() => { updateHostStatus(selectedGame.id, 'completed'); setSelectedGame(null) }}
                    className="flex-1 px-4 py-2 rounded-lg bg-gr8-red text-white font-bold text-sm">
                    End Game
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
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
  const statusColors: Record<string, string> = {
    assigned: 'bg-blue-500/20 text-blue-700',
    checked_in: 'bg-yellow-500/20 text-yellow-600',
    in_progress: 'bg-green-500/20 text-green-700',
  }

  return (
    <div className="card-dark flex items-center gap-4 cursor-pointer hover:border-gray-600 transition-colors" onClick={onSelect}>
      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: game.room.color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-bold text-gray-900 truncate">{game.room.name}</p>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColors[game.status] || 'bg-gray-500/20 text-gray-400'}`}>
            {game.status.replace('_', ' ').toUpperCase()}
          </span>
        </div>
        <p className="text-sm text-gray-600">{game.booking.customer_name}{branding.show_player_count ? ` • ${game.booking.player_count} players` : ''}</p>
        <p className="text-xs text-gray-500">{game.timeSlot.start_time} — {game.timeSlot.end_time}</p>
      </div>
      <div className="flex items-center gap-2">
        {game.hintsUsed > 0 && (
          <span className="text-xs text-gray-500">{game.hintsUsed} hints</span>
        )}
        <ChevronRight size={16} className="text-gray-400" />
      </div>
    </div>
  )
}
