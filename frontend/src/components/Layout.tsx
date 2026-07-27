import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, CalendarDays, Calendar, BookOpen, Settings, LogOut,
  Users, Crown, Building2, Menu, X
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useBranding } from '../lib/branding'
import pb from '../lib/pocketbase'

const gmNavItems = [
  { to: '/gm', icon: CalendarDays, label: 'My Games' },
  { to: '/calendar', icon: CalendarDays, label: 'Calendar' },
]

const grandmasterNavItems = [
  { to: '/grandmaster', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/calendar', icon: CalendarDays, label: 'Calendar' },
  { to: '/gm', icon: CalendarDays, label: 'My Games' },
  { to: '/rooms', icon: Calendar, label: 'Rooms' },
  { to: '/bookings', icon: BookOpen, label: 'Bookings' },
  { to: '/staff', icon: Users, label: 'Staff' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function Layout() {
  const { staff, isGrandmaster, isSuperadmin, switchClient, currentClient, logout } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { branding } = useBranding()

  const navItems = isGrandmaster ? (
    isSuperadmin ? [...grandmasterNavItems, { to: '/clients', icon: Building2, label: 'Clients' }] : grandmasterNavItems
  ) : gmNavItems
  const [allClients, setAllClients] = useState<any[]>([])

  useEffect(() => {
    if (isSuperadmin) {
      pb.collection('clients').getFullList({ sort: 'name' }).then(setAllClients).catch(console.error)
    }
  }, [isSuperadmin])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleNav = () => setSidebarOpen(false)

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-gray-900 tracking-tight">
              {branding.business_name}
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              {isGrandmaster ? `${branding.staff_role_admin} Portal` : `${branding.staff_role_worker} HQ`}
            </p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-gray-500 hover:text-gray-900">
            <X size={20} />
          </button>
        </div>

        {/* User info */}
        {staff && (
          <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
              style={{ backgroundColor: staff.avatar_color }}
            >
              {staff.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{staff.name}</p>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                {isGrandmaster ? <Crown size={10} style={{ color: branding.primary_color }} /> : null}
                {isGrandmaster ? branding.staff_role_admin : branding.staff_role_worker}
              </p>
            </div>
          </div>
        )}

        {/* Superadmin client switcher */}
        {isSuperadmin && allClients.length > 0 && (
          <div className="px-4 py-3 border-b border-gray-200">
            <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Switch Client</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {allClients.map(c => (
                <button
                  key={c.id}
                  onClick={() => switchClient(c.id)}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                    currentClient?.id === c.id
                      ? 'text-gray-900'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                  style={currentClient?.id === c.id ? { backgroundColor: branding.primary_color + '1A' } : undefined}
                >
                  {c.business_name || c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => {
            const displayLabel = label === 'Rooms' ? branding.resource_label_plural : label
            return (
            <NavLink
              key={to}
              to={to}
              onClick={handleNav}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? ''
                    : 'text-gray-600 hover:text-gr8-orange hover:bg-orange-50'
                }`
              }
              style={({ isActive }) => isActive ? { backgroundColor: branding.primary_color + '1A', color: branding.primary_color } : undefined}
            >
              <Icon size={18} />
              {displayLabel}
            </NavLink>
          )})}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-gray-800">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-gray-500 hover:text-white hover:bg-white/5 w-full transition-colors"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-3 p-4 border-b border-gray-800 bg-gr8-card">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400 hover:text-white">
            <Menu size={24} />
          </button>
          <h1 className="text-lg font-black text-white tracking-tight">
            {branding.business_name}
          </h1>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-3 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
