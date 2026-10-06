import { AnimatePresence, motion } from 'motion/react'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Kind = 'ok' | 'error' | 'info'
interface Toast {
  id: number
  kind: Kind
  text: string
}

const ToastContext = createContext<(text: string, kind?: Kind) => void>(() => {})

const kindStyle: Record<Kind, string> = {
  ok: 'bg-lime',
  error: 'bg-tomato',
  info: 'bg-sky',
}
const kindIcon: Record<Kind, string> = { ok: '✓', error: '✕', info: '★' }

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((text: string, kind: Kind = 'ok') => {
    const id = nextId++
    setToasts((t) => [...t.slice(-3), { id, kind, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800)
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 left-4 z-[60] flex flex-col items-end gap-3 sm:left-auto">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ x: 120, rotate: 6, opacity: 0 }}
              animate={{ x: 0, rotate: 0, opacity: 1 }}
              exit={{ x: 120, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
              className={`brut pointer-events-auto flex max-w-sm items-start gap-3 px-4 py-3 font-bold ${kindStyle[t.kind]}`}
              role="status"
            >
              <span className="grid size-6 shrink-0 place-items-center bg-ink text-xs text-cream">{kindIcon[t.kind]}</span>
              <span>{t.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext(ToastContext)
