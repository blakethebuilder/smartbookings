import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import pb from './pocketbase'
import { useAuth } from './auth'

export type BusinessType = 'escape_room' | 'medical' | 'salon' | 'restaurant' | 'custom'
export type PricingModel = 'per_person' | 'per_slot' | 'flat'

export interface BrandingConfig {
  business_type: BusinessType
  business_name: string
  resource_label: string       // singular: "Room" | "Doctor"
  resource_label_plural: string // plural: "Rooms" | "Doctors"
  staff_role_admin: string      // "Grandmaster" | "Admin"
  staff_role_worker: string     // "Game Master" | "Doctor"
  booking_verb: string          // "Book Now" | "Book Appointment"
  pricing_model: PricingModel
  primary_color: string
  logo_url: string
  customer_fields: string[]
  duration_unit: string         // "minutes" | "slots"
  show_difficulty: boolean
  show_player_count: boolean
}

const DEFAULTS: Record<BusinessType, Partial<BrandingConfig>> = {
  escape_room: {
    resource_label: 'Room',
    resource_label_plural: 'Rooms',
    staff_role_admin: 'Grandmaster',
    staff_role_worker: 'Game Master',
    booking_verb: 'Book Now',
    pricing_model: 'per_person',
    duration_unit: 'minutes',
    show_difficulty: true,
    show_player_count: true,
    customer_fields: ['name', 'email', 'phone'],
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
    customer_fields: ['name', 'email', 'phone', 'id_number', 'medical_aid', 'emergency_contact'],
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
    customer_fields: ['name', 'email', 'phone', 'preferred_stylist'],
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
    customer_fields: ['name', 'email', 'phone', 'party_size', 'dietary_requirements'],
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
    customer_fields: ['name', 'email', 'phone'],
  },
}

async function loadBranding(client?: any): Promise<BrandingConfig> {
  try {
    // If a client object is provided (from auth context), use it directly
    if (client) {
      return mapClientToBranding(client)
    }

    // Try to load from localStorage (stored by auth on login)
    const storedClient = localStorage.getItem('gr8_current_client')
    if (storedClient) {
      try {
        const parsed = JSON.parse(storedClient)
        return mapClientToBranding(parsed)
      } catch {}
    }

    // Fallback: try to detect client by subdomain from hostname
    const hostname = window.location.hostname
    const parts = hostname.split('.')
    if (parts.length > 2) {
      const subdomain = parts[0]
      try {
        const matching = await pb.collection('clients').getFirstListItem(
          `subdomain = "${subdomain}"`
        )
        localStorage.setItem('gr8_current_client', JSON.stringify(matching))
        return mapClientToBranding(matching)
      } catch {
        // No matching client for this subdomain
      }
    }

    // No client found — use custom defaults
    return {
      business_type: 'custom' as BusinessType,
      business_name: 'My Business',
      ...DEFAULTS.custom,
      primary_color: '#FF4500',
      logo_url: '',
    } as BrandingConfig
  } catch {
    return {
      business_type: 'custom' as BusinessType,
      business_name: 'My Business',
      ...DEFAULTS.custom,
      primary_color: '#FF4500',
      logo_url: '',
    } as BrandingConfig
  }
}

function mapClientToBranding(client: any): BrandingConfig {
  const businessType = (client.business_type || 'custom') as BusinessType
  const defaults = DEFAULTS[businessType] || DEFAULTS.custom
  return {
    business_type: businessType,
    business_name: client.business_name || client.name || 'My Business',
    resource_label: client.resource_label || defaults.resource_label!,
    resource_label_plural: client.resource_label_plural || defaults.resource_label_plural!,
    staff_role_admin: client.staff_role_admin || defaults.staff_role_admin!,
    staff_role_worker: client.staff_role_worker || defaults.staff_role_worker!,
    booking_verb: client.booking_verb || defaults.booking_verb!,
    pricing_model: (client.pricing_model || defaults.pricing_model) as PricingModel,
    primary_color: client.primary_color || '#E53935',
    logo_url: client.logo_url || '',
    customer_fields: client.customer_fields
      ? (typeof client.customer_fields === 'string' ? client.customer_fields.split(',').filter(Boolean) : client.customer_fields)
      : defaults.customer_fields!,
    duration_unit: (client.duration_unit || defaults.duration_unit) as string,
    show_difficulty: client.show_difficulty !== undefined ? !!client.show_difficulty : defaults.show_difficulty!,
    show_player_count: client.show_player_count !== undefined ? !!client.show_player_count : defaults.show_player_count!,
  }
}

interface BrandingContextType {
  branding: BrandingConfig
  loading: boolean
}

const defaultBranding: BrandingConfig = DEFAULTS.escape_room as BrandingConfig

const BrandingContext = createContext<BrandingContextType>({
  branding: defaultBranding,
  loading: true,
})

export function useBranding() {
  return useContext(BrandingContext)
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { currentClient } = useAuth()
  const [branding, setBranding] = useState<BrandingConfig>(defaultBranding)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadBranding(currentClient).then(b => {
      setBranding(b)
      // Apply primary color as CSS variable (RGB components for Tailwind opacity support)
      const hex = b.primary_color
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const bVal = parseInt(hex.slice(5, 7), 16)
      document.documentElement.style.setProperty('--gr8-red', `${r} ${g} ${bVal}`)
      setLoading(false)
    })
  }, [currentClient])

  return (
    <BrandingContext.Provider value={{ branding, loading }}>
      {children}
    </BrandingContext.Provider>
  )
}
