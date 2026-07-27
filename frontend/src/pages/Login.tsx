import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, User, Loader2, AlertCircle } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useBranding } from '../lib/branding'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const { branding } = useBranding()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await login(email, password)
    if (result.success) {
      // Get staff from localStorage to route by role
      const stored = localStorage.getItem('sb_staff')
      const staff = stored ? JSON.parse(stored) : null
      navigate(staff?.role === 'admin' ? '/admin' : '/dashboard')
    } else {
      setError(result.error || 'Invalid email or PIN code')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            {branding.business_name}
          </h1>
          <p className="text-gray-500 mt-1.5 text-sm">Staff Portal</p>
        </div>

        {/* Login card */}
        <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-orange-100">
              <Lock size={18} className="text-sb-orange" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Sign In</h2>
              <p className="text-xs text-gray-500">Enter your credentials</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Email</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="pl-10"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-1 block">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="pl-10"
                  placeholder="Enter your password"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full"
              size="lg"
            >
              {loading && <Loader2 className="animate-spin" />}
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <div className="mt-6 pt-4 border-t border-gray-200 text-center">
            <p className="text-xs text-gray-500">Contact your {branding.staff_role_admin} for credentials</p>
          </div>
        </div>
      </div>
    </div>
  )
}
