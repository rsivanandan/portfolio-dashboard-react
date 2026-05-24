import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { IconCircleCheck, IconCircleX, IconInfoCircle, IconX } from '@tabler/icons-react'
import { cn } from '../utils/format'

// ── Types ────────────────────────────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
  exiting?: boolean
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void
}

// ── Context ───────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

// ── Provider ──────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const counter = useRef(0)

  const dismiss = useCallback((id: number) => {
    // Trigger exit animation then remove
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t))
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 280)
  }, [])

  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = ++counter.current
    setToasts(prev => {
      // Max 3 toasts — remove oldest if needed
      const next = prev.length >= 3 ? prev.slice(1) : prev
      return [...next, { id, message, variant }]
    })
    setTimeout(() => dismiss(id), 4000)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container — bottom-right, above everything */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// ── Single Toast ─────────────────────────────────────────────────────────────

const config: Record<ToastVariant, { icon: React.ElementType; cls: string }> = {
  success: {
    icon: IconCircleCheck,
    cls: 'border-emerald-500/30 bg-card text-foreground [&_svg]:text-emerald-500',
  },
  error: {
    icon: IconCircleX,
    cls: 'border-rose-500/30 bg-card text-foreground [&_svg]:text-rose-500',
  },
  info: {
    icon: IconInfoCircle,
    cls: 'border-primary/30 bg-card text-foreground [&_svg]:text-primary',
  },
}

function ToastItem({ toast: t, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const { icon: Icon, cls } = config[t.variant]
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg shadow-black/10 min-w-[260px] max-w-[340px]',
        t.exiting ? 'toast-exit' : 'toast-enter',
        cls,
      )}
    >
      <Icon size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
      <p className="text-sm flex-1 leading-snug">{t.message}</p>
      <button
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5"
      >
        <IconX size={14} />
      </button>
    </div>
  )
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useToast() {
  return useContext(ToastContext)
}
