import { useState, useEffect, createContext, useContext } from 'react'
import pb from './pocketbase'

export interface Staff {
  id: string
  name: string
  email: string
  phone: string
  role: 'admin' | 'staff'
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
  isAdmin: boolean
  isSuperadmin: boolean
  switchClient: (clientId: string) => Promise<void>
  loading: boolean
}

export const AuthContext = createContext<AuthContextType>({
  staff: null,
  currentClient: null,
  login: async () => ({ success: false }),
  logout: () => {},
  isAdmin: false,
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
    const stored = localStorage.getItem('sb_staff')
    if (stored) {
      try {
        const s = JSON.parse(stored)
        setStaff(s)
      } catch {}
    }
    // Restore current client
    const clientStored = localStorage.getItem('sb_current_client')
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
      localStorage.setItem('sb_current_client', JSON.stringify(client))
    } catch (err: any) {
      console.error('[Auth] switchClient failed:', err)
    }
  }

  const login = async (email: string, password: string): Promise<{success: boolean; error?: string}> => {
    try {
      // Use PocketBase's built-in authWithPassword — the password field
      // is a server-side bcrypt hash, never returned in list responses.
      const authResult = await pb.collection('staff').authWithPassword(email, password)

      // authWithPassword returns { token, record } — record has all fields except password
      const rawRecord = authResult.record as any
      // Normalize old role names for backward compatibility with existing DBs
      if (rawRecord.role === 'grandmaster') rawRecord.role = 'admin'
      if (rawRecord.role === 'gamemaster') rawRecord.role = 'staff'
      const staffRecord = rawRecord as unknown as Staff
      setStaff(staffRecord)
      localStorage.setItem('sb_staff', JSON.stringify(staffRecord))

      // Load client if staff has a client_id
      if (staffRecord.client_id) {
        try {
          const client = await pb.collection('clients').getOne(staffRecord.client_id)
          setCurrentClient(client)
          localStorage.setItem('sb_current_client', JSON.stringify(client))
        } catch (err) {
          console.error('[Auth] Failed to load client for staff:', err)
        }
      }

      return { success: true }
    } catch (err: any) {
      console.error('[Auth] Login failed:', err)
      if (err?.status === 400) {
        return { success: false, error: 'Invalid email or password' }
      }
      return { success: false, error: err?.message || 'Connection failed — is PocketBase running?' }
    }
  }

  const logout = () => {
    pb.authStore.clear()
    setStaff(null)
    setCurrentClient(null)
    localStorage.removeItem('sb_staff')
    localStorage.removeItem('sb_current_client')
  }

  return (
    <AuthContext.Provider value={{
      staff,
      currentClient,
      login,
      logout,
      isAdmin: staff?.role === 'admin',
      isSuperadmin,
      switchClient,
      loading,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
