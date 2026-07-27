import { useEffect, useState } from 'react'
import { Plus, Trash2, Edit, X, Loader2, Building2, Globe } from 'lucide-react'
import pb from '../lib/pocketbase'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { useBranding } from '../lib/branding'

type BusinessType = 'escape_room' | 'medical' | 'salon' | 'restaurant' | 'custom'

interface Client {
  id: string
  name: string
  subdomain: string
  business_type: BusinessType
  resource_label: string
  resource_label_plural: string
  staff_role_admin: string
  staff_role_worker: string
  booking_verb: string
  pricing_model: string
  primary_color: string
  logo_url: string
  customer_fields: string
  duration_unit: string
  show_difficulty: boolean
  show_player_count: boolean
  is_active: boolean
  created: string
  updated: string
}

interface ClientFormData {
  name: string
  subdomain: string
  business_type: BusinessType
  resource_label: string
  resource_label_plural: string
  staff_role_admin: string
  staff_role_worker: string
  booking_verb: string
  pricing_model: string
  primary_color: string
  logo_url: string
  customer_fields: string
  duration_unit: string
  show_difficulty: boolean
  show_player_count: boolean
  is_active: boolean
}

const BRAND_COLORS = ['#E53935', '#2563EB', '#059669', '#D97706', '#7C3AED', '#DB2777', '#0891B2', '#65A30D']

const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  escape_room: 'Escape Room',
  medical: 'Medical',
  salon: 'Salon',
  restaurant: 'Restaurant',
  custom: 'Custom',
}

const DEFAULTS: Record<string, Partial<ClientFormData>> = {
  escape_room: {
    resource_label: 'Resource',
    resource_label_plural: 'Resources',
    staff_role_admin: 'Admin',
    staff_role_worker: 'Staff',
    booking_verb: 'Book Now',
    pricing_model: 'per_person',
    duration_unit: 'minutes',
    show_difficulty: true,
    show_player_count: true,
    customer_fields: 'name,email,phone',
  },
  medical: {
    resource_label: 'Doctor',
    resource_label_plural: 'Doctors',
    staff_role_admin: 'Admin',
    staff_role_worker: 'Doctor',
    booking_verb: 'Book Appointment',
    pricing_model: 'per_slot',
    duration_unit: 'minutes',
    show_difficulty: false,
    show_player_count: false,
    customer_fields: 'name,email,phone,id_number,medical_aid',
  },
  salon: {
    resource_label: 'Stylist',
    resource_label_plural: 'Stylists',
    staff_role_admin: 'Manager',
    staff_role_worker: 'Stylist',
    booking_verb: 'Book Appointment',
    pricing_model: 'per_slot',
    duration_unit: 'minutes',
    show_difficulty: false,
    show_player_count: false,
    customer_fields: 'name,email,phone,preferred_stylist',
  },
  restaurant: {
    resource_label: 'Table',
    resource_label_plural: 'Tables',
    staff_role_admin: 'Manager',
    staff_role_worker: 'Host',
    booking_verb: 'Reserve Table',
    pricing_model: 'flat',
    duration_unit: 'slots',
    show_difficulty: false,
    show_player_count: true,
    customer_fields: 'name,email,phone,party_size,dietary_requirements',
  },
  custom: {
    resource_label: 'Resource',
    resource_label_plural: 'Resources',
    staff_role_admin: 'Admin',
    staff_role_worker: 'Staff',
    booking_verb: 'Book Now',
    pricing_model: 'per_slot',
    duration_unit: 'minutes',
    show_difficulty: false,
    show_player_count: false,
    customer_fields: 'name,email,phone',
  },
}

const EMPTY_FORM: ClientFormData = {
  name: '',
  subdomain: '',
  business_type: 'escape_room',
  resource_label: 'Resource',
  resource_label_plural: 'Resources',
  staff_role_admin: 'Admin',
  staff_role_worker: 'Staff',
  booking_verb: 'Book Now',
  pricing_model: 'per_person',
  primary_color: BRAND_COLORS[0],
  logo_url: '',
  customer_fields: 'name,email,phone',
  duration_unit: 'minutes',
  show_difficulty: true,
  show_player_count: true,
  is_active: true,
}

export default function Clients() {
  const { toast, confirm } = useToast()
  const { branding } = useBranding()
  const { switchClient } = useAuth()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<ClientFormData>(EMPTY_FORM)
  const [switchingId, setSwitchingId] = useState<string | null>(null)

  const loadClients = async () => {
    try {
      const c = await pb.collection('clients').getFullList<Client>({ sort: 'name' })
      setClients(c)
    } catch (e) {
      console.error('Failed to load clients:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadClients() }, [])

  const openAdd = () => {
    setEditingClient(null)
    setForm({ ...EMPTY_FORM, primary_color: BRAND_COLORS[clients.length % BRAND_COLORS.length] })
    setShowModal(true)
  }

  const openEdit = (client: Client) => {
    setEditingClient(client)
    setForm({
      name: client.name,
      subdomain: client.subdomain,
      business_type: client.business_type,
      resource_label: client.resource_label || '',
      resource_label_plural: client.resource_label_plural || '',
      staff_role_admin: client.staff_role_admin || '',
      staff_role_worker: client.staff_role_worker || '',
      booking_verb: client.booking_verb || '',
      pricing_model: client.pricing_model || 'per_person',
      primary_color: client.primary_color || BRAND_COLORS[0],
      logo_url: client.logo_url || '',
      customer_fields: client.customer_fields || '',
      duration_unit: client.duration_unit || 'minutes',
      show_difficulty: client.show_difficulty ?? true,
      show_player_count: client.show_player_count ?? true,
      is_active: client.is_active,
    })
    setShowModal(true)
  }

  const handleBusinessTypeChange = (bt: BusinessType) => {
    const defaults = DEFAULTS[bt] || DEFAULTS.custom
    setForm(f => ({
      ...f,
      business_type: bt,
      ...defaults,
      primary_color: bt === 'medical' ? '#2563EB' : f.primary_color,
      name: f.name,
      subdomain: f.subdomain,
      logo_url: f.logo_url,
      is_active: f.is_active,
    }))
  }

  const handleSave = async () => {
    if (!form.name || !form.subdomain) return
    setSaving(true)
    try {
      const data = { ...form }
      if (editingClient) {
        await pb.collection('clients').update(editingClient.id, data)
      } else {
        await pb.collection('clients').create(data)
      }
      setShowModal(false)
      loadClients()
      toast(editingClient ? 'Client updated' : 'Client created', 'success')
    } catch (e: any) {
      console.error('Failed to save client:', e)
      toast('Failed to save client. Check if subdomain is unique.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSwitch = async (client: Client) => {
    setSwitchingId(client.id)
    await switchClient(client.id)
    setSwitchingId(null)
    toast(`Switched to ${client.name}`, 'success')
  }

  const handleDelete = async (client: Client) => {
    const confirmed = await confirm(`Delete "${client.name}"? This cannot be undone. All associated data will remain.`)
    if (!confirmed) return
    try {
      await pb.collection('clients').delete(client.id)
      loadClients()
      toast('Client deleted', 'success')
    } catch (e) {
      toast('Failed to delete client', 'error')
    }
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
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Clients</h1>
          <p className="text-gray-500 mt-1">{clients.length} client{clients.length !== 1 ? 's' : ''} configured</p>
        </div>
        <button onClick={openAdd} className="btn-sb flex items-center gap-2">
          <Plus size={16} /> Add Client
        </button>
      </div>

      {/* Client grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {clients.map(client => (
          <div
            key={client.id}
            className="card group hover:border-gray-600 transition-all cursor-pointer"
            onClick={() => handleSwitch(client)}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                  style={{ backgroundColor: client.primary_color || '#E53935' }}
                >
                  <Building2 size={18} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-gray-900 truncate">{client.name}</h3>
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <Globe size={10} />
                    {client.subdomain}
                  </p>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                <button onClick={() => openEdit(client)} className="p-1.5 rounded hover:bg-gray-50 text-gray-500 hover:text-gray-900" title="Edit">
                  <Edit size={14} />
                </button>
                <button onClick={() => handleDelete(client)} className="p-1.5 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-600" title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                client.business_type === 'escape_room' ? 'bg-purple-500/20 text-purple-700' :
                client.business_type === 'medical' ? 'bg-blue-500/20 text-blue-700' :
                client.business_type === 'salon' ? 'bg-pink-500/20 text-pink-700' :
                client.business_type === 'restaurant' ? 'bg-amber-500/20 text-amber-700' :
                'bg-gray-500/20 text-gray-600'
              }`}>
                {BUSINESS_TYPE_LABELS[client.business_type] || client.business_type}
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                client.is_active ? 'bg-green-500/20 text-green-700' : 'bg-gray-500/20 text-gray-500'
              }`}>
                {client.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center mb-3">
              <div className="bg-gray-50 rounded p-2">
                <p className="text-sb-red font-bold text-sm">{client.resource_label_plural || '—'}</p>
                <p className="text-[10px] text-gray-500 uppercase">Resources</p>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="text-sb-orange font-bold text-sm">{client.staff_role_admin || '—'}</p>
                <p className="text-[10px] text-gray-500 uppercase">Admin Role</p>
              </div>
            </div>

            {switchingId === client.id && (
              <div className="flex items-center justify-center gap-2 pt-3 border-t border-gray-200">
                <Loader2 size={14} className="animate-spin text-sb-red" />
                <span className="text-xs text-gray-500">Switching...</span>
              </div>
            )}
          </div>
        ))}

        {/* Add client card */}
        <button onClick={openAdd} className="card border-dashed border-gray-700 hover:border-sb-red/50 flex flex-col items-center justify-center min-h-[200px] text-gray-500 hover:text-sb-red transition-colors">
          <Plus size={32} className="mb-2" />
          <span className="text-sm font-medium">Add Client</span>
        </button>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">{editingClient ? 'Edit Client' : 'Add Client'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700"><X size={18} /></button>
            </div>

            <div className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Business Name *</label>
                  <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-sb-orange" />
                </div>
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Subdomain *</label>
                  <input type="text" value={form.subdomain} onChange={e => setForm(f => ({ ...f, subdomain: e.target.value }))} className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-sb-orange font-mono" />
                </div>
              </div>

              {/* Business Type */}
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Business Type</label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(BUSINESS_TYPE_LABELS) as BusinessType[]).map(bt => (
                    <button
                      key={bt}
                      onClick={() => handleBusinessTypeChange(bt)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        form.business_type === bt
                          ? 'text-white'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                      style={form.business_type === bt ? { backgroundColor: branding.primary_color + '1A', color: branding.primary_color } : undefined}
                    >
                      {BUSINESS_TYPE_LABELS[bt]}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-600 mt-1">Changing business type auto-fills branding defaults</p>
              </div>

              {/* Branding Fields */}
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-sm font-bold text-gray-900 mb-3">Branding</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="text-sm text-gray-600 mb-1 block">Resource Label (Singular)</label>
                    <input type="text" value={form.resource_label} onChange={e => setForm(f => ({ ...f, resource_label: e.target.value }))} className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-sb-orange" />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 mb-1 block">Resource Label (Plural)</label>
                    <input type="text" value={form.resource_label_plural} onChange={e => setForm(f => ({ ...f, resource_label_plural: e.target.value }))} className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-sb-orange" />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 mb-1 block">Admin Role Title</label>
                    <input type="text" value={form.staff_role_admin} onChange={e => setForm(f => ({ ...f, staff_role_admin: e.target.value }))} className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-sb-orange" />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 mb-1 block">Worker Role Title</label>
                    <input type="text" value={form.staff_role_worker} onChange={e => setForm(f => ({ ...f, staff_role_worker: e.target.value }))} className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-sb-orange" />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 mb-1 block">Booking Verb / CTA</label>
                    <input type="text" value={form.booking_verb} onChange={e => setForm(f => ({ ...f, booking_verb: e.target.value }))} className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-sb-orange" />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 mb-1 block">Pricing Model</label>
                    <select value={form.pricing_model} onChange={e => setForm(f => ({ ...f, pricing_model: e.target.value }))} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-sb-orange">
                      <option value="per_person">Per Person</option>
                      <option value="per_slot">Per Slot</option>
                      <option value="flat">Flat Rate</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 mb-1 block">Duration Unit</label>
                    <select value={form.duration_unit} onChange={e => setForm(f => ({ ...f, duration_unit: e.target.value }))} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-sb-orange">
                      <option value="minutes">Minutes</option>
                      <option value="slots">Slots</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 mb-1 block">Logo URL</label>
                    <input type="text" value={form.logo_url} onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))} className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-sb-orange" placeholder="https://..." />
                  </div>
                </div>
              </div>

              {/* Customer Fields */}
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-sm font-bold text-gray-900 mb-3">Customer Form Fields</h3>
                <div>
                  <label className="text-sm text-gray-600 mb-1 block">Comma-separated field names</label>
                  <input type="text" value={form.customer_fields} onChange={e => setForm(f => ({ ...f, customer_fields: e.target.value }))} className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-sb-orange" />
                  <p className="text-[10px] text-gray-600 mt-1">Examples: name,email,phone or name,email,phone,id_number,medical_aid</p>
                </div>
              </div>

              {/* Toggles */}
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-sm font-bold text-gray-900 mb-3">Display Options</h3>
                <div className="flex flex-wrap items-center gap-6">
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-gray-600">Show Difficulty</label>
                    <button onClick={() => setForm(f => ({ ...f, show_difficulty: !f.show_difficulty }))} className={`relative w-12 h-6 rounded-full transition-colors ${form.show_difficulty ? 'bg-green-500' : 'bg-gray-600'}`}>
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${form.show_difficulty ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-gray-600">Show Player Count</label>
                    <button onClick={() => setForm(f => ({ ...f, show_player_count: !f.show_player_count }))} className={`relative w-12 h-6 rounded-full transition-colors ${form.show_player_count ? 'bg-green-500' : 'bg-gray-600'}`}>
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${form.show_player_count ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-gray-600">Active</label>
                    <button onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))} className={`relative w-12 h-6 rounded-full transition-colors ${form.is_active ? 'bg-green-500' : 'bg-gray-600'}`}>
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${form.is_active ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Primary Color */}
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-sm font-bold text-gray-900 mb-3">Primary Color</h3>
                <div className="flex gap-2 flex-wrap">
                  {BRAND_COLORS.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, primary_color: c }))} className={`w-8 h-8 rounded-full transition-transform ${form.primary_color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-white scale-110' : 'hover:scale-110'}`} style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 rounded-lg bg-gray-50 text-gray-500 hover:text-gray-900 text-sm">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.name || !form.subdomain} className="flex-1 btn-sb py-2 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                {saving ? 'Saving...' : editingClient ? 'Update Client' : 'Add Client'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
