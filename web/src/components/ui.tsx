import { animate, AnimatePresence, motion, useInView, useMotionValue, useTransform, type HTMLMotionProps } from 'motion/react'
import { forwardRef, useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { X } from 'lucide-react'
import type { RosterStatus } from '../lib/api'
import { accentFor, initials, statusLabel, statusTone } from '../lib/format'
import { usePhoto } from '../lib/hooks'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
export { cx }

export type Tone = 'sun' | 'pink' | 'sky' | 'lime' | 'tang' | 'violet' | 'tomato' | 'ink' | 'cream'

const toneBg: Record<Tone, string> = {
  sun: 'bg-sun text-ink',
  pink: 'bg-pink text-ink',
  sky: 'bg-sky text-ink',
  lime: 'bg-lime text-ink',
  tang: 'bg-tang text-ink',
  violet: 'bg-violet text-ink',
  tomato: 'bg-tomato text-ink',
  ink: 'bg-ink text-cream',
  cream: 'bg-cream text-ink',
}

interface ButtonProps extends HTMLMotionProps<'button'> {
  tone?: Tone
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
}

/** The press: the button drops onto its shadow. */
export function Button({ tone = 'sun', size = 'md', icon, className, children, disabled, ...rest }: ButtonProps) {
  const sizes = {
    sm: 'px-3 py-1.5 text-sm gap-1.5',
    md: 'px-4 py-2.5 text-base gap-2',
    lg: 'px-6 py-3.5 text-lg gap-2.5',
  }
  return (
    <motion.button
      whileHover={disabled ? undefined : { x: -2, y: -2, boxShadow: '6px 6px 0 0 #111' }}
      whileTap={disabled ? undefined : { x: 4, y: 4, boxShadow: '0px 0px 0 0 #111' }}
      transition={{ type: 'spring', stiffness: 600, damping: 30 }}
      disabled={disabled}
      className={cx(
        'brut inline-flex cursor-pointer items-center justify-center font-bold uppercase tracking-wide select-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        toneBg[tone],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children as ReactNode}
    </motion.button>
  )
}

export function IconButton({ label, tone = 'cream', className, children, ...rest }: HTMLMotionProps<'button'> & { label: string; tone?: Tone }) {
  return (
    <motion.button
      aria-label={label}
      title={label}
      whileHover={{ rotate: -6 }}
      whileTap={{ scale: 0.85 }}
      className={cx('inline-grid size-9 cursor-pointer place-items-center border-[3px] border-ink shadow-brut-sm', toneBg[tone], className)}
      {...rest}
    >
      {children as ReactNode}
    </motion.button>
  )
}

export function Card({ tone = 'cream', className, children, ...rest }: HTMLMotionProps<'div'> & { tone?: Tone }) {
  return (
    <motion.div className={cx('brut', toneBg[tone], className)} {...rest}>
      {children}
    </motion.div>
  )
}

export function Badge({ tone = 'sun', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 border-2 border-ink px-2 py-0.5 font-mono text-[11px] font-bold uppercase leading-tight tracking-wider whitespace-nowrap',
        toneBg[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/**
 * A person's face crop when we have one (`photoId` = student id), otherwise
 * initials on a colour that stays the same for them everywhere.
 */
export function Avatar({
  name,
  seed,
  size = 'md',
  photoId,
  className,
}: {
  name: string
  seed?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  photoId?: number | false
  className?: string
}) {
  const sizes = { xs: 'size-6 text-[9px] border-2', sm: 'size-8 text-xs border-[3px]', md: 'size-11 text-sm border-[3px]', lg: 'size-20 text-2xl border-[3px]', xl: 'size-28 text-4xl border-4' }
  const photo = usePhoto(photoId || undefined, Boolean(photoId))
  return (
    <span
      className={cx(
        'relative inline-grid shrink-0 place-items-center overflow-hidden border-ink font-display',
        accentFor(seed ?? name),
        sizes[size],
        className,
      )}
      title={name}
    >
      {photo ? <img src={photo} alt="" className="absolute inset-0 size-full object-cover" /> : initials(name)}
    </span>
  )
}

export function StatusBadge({ status, className }: { status: RosterStatus; className?: string }) {
  return (
    <Badge tone={statusTone[status]} className={className}>
      {statusIcon[status]} {statusLabel[status]}
    </Badge>
  )
}

const statusIcon: Record<RosterStatus, string> = { present: '✓', late: '◷', excused: '✉', absent: '✕', waiting: '…' }

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse border-[3px] border-ink/20 bg-ink/5', className)} aria-hidden />
}

/** Page-shaped placeholder while the first load is in flight. */
export function PageSkeleton({ tiles = 4 }: { tiles?: number }) {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: tiles }, (_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  id,
}: {
  value: T
  onChange: (v: T) => void
  options: readonly (readonly [T, ReactNode])[]
  id: string
}) {
  return (
    <div className="brut flex w-fit flex-wrap bg-cream" role="tablist">
      {options.map(([v, label], i) => (
        <button
          key={v}
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={cx('relative cursor-pointer px-3 py-2 text-sm font-bold uppercase', i > 0 && 'border-l-[3px] border-ink')}
        >
          {value === v && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 bg-ink" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <span className={cx('relative flex items-center gap-1.5', value === v && 'text-cream')}>{label}</span>
        </button>
      ))}
    </div>
  )
}

/** Horizontal percentage bar with an optional threshold tick. */
export function PercentBar({ value, threshold, className }: { value: number | null; threshold?: number; className?: string }) {
  const danger = threshold !== undefined && value !== null && value < threshold
  return (
    <div className={cx('relative h-3.5 border-[3px] border-ink bg-paper', className)}>
      <motion.div
        className={cx('h-full', danger ? 'bg-tomato' : 'bg-lime')}
        initial={{ width: 0 }}
        animate={{ width: `${value ?? 0}%` }}
        transition={{ type: 'spring', stiffness: 80, damping: 16, delay: 0.1 }}
      />
      {threshold !== undefined && (
        <span className="absolute -inset-y-1 w-[3px] bg-ink" style={{ left: `${threshold}%` }} title={`${threshold}% required`} />
      )}
    </div>
  )
}

export function Confirm({
  open,
  title,
  children,
  confirmLabel,
  tone = 'tomato',
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  tone?: Tone
  onConfirm: () => Promise<unknown> | void
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal open={open} onClose={onClose} title={title} tone={tone}>
      <div className="space-y-4">
        <div>{children}</div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-3">
          <Button tone="cream" onClick={onClose}>
            Cancel
          </Button>
          <Button
            tone={tone}
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                await onConfirm()
                onClose()
              } catch (e) {
                setError((e as Error).message)
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function Textarea({ label, className, id, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  const field = (
    <textarea
      id={id}
      className={cx(
        'w-full border-[3px] border-ink bg-cream px-3 py-2.5 font-medium shadow-brut-sm outline-none focus:bg-white focus:shadow-brut',
        className,
      )}
      {...rest}
    />
  )
  if (!label) return field
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1.5 block font-mono text-xs font-bold uppercase tracking-wider">{label}</span>
      {field}
    </label>
  )
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b-[3px] border-ink px-5 py-4">
      <h2 className="font-display text-xl uppercase sm:text-2xl">{children}</h2>
      {aside}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: string }>(
  function Input({ label, className, id, ...rest }, ref) {
    const field = (
      <input
        ref={ref}
        id={id}
        className={cx(
          'w-full border-[3px] border-ink bg-cream px-3 py-2.5 font-medium shadow-brut-sm outline-none transition-shadow',
          'placeholder:text-ink/40 focus:shadow-brut focus:bg-white',
          className,
        )}
        {...rest}
      />
    )
    if (!label) return field
    return (
      <label className="block" htmlFor={id}>
        <span className="mb-1.5 block font-mono text-xs font-bold uppercase tracking-wider">{label}</span>
        {field}
      </label>
    )
  },
)

export function Select({ label, className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  const field = (
    <select
      className={cx(
        'w-full cursor-pointer border-[3px] border-ink bg-cream px-3 py-2.5 font-medium shadow-brut-sm outline-none focus:shadow-brut',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  )
  if (!label) return field
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-xs font-bold uppercase tracking-wider">{label}</span>
      {field}
    </label>
  )
}

export function Modal({
  open,
  onClose,
  title,
  tone = 'sun',
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  tone?: Tone
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/60 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cx('brut-lg w-full bg-cream', wide ? 'max-w-2xl' : 'max-w-md')}
            initial={{ y: 60, rotate: -3, opacity: 0 }}
            animate={{ y: 0, rotate: 0, opacity: 1 }}
            exit={{ y: 40, rotate: 2, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
          >
            <div className={cx('flex items-center justify-between border-b-[3px] border-ink px-5 py-3', toneBg[tone])}>
              <h2 className="font-display text-xl uppercase">{title}</h2>
              <IconButton label="Close" onClick={onClose}>
                <X size={18} strokeWidth={3} />
              </IconButton>
            </div>
            <div className="p-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Counts up from 0 the first time it scrolls into view. */
export function CountUp({ value, suffix = '' }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const mv = useMotionValue(0)
  const text = useTransform(mv, (v) => `${Math.round(v)}${suffix}`)

  useEffect(() => {
    if (!inView) return
    const controls = animate(mv, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1] })
    return () => controls.stop()
  }, [inView, value, mv])

  return <motion.span ref={ref}>{text}</motion.span>
}

export function PageHeader({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <motion.p
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          className="mb-2 inline-block bg-ink px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-[0.2em] text-sun"
        >
          {kicker}
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="font-display text-4xl leading-none uppercase sm:text-5xl"
        >
          {title}
        </motion.h1>
      </div>
      {children && <div className="flex flex-wrap gap-3">{children}</div>}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border-[3px] border-dashed border-ink bg-cream/60 px-6 py-12 text-center">
      <p className="font-display text-2xl uppercase">{title}</p>
      {children && <div className="mt-2 text-ink/70">{children}</div>}
    </div>
  )
}

export function Loader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 font-mono text-sm font-bold uppercase" role="status">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className={cx('size-4 border-[3px] border-ink', ['bg-sun', 'bg-pink', 'bg-sky'][i])}
          animate={{ y: [0, -10, 0], rotate: [0, 90, 90] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.12 }}
        />
      ))}
      <span className="ml-1">{label}…</span>
    </div>
  )
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <motion.p
      initial={{ x: -8 }}
      animate={{ x: [-8, 8, -5, 5, 0] }}
      transition={{ duration: 0.35 }}
      className="border-[3px] border-ink bg-tomato px-3 py-2 text-sm font-bold"
      role="alert"
    >
      {children}
    </motion.p>
  )
}

export function Marquee({ items, tone = 'ink' }: { items: string[]; tone?: Tone }) {
  const row = [...items, ...items]
  return (
    <div className={cx('overflow-hidden border-y-[3px] border-ink py-2', toneBg[tone])}>
      <motion.div
        className="flex w-max gap-8 font-display text-lg uppercase whitespace-nowrap"
        animate={{ x: ['0%', '-50%'] }}
        transition={{ duration: 22, ease: 'linear', repeat: Infinity }}
      >
        {row.map((t, i) => (
          <span key={i} className="flex items-center gap-8">
            {t} <span aria-hidden>✦</span>
          </span>
        ))}
      </motion.div>
    </div>
  )
}
