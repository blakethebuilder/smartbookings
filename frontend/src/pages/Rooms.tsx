import { useEffect, useState } from 'react'
import { Plus, Trash2, Edit, Loader2, ToggleLeft, ToggleRight } from 'lucide-react'
import pb, { type Room } from '../lib/pocketbase'
import { toast } from 'sonner'
import { useBranding } from '../lib/branding'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const COLORS = ['#E53935', '#FFB900', '#4CAF50', '#9C27B0', '#FF9800', '#E040FB', '#06B6D4', '#F43F5E']

export default function Rooms() {
  const { branding } = useBranding()
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingRoom, setEditingRoom] = useState<Room | null>(null)
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Room | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', slug: '', description: '', difficulty: 7,
    duration_minutes: 60, reset_buffer_minutes: 15,
    min_capacity: 2, max_capacity: 8, unit_price: 320,
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
    setImageFile(null)
    setImagePreview(null)
    setForm({
      name: '', slug: '', description: '', difficulty: 7,
      duration_minutes: 60, reset_buffer_minutes: 15,
      min_capacity: 2, max_capacity: 8, unit_price: 320,
      currency: 'ZAR', color: COLORS[rooms.length % COLORS.length], is_active: true, sort_order: rooms.length,
    })
    setShowModal(true)
  }

  const openEdit = (room: Room) => {
    setEditingRoom(room)
    setImageFile(null)
    setImagePreview(null)
    setForm({
      name: room.name, slug: room.slug, description: room.description || '',
      difficulty: room.difficulty || 7, duration_minutes: room.duration_minutes,
      reset_buffer_minutes: room.reset_buffer_minutes, min_capacity: room.min_capacity,
      max_capacity: room.max_capacity, unit_price: room.unit_price,
      currency: room.currency, color: room.color || COLORS[0],
      is_active: room.is_active, sort_order: room.sort_order || 0,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.slug) return
    setSaving(true)
    try {
      const data: any = { ...form }
      if (imageFile) data.image = imageFile
      if (editingRoom) {
        await pb.collection('rooms').update(editingRoom.id, data)
      } else {
        await pb.collection('rooms').create(data)
      }
      setShowModal(false)
      loadRooms()
    } catch (e) {
      console.error('Failed to save room:', e)
      toast.error('Failed to save room. Check if slug is unique.')
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
    setConfirmDelete(null)
    await pb.collection('rooms').delete(room.id)
    loadRooms()
  }

  const generateSlug = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-sb-red" size={32} />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{branding.resource_label_plural}</h1>
          <p className="text-gray-500 mt-1">{rooms.length} {branding.resource_label_plural.toLowerCase()} configured</p>
        </div>
        <Button onClick={openAdd}>
          <Plus size={16} /> Add {branding.resource_label}
        </Button>
      </div>

      {/* Room grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {rooms.map(room => (
          <Card key={room.id} className={`group hover:shadow-md transition-all overflow-hidden ${!room.is_active ? 'opacity-60' : ''}`}>
            {room.image ? (
              <div className="h-32 bg-cover bg-center" style={{ backgroundImage: `url(${pb.files.getUrl(room, room.image)})` }} />
            ) : (
              <div className="h-2" style={{ backgroundColor: room.color }} />
            )}
            <div className="px-5 pt-4 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: room.color }} />
                <h3 className="text-lg font-semibold text-gray-900">{room.name}</h3>
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
                <button onClick={() => setConfirmDelete(room)} className="p-1.5 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-600" title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-4 line-clamp-2">{room.description || 'No description'}</p>

            <div className="grid grid-cols-3 gap-2 text-center mb-3">
              <div className="bg-gray-50 rounded p-2">
                <p className="text-sb-red font-bold text-sm">{room.duration_minutes}min</p>
                <p className="text-[10px] text-gray-500 font-medium">Duration</p>
              </div>
              {branding.show_player_count && (
                <div className="bg-gray-50 rounded p-2">
                  <p className="text-sb-orange font-bold text-sm">{room.min_capacity}-{room.max_capacity}</p>
                  <p className="text-[10px] text-gray-500 font-medium">Players</p>
                </div>
              )}
              <div className="bg-gray-50 rounded p-2">
                <p className="text-green-600 font-bold text-sm">R{room.unit_price}</p>
                <p className="text-[10px] text-gray-500 font-medium">Per {branding.pricing_model === 'per_person' ? 'person' : branding.resource_label.toLowerCase()}</p>
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
              <Badge variant={room.is_active ? 'success' : 'secondary'} className="uppercase">
                {room.is_active ? 'Active' : 'Disabled'}
              </Badge>
              <span className="text-[10px] text-gray-600">Reset: {room.reset_buffer_minutes}min</span>
            </div>
          </Card>
        ))}

        {/* Add room card */}
        <Card onClick={openAdd} className="border-2 border-dashed border-gray-200 hover:border-sb-orange/50 flex flex-col items-center justify-center min-h-[200px] text-gray-400 hover:text-sb-orange transition-colors cursor-pointer">
          <CardContent className="pt-6 flex flex-col items-center">
            <Plus size={32} className="mb-2" />
            <span className="text-sm font-medium">Add {branding.resource_label}</span>
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRoom ? `Edit ${branding.resource_label}` : `Add ${branding.resource_label}`}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Name *</label>
                <Input type="text" value={form.name} onChange={e => {
                  const name = e.target.value
                  setForm(f => ({ ...f, name, slug: f.slug || generateSlug(name) }))
                }} className="w-full" />
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Slug *</label>
                <Input type="text" value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} className="w-full font-mono" />
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-1 block">Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-sb-orange resize-none" />
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-1 block">Image</label>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) {
                      setImageFile(file)
                      setImagePreview(URL.createObjectURL(file))
                    }
                  }}
                  className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
                />
                {imagePreview && (
                  <img src={imagePreview} alt="Preview" className="h-10 w-16 object-cover rounded border" />
                )}
                {!imagePreview && editingRoom?.image && (
                  <img src={pb.files.getUrl(editingRoom, editingRoom.image)} alt="Current" className="h-10 w-16 object-cover rounded border" />
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Difficulty (1-10)</label>
                <Input type="number" value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: +e.target.value }))} min={1} max={10} className="w-full" />
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Duration (min)</label>
                <Input type="number" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: +e.target.value }))} min={15} max={120} className="w-full" />
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Reset Buffer</label>
                <Input type="number" value={form.reset_buffer_minutes} onChange={e => setForm(f => ({ ...f, reset_buffer_minutes: +e.target.value }))} min={0} max={60} className="w-full" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Min Players</label>
                <Input type="number" value={form.min_capacity} onChange={e => setForm(f => ({ ...f, min_capacity: +e.target.value }))} min={1} max={20} className="w-full" />
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Max Players</label>
                <Input type="number" value={form.max_capacity} onChange={e => setForm(f => ({ ...f, max_capacity: +e.target.value }))} min={1} max={20} className="w-full" />
              </div>
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Price/pp (R)</label>
                <Input type="number" value={form.unit_price} onChange={e => setForm(f => ({ ...f, unit_price: +e.target.value }))} min={0} className="w-full" />
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name || !form.slug}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? 'Saving...' : editingRoom ? `Update ${branding.resource_label}` : `Add ${branding.resource_label}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={(open) => { if (!open) setConfirmDelete(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {branding.resource_label}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Delete "{confirmDelete?.name}"? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => confirmDelete && deleteRoom(confirmDelete)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
