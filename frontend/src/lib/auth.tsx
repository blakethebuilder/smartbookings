import { useState, useEffect, createContext, useContext } from 'react'
import pb from './pocketbase'

export interface Staff {
  id: string
  name: string
  email: string
  phone: string
  role: 'grandmaster' | 'gamemaster'
  avatar_color: string
  is_active: boolean
  password: string
  client_id?: string
  is_superadmin?: boolean
  created: string
  updated: string
}

interface AuthContextType {
  staff: Staff | null
  currentClient: any | null
  login: (email: string, password: string) => Promise<{success: boolean; error?: string}>
  logout: () => void
  isGrandmaster: boolean
  isSuperadmin: boolean
  switchClient: (clientId: string) => Promise<void>
  loading: boolean
}

export const AuthContext = createContext<AuthContextType>({
  staff: null,
  currentClient: null,
  login: async () => ({ success: false }),
  logout: () => {},
  isGrandmaster: false,
  isSuperadmin: false,
  switchClient: async () => {},
  loading: true,
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [staff, setStaff] = useState<Staff | null>(null)
  const [currentClient, setCurrentClient] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check stored session
    const stored = localStorage.getItem('gr8_staff')
    if (stored) {
      try {
        const s = JSON.parse(stored)
        setStaff(s)
      } catch {}
    }
    // Restore current client
    const clientStored = localStorage.getItem('gr8_current_client')
    if (clientStored) {
      try {
        setCurrentClient(JSON.parse(clientStored))
      } catch {}
    }
    setLoading(false)
  }, [])

  const isSuperadmin = staff?.is_superadmin === true

  const switchClient = async (clientId: string) => {
    try {
      const client = await pb.collection('clients').getOne(clientId)
      setCurrentClient(client)
      localStorage.setItem('gr8_current_client', JSON.stringify(client))
    } catch (err: any) {
      console.error('[Auth] switchClient failed:', err)
    }
  }

  const login = async (email: string, password: string): Promise<{success: boolean; error?: string}> => {
    try {
      const result = await pb.collection('staff').getFirstListItem<Staff>(
        `email = "${email}" && is_active = true`
      )

      if (!result) {
        return { success: false, error: 'Staff account not found' }
      }

      // Accept either password or legacy pin_code field
      const pw = (result as any).password || (result as any).pin_code
      if (pw !== password) {
        return { success: false, error: 'Invalid password' }
      }

      setStaff(result)
      localStorage.setItem('gr8_staff', JSON.stringify(result))

      // Load client if staff has a client_id
      if (result.client_id) {
        try {
          const client = await pb.collection('clients').getOne(result.client_id)
          setCurrentClient(client)
          localStorage.setItem('gr8_current_client', JSON.stringify(client))
        } catch (err) {
          console.error('[Auth] Failed to load client for staff:', err)
        }
      }

      return { success: true }
    } catch (err: any) {
      console.error('[Auth] Login failed:', err)
      return { success: false, error: err?.message || 'Connection failed — is PocketBase running?' }
    }
  }

  const logout = () => {
    setStaff(null)
    setCurrentClient(null)
    localStorage.removeItem('gr8_staff')
    localStorage.removeItem('gr8_current_client')
  }

  return (
    <AuthContext.Provider value={{
      staff,
      currentClient,
      login,
      logout,
      isGrandmaster: staff?.role === 'grandmaster',
      isSuperadmin,
      switchClient,
      loading,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
