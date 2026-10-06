import { animate, AnimatePresence, motion, useInView, useMotionValue, useTransform, type HTMLMotionProps } from 'motion/react'
import { forwardRef, useEffect, useRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { X } from 'lucide-react'
import { accentFor, initials } from '../lib/format'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
export { cx }

type Tone = 'sun' | 'pink' | 'sky' | 'lime' | 'tang' | 'violet' | 'tomato' | 'ink' | 'cream'

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

export function Avatar({ name, seed, size = 'md' }: { name: string; seed?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'size-8 text-xs', md: 'size-11 text-sm', lg: 'size-20 text-2xl' }
  return (
    <span
      className={cx(
        'inline-grid shrink-0 place-items-center border-[3px] border-ink font-display',
        accentFor(seed ?? name),
        sizes[size],
      )}
    >
      {initials(name)}
    </span>
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
