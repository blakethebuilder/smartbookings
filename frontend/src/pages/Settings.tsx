import { useEffect, useState, useRef } from 'react'
import { Save, Check, Eye, EyeOff, Cog, Trash2, Loader2 } from 'lucide-react'
import pb from '../lib/pocketbase'
import { useBranding, type BusinessType } from '../lib/branding'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

interface Setting {
  id: string
  key: string
  value: string
  description: string
}

// Settings that should be masked as password fields
const SECRET_KEYS = ['payfast_merchant_key', 'payfast_passphrase', 'evolution_api_key']

// Setting descriptions for better UX
const SETTING_LABELS: Record<string, { label: string; hint?: string }> = {
  business_name: { label: 'Business Name' },
  business_hours: { label: 'Operating Hours', hint: 'e.g. Thu-Sun 11:00-18:00' },
  cancellation_admin_fee: { label: 'Cancellation Admin Fee (Rands)', hint: 'Admin fee retained on deposit cancellation' },
  cancellation_hours_before: { label: 'Cancellation Window (hours)', hint: 'Hours before game when cancellation is allowed' },
  default_currency: { label: 'Default Currency', hint: 'ISO code e.g. ZAR' },
  default_reset_buffer: { label: 'Reset Buffer (minutes)', hint: 'Time between games for room reset' },
  game_duration: { label: 'Game Duration (minutes)' },
  payfast_merchant_id: { label: 'Merchant ID', hint: 'Payfast merchant ID' },
  payfast_merchant_key: { label: 'Merchant Key', hint: 'Payfast merchant key (secret)' },
  payfast_passphrase: { label: 'Passphrase', hint: 'Payfast passphrase (secret)' },
  payfast_mode: { label: 'Payment Mode', hint: 'sandbox or live' },
  evolution_api_url: { label: 'API URL', hint: 'Evolution API base URL' },
  evolution_api_key: { label: 'API Key', hint: 'Evolution API key (secret)' },
  evolution_instance: { label: 'Instance Name', hint: 'Evolution API instance' },
  whatsapp_enabled: { label: 'Enable WhatsApp', hint: 'true or false' },
  reminder_hours_before: { label: 'Reminder Hours', hint: 'Hours before game to send reminder' },
  waiver_enabled: { label: 'Enable Waivers', hint: 'true or false' },
  waiver_hours_before: { label: 'Waiver Reminder Hours', hint: 'Hours before game to send waiver link' },
  // Branding fields
  business_type: { label: 'Business Type', hint: 'escape_room, medical, salon, restaurant, or custom' },
  resource_label: { label: 'Resource Label (Singular)', hint: 'e.g. Room, Doctor, Stylist, Table' },
  resource_label_plural: { label: 'Resource Label (Plural)', hint: 'e.g. Rooms, Doctors, Stylists, Tables' },
  staff_role_admin: { label: 'Admin Role Name', hint: 'e.g. Admin, Manager, Owner' },
  staff_role_worker: { label: 'Worker Role Name', hint: 'e.g. Staff, Doctor, Stylist, Host' },
  booking_verb: { label: 'Booking Verb', hint: 'e.g. Book Now, Book Appointment, Reserve Table' },
  pricing_model: { label: 'Pricing Model', hint: 'per_person, per_slot, or flat' },
  primary_color: { label: 'Primary Color', hint: 'Hex color code, e.g. #E53935' },
  duration_unit: { label: 'Duration Unit', hint: 'minutes or slots' },
  show_difficulty: { label: 'Show Difficulty', hint: 'true or false' },
  show_player_count: { label: 'Show Player Count', hint: 'true or false' },
  logo_url: { label: 'Logo URL', hint: 'URL to your logo image' },
  customer_fields: { label: 'Customer Fields', hint: 'Comma-separated list of fields to collect' },
}

const GROUP_ORDER = ['General', 'Payfast', 'WhatsApp', 'Evolution API']

export default function Settings() {
  const { branding } = useBranding()
  const [settings, setSettings] = useState<Setting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const initRef = useRef(false)
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [resetMessage, setResetMessage] = useState<string | null>(null)

  const handleReset = async () => {
    setShowResetDialog(false)
    setResetting(true)
    setResetMessage(null)
    try {
      const res = await fetch('/api/reset-demo-data', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setResetMessage(`Reset complete!\nWiped: ${JSON.stringify(data.wiped)}\nRegenerated: ${data.slotsCreated} time slots`)
      } else {
        setResetMessage('Reset failed: ' + (data.error || 'Unknown error'))
      }
    } catch (e: any) {
      setResetMessage('Reset failed: ' + e.message)
    } finally {
      setResetting(false)
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const s = await pb.collection('settings').getFullList<Setting>({ sort: 'key' })
        setSettings(s)
      } catch (e) {
        console.error('Failed to load settings:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Initialize collapsed state for groups with all empty values
  useEffect(() => {
    if (initRef.current || settings.length === 0) return
    initRef.current = true

    const initial: Record<string, boolean> = {}
    const grouped = settings.reduce<Record<string, Setting[]>>((acc, s) => {
      const group = s.key.startsWith('payfast') ? 'Payfast' :
                    s.key.startsWith('evolution') ? 'Evolution API' :
                    s.key.startsWith('whatsapp') || s.key.startsWith('reminder') ? 'WhatsApp' :
                    s.key.startsWith('waiver') ? 'WhatsApp' :
                    'General'
      if (!acc[group]) acc[group] = []
      acc[group].push(s)
      return acc
    }, {})

    for (const [group, items] of Object.entries(grouped)) {
      if (['Evolution API', 'WhatsApp'].includes(group) && items.every(s => !s.value.trim())) {
        initial[group] = true
      }
    }
    setCollapsedGroups(initial)
  }, [settings])

  const updateSetting = (id: string, value: string) => {
    setSettings(prev => prev.map(s => s.id === id ? { ...s, value } : s))
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      for (const s of settings) {
        await pb.collection('settings').update(s.id, { value: s.value })
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      console.error('Failed to save:', e)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading settings...</div>
      </div>
    )
  }

  const grouped = settings.reduce<Record<string, Setting[]>>((acc, s) => {
    const group = s.key.startsWith('payfast') ? 'Payfast' :
                  s.key.startsWith('evolution') ? 'Evolution API' :
                  s.key.startsWith('whatsapp') || s.key.startsWith('reminder') ? 'WhatsApp' :
                  s.key.startsWith('waiver') ? 'WhatsApp' :
                  'General'
    if (!acc[group]) acc[group] = []
    acc[group].push(s)
    return acc
  }, {})

  const sortedGroups = Object.entries(grouped).sort(([a], [b]) => {
    return GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b)
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-500 mt-1">Configure your booking system</p>
        </div>
        {saved ? (
          <span className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm bg-green-500/20 text-green-600 border border-green-500/30">
            <Check size={16} /> Saved!
          </span>
        ) : (
          <Button onClick={handleSave} disabled={saving}>
            <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        )}
      </div>

      <div className="space-y-8">
        {sortedGroups.map(([group, items]) => {
          const isCollapsed = collapsedGroups[group]

          return (
            <Card key={group}>
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-lg">
                  {group === 'Payfast' && <span className="text-lg">💳</span>}
                  {group === 'WhatsApp' && <span className="text-lg">📱</span>}
                  {group === 'Evolution API' && <span className="text-lg">🔗</span>}
                  {group === 'General' && <span className="text-lg">⚙️</span>}
                  {group}
                </CardTitle>
              </CardHeader>
              <CardContent>
              {isCollapsed ? (
                <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-gray-600 text-sm">
                        {group === 'Evolution API'
                          ? 'Not configured — set up to enable WhatsApp notifications'
                          : 'Not configured — set up WhatsApp messaging features'}
                      </p>
                    </div>
                    <Button
                      onClick={() => setCollapsedGroups(prev => ({ ...prev, [group]: false }))}
                      size="sm"
                      className="shrink-0"
                    >
                      <Cog size={14} />
                      Configure
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {items.map(s => {
                    const meta = SETTING_LABELS[s.key]
                    const isSecret = SECRET_KEYS.includes(s.key)
                    const isPassword = isSecret && !showSecrets[s.key]

                    return (
                      <div key={s.id} className="flex flex-col gap-1">
                        <label className="text-sm text-gray-600 font-medium">
                          {meta?.label || s.description || s.key}
                        </label>
                        {s.key === 'business_type' ? (
                          <select
                            value={s.value}
                            onChange={async (e) => {
                              updateSetting(s.id, e.target.value)
                              await pb.collection('settings').update(s.id, { value: e.target.value })
                              window.location.reload()
                            }}
                            className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:border-sb-orange transition-colors"
                          >
                            <option value="medical">Medical</option>
                            <option value="salon">Salon</option>
                            <option value="restaurant">Restaurant</option>
                            <option value="custom">Custom</option>
                            <option value="escape_room">Escape Room</option>
                          </select>
                        ) : (
                          <div className="relative">
                            <Input
                              type={isPassword ? 'password' : 'text'}
                              value={s.value}
                              onChange={e => updateSetting(s.id, e.target.value)}
                              className="pr-10"
                              placeholder={meta?.hint || s.key}
                            />
                            {isSecret && (
                              <button
                                type="button"
                                onClick={() => setShowSecrets(prev => ({ ...prev, [s.key]: !prev[s.key] }))}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-900 transition-colors"
                              >
                                {showSecrets[s.key] ? <EyeOff size={16} /> : <Eye size={16} />}
                              </button>
                            )}
                          </div>
                        )}
                        {meta?.hint && !isSecret && s.key !== 'business_type' && (
                          <p className="text-xs text-gray-600">{meta.hint}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
          )
        })}
      </div>

      {/* Reset Demo Data */}
      <div className="border border-red-200 bg-red-50 rounded-lg p-6 mt-8">
        <div className="flex items-center gap-3 mb-4">
          <Trash2 size={18} className="text-red-600" />
          <h2 className="text-lg font-bold text-gray-900">Reset Demo Data</h2>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Wipes all bookings, waivers, game hosts, GM blocks, and time slots.
          Keeps rooms, staff, and settings. Fresh time slots will be regenerated for the next 60 days.
        </p>
        <button
          onClick={() => setShowResetDialog(true)}
          disabled={resetting}
          className="px-4 py-2 rounded-lg bg-red-500/20 text-red-600 border border-red-500/30 hover:bg-red-500/30 font-bold text-sm flex items-center gap-2 disabled:opacity-50 transition-colors"
        >
          {resetting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          {resetting ? 'Resetting...' : 'Reset All Demo Data'}
        </button>
      </div>

      {/* Reset Confirmation Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Demo Data?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            This will DELETE all bookings, waivers, game hosts, GM blocks, and time slots. Rooms, staff, and settings will be kept. Fresh time slots will be regenerated. Are you sure?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReset}>Yes, Reset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Result Dialog */}
      <Dialog open={!!resetMessage} onOpenChange={(open) => { if (!open) setResetMessage(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Result</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 whitespace-pre-line">{resetMessage}</p>
          <DialogFooter>
            <Button onClick={() => setResetMessage(null)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
