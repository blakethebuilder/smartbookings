import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastProps {
  message: string
  type: ToastType
  leaving?: boolean
  onClose: () => void
}

const iconMap: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
}

const stylesMap: Record<ToastType, { border: string; bg: string; icon: string }> = {
  success: { border: 'border-green-200', bg: 'bg-green-50', icon: 'text-green-600' },
  error: { border: 'border-red-200', bg: 'bg-red-50', icon: 'text-sb-red' },
  info: { border: 'border-blue-200', bg: 'bg-blue-50', icon: 'text-blue-600' },
  warning: { border: 'border-yellow-200', bg: 'bg-yellow-50', icon: 'text-sb-orange' },
}

export default function Toast({ message, type, leaving, onClose }: ToastProps) {
  const Icon = iconMap[type]
  const s = stylesMap[type]

  return (
    <div
      className={`bg-white border shadow-lg rounded-xl toast-enter pointer-events-auto flex items-start gap-3 px-4 py-3 transition-all duration-300 ${
        leaving ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'
      } ${s.border} ${s.bg}`}
    >
      <Icon size={18} className={`shrink-0 mt-0.5 ${s.icon}`} />
      <p className="text-sm text-gray-900 flex-1">{message}</p>
      <button
        onClick={onClose}
        className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  )
}
