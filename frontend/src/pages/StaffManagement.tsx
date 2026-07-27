import { useEffect, useState } from 'react'
import { Users, Plus, X, Loader2, Shield, ShieldOff, Mail, Phone, Key, Eye, EyeOff } from 'lucide-react'
import pb from '../lib/pocketbase'
import type { Staff } from '../lib/auth'
import { useBranding } from '../lib/branding'

export default function StaffManagement() {
  const { branding } = useBranding()
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'gamemaster' as Staff['role'], password: '' })
  const [saving, setSaving] = useState(false)
  const [visiblePins, setVisiblePins] = useState<Record<string, boolean>>({})

  const loadStaff = async () => {
    try {
      const list = await pb.collection('staff').getFullList<Staff>({ sort: '-id' })
      setStaffList(list)
    } catch (e) {
      console.error('Failed to load staff:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadStaff() }, [])

  const openAdd = () => {
    setEditingStaff(null)
    setForm({ name: '', email: '', phone: '', role: 'gamemaster', password: '' })
    setShowModal(true)
  }

  const openEdit = (s: Staff) => {
    setEditingStaff(s)
    setForm({ name: s.name, email: s.email, phone: s.phone, role: s.role, password: s.password })
    setShowModal(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const colors = ['#e63946', '#f4a261', '#2a9d8f', '#264653', '#e9c46a', '#6a4c93']
      const data = {
        ...form,
        avatar_color: editingStaff?.avatar_color || colors[Math.floor(Math.random() * colors.length)],
        is_active: editingStaff?.is_active ?? true,
      }

      if (editingStaff) {
        await pb.collection('staff').update(editingStaff.id, data)
      } else {
        await pb.collection('staff').create(data)
      }
      setShowModal(false)
      loadStaff()
    } catch (e) {
      console.error('Failed to save staff:', e)
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (s: Staff) => {
    await pb.collection('staff').update(s.id, { is_active: !s.is_active })
    loadStaff()
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
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900">Staff Management</h1>
          <p className="text-gray-500 mt-1">{staffList.length} team members</p>
        </div>
        <button onClick={openAdd} className="btn-gr8 flex items-center gap-2">
          <Plus size={16} />
          Add Staff
        </button>
      </div>

      <div className="card-dark">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Staff</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Email</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Phone</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Role</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Password</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Status</th>
                <th className="text-right py-3 px-4 text-gray-500 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {staffList.map(s => (
                <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: s.avatar_color }}
                      >
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-gray-900 font-medium">{s.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-600">{s.email}</td>
                  <td className="py-3 px-4 text-gray-600">{s.phone || '—'}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                      s.role === 'grandmaster'
                        ? 'bg-orange-100 text-gr8-orange'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {s.role === 'grandmaster' ? branding.staff_role_admin : branding.staff_role_worker}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-gray-500">
                    <button
                      onClick={() => setVisiblePins(prev => ({...prev, [s.id]: !prev[s.id]}))}
                      className="hover:text-gray-900 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                    >
                      {visiblePins[s.id] ? s.password : '••••••••'}
                      {visiblePins[s.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                      s.is_active ? 'bg-green-500/20 text-green-700' : 'bg-gray-500/20 text-gray-500'
                    }`}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => toggleActive(s)}
                        className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-500 hover:text-gray-900 transition-colors"
                        title={s.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {s.is_active ? <ShieldOff size={14} /> : <Shield size={14} />}
                      </button>
                      <button
                        onClick={() => openEdit(s)}
                        className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-500 hover:text-gray-900 transition-colors"
                      >
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card-dark w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">
                {editingStaff ? 'Edit Staff Member' : 'Add Staff Member'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>

            <form key={editingStaff?.id || 'new'} onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="text-sm text-gray-600 mb-1 block">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-gr8-orange transition-colors"
                  required
                />
              </div>

              <div>
                <label className="text-sm text-gray-600 mb-1 block">Email</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg pl-10 pr-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-gr8-orange transition-colors"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-600 mb-1 block">Phone</label>
                <div className="relative">
                  <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg pl-10 pr-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-gr8-orange transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-600 mb-1 block">Role</label>
                <select
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value as Staff['role'] }))}
                  className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-gr8-orange transition-colors"
                >
                  <option value="gamemaster">{branding.staff_role_worker}</option>
                  <option value="grandmaster">{branding.staff_role_admin}</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-600 mb-1 block">Password</label>
                <div className="relative">
                  <Key size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="password"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg pl-10 pr-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-gr8-orange transition-colors"
                    placeholder="Enter password"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-gray-50 text-gray-500 hover:text-gray-900 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !form.name || !form.email || !form.password}
                  className="flex-1 btn-gr8 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                  {saving ? 'Saving...' : editingStaff ? 'Update' : 'Add Staff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
