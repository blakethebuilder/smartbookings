import { createContext, useContext, useState, useCallback, useRef } from 'react'
import ToastComponent from '../components/Toast'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastItem {
  id: string
  message: string
  type: ToastType
  duration: number
  leaving?: boolean
}

interface ConfirmItem {
  message: string
  resolve: (value: boolean) => void
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, duration?: number) => void
  confirm: (message: string) => Promise<boolean>
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [confirmItem, setConfirmItem] = useState<ConfirmItem | null>(null)
  const counterRef = useRef(0)

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const startDismiss = useCallback((id: string) => {
    setToasts(prev => prev.map(t => (t.id === id ? { ...t, leaving: true } : t)))
    setTimeout(() => removeToast(id), 300)
  }, [removeToast])

  const toast = useCallback(
    (message: string, type: ToastType = 'info', duration = 4000) => {
      counterRef.current += 1
      const id = `toast-${counterRef.current}`
      setToasts(prev => [...prev, { id, message, type, duration }])
      setTimeout(() => startDismiss(id), duration)
    },
    [startDismiss],
  )

  const confirm = useCallback((message: string): Promise<boolean> => {
    return new Promise(resolve => {
      setConfirmItem({ message, resolve })
    })
  }, [])

  const handleConfirm = useCallback(
    (value: boolean) => {
      if (confirmItem) {
        confirmItem.resolve(value)
        setConfirmItem(null)
      }
    },
    [confirmItem],
  )

  return (
    <ToastContext.Provider value={{ toast, confirm }}>
      {children}

      {/* Toast notifications */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        {toasts.map(t => (
          <ToastComponent
            key={t.id}
            message={t.message}
            type={t.type}
            leaving={t.leaving}
            onClose={() => startDismiss(t.id)}
          />
        ))}
      </div>

      {/* Confirm modal */}
      {confirmItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="card w-full max-w-sm">
            <p className="text-white text-lg mb-6">{confirmItem.message}</p>
            <div className="flex gap-3">
              <button
                onClick={() => handleConfirm(false)}
                className="flex-1 px-4 py-2 rounded-lg bg-white/5 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirm(true)}
                className="flex-1 px-4 py-2 rounded-lg bg-sb-red text-white font-bold hover:bg-red-600 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}
