import { useEffect, useState } from 'react'
import { Plus, Trash2, Edit, X, Loader2, ToggleLeft, ToggleRight } from 'lucide-react'
import pb, { type Room } from '../lib/pocketbase'
import { useToast } from '../lib/toast'
import { useBranding } from '../lib/branding'

const COLORS = ['#E53935', '#FFB900', '#4CAF50', '#9C27B0', '#FF9800', '#E040FB', '#06B6D4', '#F43F5E']

export default function Rooms() {
  const { toast, confirm } = useToast()
  const { branding } = useBranding()
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingRoom, setEditingRoom] = useState<Room | null>(null)
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', slug: '', description: '', difficulty: 7,
    duration_minutes: 60, reset_buffer_minutes: 15,
    min_players: 2, max_players: 8, price_per_player: 320,
    currency: 'ZAR', color: COLORS[0], is_active: true, sort_order: 0,
  })

  const loadRooms = async () => {
    try {
      const r = await pb.collection('rooms').getFullList<Room>({ sort: 'sort_order' })
      setRooms(r)
    } catch (e) {
      console.error('Failed to load rooms:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadRooms() }, [])

  const openAdd = () => {
    setEditingRoom(null)
    setForm({
      name: '', slug: '', description: '', difficulty: 7,
      duration_minutes: 60, reset_buffer_minutes: 15,
      min_players: 2, max_players: 8, price_per_player: 320,
      currency: 'ZAR', color: COLORS[rooms.length % COLORS.length], is_active: true, sort_order: rooms.length,
    })
    setShowModal(true)
  }

  const openEdit = (room: Room) => {
    setEditingRoom(room)
    setForm({
      name: room.name, slug: room.slug, description: room.description || '',
      difficulty: room.difficulty || 7, duration_minutes: room.duration_minutes,
      reset_buffer_minutes: room.reset_buffer_minutes, min_players: room.min_players,
      max_players: room.max_players, price_per_player: room.price_per_player,
      currency: room.currency, color: room.color || COLORS[0],
      is_active: room.is_active, sort_order: room.sort_order || 0,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.slug) return
    setSaving(true)
    try {
      const data = { ...form }
      if (editingRoom) {
        await pb.collection('rooms').update(editingRoom.id, data)
      } else {
        await pb.collection('rooms').create(data)
      }
      setShowModal(false)
      loadRooms()
    } catch (e) {
      console.error('Failed to save room:', e)
      toast('Failed to save room. Check if slug is unique.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (room: Room) => {
    setTogglingId(room.id)
    await pb.collection('rooms').update(room.id, { is_active: !room.is_active })
    setTogglingId(null)
    loadRooms()
  }

  const deleteRoom = async (room: Room) => {
    const confirmed = await confirm(`Delete "${room.name}"? This cannot be undone.`)
    if (!confirmed) return
    await pb.collection('rooms').delete(room.id)
    loadRooms()
  }

  const generateSlug = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-gr8-red" size={32} />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900">{branding.resource_label_plural}</h1>
          <p className="text-gray-500 mt-1">{rooms.length} {branding.resource_label_plural.toLowerCase()} configured</p>
        </div>
        <button onClick={openAdd} className="btn-gr8 flex items-center gap-2">
          <Plus size={16} /> Add {branding.resource_label}
        </button>
      </div>

      {/* Room grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {rooms.map(room => (
          <div key={room.id} className={`card-dark group hover:border-gray-600 transition-all ${!room.is_active ? 'opacity-50' : ''}`}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: room.color }} />
                <h3 className="text-lg font-bold text-gray-900">{room.name}</h3>
              </div>
              <div className="flex gap-1">
                {togglingId === room.id ? (
                  <Loader2 size={16} className="animate-spin text-gray-500" />
                ) : (
                  <button onClick={() => toggleActive(room)} className="p-1.5 rounded hover:bg-gray-50 text-gray-500 hover:text-gray-900" title={room.is_active ? 'Disable' : 'Enable'}>
                    {room.is_active ? <ToggleRight size={16} className="text-green-600" /> : <ToggleLeft size={16} />}
                  </button>
                )}
                <button onClick={() => openEdit(room)} className="p-1.5 rounded hover:bg-gray-50 text-gray-500 hover:text-gray-900" title="Edit">
                  <Edit size={14} />
                </button>
                <button onClick={() => deleteRoom(room)} className="p-1.5 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-600" title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-4 line-clamp-2">{room.description || 'No description'}</p>

            <div className="grid grid-cols-3 gap-2 text-center mb-3">
              <div className="bg-gray-50 rounded p-2">
                <p className="text-gr8-red font-bold text-sm">{room.duration_minutes}min</p>
                <p className="text-[10px] text-gray-500 uppercase">Duration</p>
              </div>
              {branding.show_player_count && (
                <div className="bg-gray-50 rounded p-2">
                  <p className="text-gr8-orange font-bold text-sm">{room.min_players}-{room.max_players}</p>
                  <p className="text-[10px] text-gray-500 uppercase">Players</p>
                </div>
              )}
              <div className="bg-gray-50 rounded p-2">
                <p className="text-green-600 font-bold text-sm">R{room.price_per_player}</p>
                <p className="text-[10px] text-gray-500 uppercase">Per {branding.pricing_model === 'per_person' ? 'person' : branding.resource_label.toLowerCase()}</p>
              </div>
            </div>

            {branding.show_difficulty && room.difficulty && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold text-gray-500 uppercase">Difficulty</span>
                <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                  <div className="h-full rounded-full" style={{ width: `${(room.difficulty / 10) * 100}%`, backgroundColor: room.color }} />
                </div>
                <span className="text-xs font-bold text-gray-900">{room.difficulty}/10</span>
              </div>
            )}

            <div className="flex items-center gap-2 pt-3 border-t border-gray-200">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${room.is_active ? 'bg-green-500/20 text-green-700' : 'bg-gray-500/20 text-gray-500'}`}>
                {room.is_active ? 'Active' : 'Disabled'}
              </span>
              <span className="text-[10px] text-gray-600">Reset: {room.reset_buffer_minutes}min</span>
            </div>
          </div>
        ))}

        {/* Add room card */}
        <button onClick={openAdd} className="card-dark border-dashed border-gray-700 hover:border-gr8-red/50 flex flex-col items-center justify-center min-h-[200px] text-gray-500 hover:text-gr8-red transition-colors">
          <Plus size={32} className="mb-2" />
          <span className="text-sm font-medium">Add {branding.resource_label}</span>
        </button>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card-dark w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">{editingRoom ? `Edit ${branding.resource_label}` : `Add ${branding.resource_label}`}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700"><X size={18} /></button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Name *</label>
                  <input type="text" value={form.name} onChange={e => {
                    const name = e.target.value
                    setForm(f => ({ ...f, name, slug: f.slug || generateSlug(name) }))
                  }} className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-gr8-orange" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Slug *</label>
                  <input type="text" value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-gr8-orange font-mono" />
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-600 mb-1 block">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-gr8-orange resize-none" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Difficulty (1-10)</label>
                  <input type="number" value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: +e.target.value }))} min={1} max={10} className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-gr8-orange" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Duration (min)</label>
                  <input type="number" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: +e.target.value }))} min={15} max={120} className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-gr8-orange" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Reset Buffer</label>
                  <input type="number" value={form.reset_buffer_minutes} onChange={e => setForm(f => ({ ...f, reset_buffer_minutes: +e.target.value }))} min={0} max={60} className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-gr8-orange" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Min Players</label>
                  <input type="number" value={form.min_players} onChange={e => setForm(f => ({ ...f, min_players: +e.target.value }))} min={1} max={20} className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-gr8-orange" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Max Players</label>
                  <input type="number" value={form.max_players} onChange={e => setForm(f => ({ ...f, max_players: +e.target.value }))} min={1} max={20} className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-gr8-orange" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Price/pp (R)</label>
                  <input type="number" value={form.price_per_player} onChange={e => setForm(f => ({ ...f, price_per_player: +e.target.value }))} min={0} className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-gr8-orange" />
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-600 mb-1 block">Color</label>
                <div className="flex gap-2">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))} className={`w-8 h-8 rounded-full transition-transform ${form.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-white scale-110' : 'hover:scale-110'}`} style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600">Active</label>
                <button onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))} className={`relative w-12 h-6 rounded-full transition-colors ${form.is_active ? 'bg-green-500' : 'bg-gray-600'}`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${form.is_active ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 rounded-lg bg-gray-50 text-gray-500 hover:text-gray-900 text-sm">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.name || !form.slug} className="flex-1 btn-gr8 py-2 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                {saving ? 'Saving...' : editingRoom ? `Update ${branding.resource_label}` : `Add ${branding.resource_label}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
