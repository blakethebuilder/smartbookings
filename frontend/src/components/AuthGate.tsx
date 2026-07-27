import { Navigate, Outlet } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth, type Staff } from '../lib/auth'

interface AuthGateProps {
  allowedRoles: Staff['role'][]
}

export default function AuthGate({ allowedRoles }: AuthGateProps) {
  const { staff, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-sb-orange" size={32} />
      </div>
    )
  }

  if (!staff) {
    return <Navigate to="/login" replace />
  }

  // Normalize old role names from pre-rebrand databases
  const role = (staff.role as string) === 'grandmaster' ? 'admin' : (staff.role as string) === 'gamemaster' ? 'staff' : staff.role

  if (!allowedRoles.includes(role)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 text-center max-w-sm">
          <p className="text-sb-orange font-bold text-lg mb-2">Access Denied</p>
          <p className="text-gray-500 text-sm">
            You don't have permission to view this page. Your role: <span className="text-gray-900 font-medium">{staff.role}</span>
          </p>
        </div>
      </div>
    )
  }

  return <Outlet />
}
