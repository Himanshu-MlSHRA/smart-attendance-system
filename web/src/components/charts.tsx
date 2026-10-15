import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { fmtDate, fmtShort } from '../lib/format'
import { CountUp, cx } from './ui'

/* Sequential ramp (one hue, light → dark) for attendance rate. */
const RAMP = ['#e8f5d6', '#c4e89a', '#93d052', '#58a823', '#2c6e0e']
const RAMP_EDGES = [60, 75, 85, 95] // rate < 60 → step 0 … ≥ 95 → step 4

function rampColor(rate: number) {
  const i = RAMP_EDGES.findIndex((edge) => rate < edge)
  return RAMP[i === -1 ? RAMP.length - 1 : i]
}

function Tip({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="pointer-events-none absolute z-20 -translate-x-1/2 border-[3px] border-ink bg-ink px-2 py-1 text-center whitespace-nowrap text-cream"
      style={style}
    >
      {children}
    </motion.div>
  )
}

/** GitHub-style calendar of daily turnout. Columns are weeks, rows are weekdays. */
export function Heatmap({ days }: { days: { date: string; sessions: number; rate: number | null }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const weeks = useMemo(() => {
    const out: (typeof days)[] = []
    days.forEach((d, i) => {
      if (i % 7 === 0) out.push([])
      out[out.length - 1].push(d)
    })
    return out
  }, [days])
  const months = weeks.map((w, i) => {
    const m = new Date(`${w[0].date}T00:00:00`).getMonth()
    const prev = i > 0 ? new Date(`${weeks[i - 1][0].date}T00:00:00`).getMonth() : -1
    return m !== prev ? new Date(`${w[0].date}T00:00:00`).toLocaleDateString(undefined, { month: 'short' }) : ''
  })

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="relative inline-flex gap-1.5">
          <div className="mt-5 grid grid-rows-7 gap-1 pr-1 font-mono text-[10px] leading-none text-ink/60">
            {['Mon', '', 'Wed', '', 'Fri', '', ''].map((d, i) => (
              <span key={i} className="flex h-4 items-center">
                {d}
              </span>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={week[0].date} className="flex flex-col gap-1">
              <span className="h-4 font-mono text-[10px] font-bold uppercase">{months[wi]}</span>
              {week.map((d, di) => {
                const idx = wi * 7 + di
                return (
                  <motion.div
                    key={d.date}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: wi * 0.02, type: 'spring', stiffness: 400, damping: 22 }}
                    onMouseEnter={() => setHover(idx)}
                    onMouseLeave={() => setHover(null)}
                    className={cx(
                      'relative size-4 cursor-default border-2',
                      d.rate === null ? 'border-ink/15 bg-transparent' : 'border-ink',
                      hover === idx && 'outline-2 outline-offset-1 outline-ink',
                    )}
                    style={d.rate !== null ? { background: rampColor(d.rate) } : undefined}
                    aria-label={`${fmtDate(d.date)}: ${d.rate === null ? 'no class' : `${d.rate}% turnout`}`}
                  >
                    {hover === idx && (
                      <Tip style={{ bottom: 'calc(100% + 8px)', left: '50%' }}>
                        <p className="font-display text-sm leading-none">{d.rate === null ? 'No class' : `${d.rate}%`}</p>
                        <p className="font-mono text-[10px]">
                          {fmtShort(d.date)}
                          {d.sessions ? ` · ${d.sessions} class${d.sessions > 1 ? 'es' : ''}` : ''}
                        </p>
                      </Tip>
                    )}
                  </motion.div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[11px] font-bold uppercase">
        <span className="flex items-center gap-1.5">
          <span className="size-3 border-2 border-ink/15" /> No class
        </span>
        <span className="flex items-center gap-1">
          &lt;60%
          {RAMP.map((c) => (
            <span key={c} className="size-3 border-2 border-ink" style={{ background: c }} />
          ))}
          95%+
        </span>
      </div>
    </div>
  )
}

/** Tiny line of weekly rates with the required line dashed in. */
export function Sparkline({ values, threshold, className }: { values: (number | null)[]; threshold: number; className?: string }) {
  const w = 96
  const h = 28
  const pts = values.map((v, i) => (v === null ? null : [(i / Math.max(values.length - 1, 1)) * (w - 6) + 3, h - 3 - (v / 100) * (h - 6)]))
  const path = pts.reduce((acc, p, i) => {
    if (!p) return acc
    const prev = pts[i - 1]
    return `${acc}${prev ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`
  }, '')
  const last = [...pts].reverse().find(Boolean)
  const ty = h - 3 - (threshold / 100) * (h - 6)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cx('h-7 w-24', className)} aria-hidden>
      <line x1="0" x2={w} y1={ty} y2={ty} stroke="currentColor" strokeOpacity="0.35" strokeDasharray="3 3" strokeWidth="1.5" />
      <motion.path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
      />
      {last && <circle cx={last[0]} cy={last[1]} r="3" fill="currentColor" />}
    </svg>
  )
}

/** When people actually turn up, relative to class start. */
export function ArrivalChart({ data, lateAfter }: { data: { minute: number; count: number }[]; lateAfter: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(...data.map((d) => d.count), 1)
  const total = data.reduce((a, d) => a + d.count, 0)
  const label = (m: number) => (m === 0 ? 'Start' : m < 0 ? `${m}` : `+${m}`)
  return (
    <div>
      <div className="relative flex h-44 items-end gap-1.5 border-b-[3px] border-ink">
        {data.map((d, i) => {
          const late = d.minute >= lateAfter
          const pct = (d.count / max) * 100
          return (
            <div
              key={d.minute}
              className="relative flex h-full flex-1 items-end"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <motion.div
                className={cx('w-full border-x-[3px] border-t-[3px] border-ink', late ? 'bg-tomato' : d.minute < 0 ? 'bg-lime' : 'bg-sun', hover === i && 'brightness-110')}
                initial={{ height: 0 }}
                animate={{ height: `${pct}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 18, delay: 0.1 + i * 0.04 }}
                style={{ minHeight: d.count ? 4 : 0 }}
              />
              {hover === i && (
                <Tip style={{ bottom: `calc(${pct}% + 8px)`, left: '50%' }}>
                  <p className="font-display text-base leading-none">{d.count}</p>
                  <p className="font-mono text-[10px]">
                    {d.minute < 0 ? `${-d.minute}–${-d.minute - 5} min early` : `${d.minute}–${d.minute + 5} min in`} · {total ? Math.round((d.count * 100) / total) : 0}%
                  </p>
                </Tip>
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5 font-mono text-[10px] text-ink/60">
        {data.map((d) => (
          <span key={d.minute} className={cx('flex-1 text-center', d.minute === 0 && 'font-bold text-ink')}>
            {label(d.minute)}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 font-mono text-[11px] font-bold uppercase">
        <span className="flex items-center gap-1.5"><span className="size-3 border-2 border-ink bg-lime" /> Early</span>
        <span className="flex items-center gap-1.5"><span className="size-3 border-2 border-ink bg-sun" /> On time</span>
        <span className="flex items-center gap-1.5"><span className="size-3 border-2 border-ink bg-tomato" /> Late (&gt;{lateAfter} min)</span>
      </div>
    </div>
  )
}

/** Weekly attendance % as columns, with the required line across. */
export function WeeklyBars({ weeks, threshold }: { weeks: { week: string; rate: number | null }[]; threshold: number }) {
  const [hover, setHover] = useState<number | null>(null)
  return (
    <div>
      <div className="relative flex h-36 items-end gap-1.5 border-b-[3px] border-ink">
        <div className="pointer-events-none absolute inset-x-0 z-10 border-t-[3px] border-dashed border-ink" style={{ bottom: `${threshold}%` }}>
          <span className="absolute -top-5 right-0 bg-paper px-1 font-mono text-[10px] font-bold">{threshold}%</span>
        </div>
        {weeks.map((w, i) => (
          <div key={w.week} className="relative flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            {w.rate === null ? (
              <div className="w-full border-t-[3px] border-dashed border-ink/30" />
            ) : (
              <motion.div
                className={cx('w-full border-x-[3px] border-t-[3px] border-ink', w.rate < threshold ? 'bg-tomato' : 'bg-lime')}
                initial={{ height: 0 }}
                animate={{ height: `${w.rate}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 18, delay: 0.1 + i * 0.04 }}
                style={{ minHeight: 4 }}
              />
            )}
            {hover === i && (
              <Tip style={{ bottom: `calc(${w.rate ?? 0}% + 8px)`, left: '50%' }}>
                <p className="font-display text-base leading-none">{w.rate === null ? 'No class' : `${w.rate}%`}</p>
                <p className="font-mono text-[10px]">week of {fmtShort(w.week)}</p>
              </Tip>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5 font-mono text-[10px] text-ink/60">
        {weeks.map((w, i) => (
          <span key={w.week} className="flex-1 text-center">
            {i === weeks.length - 1 ? 'Now' : i % 2 === (weeks.length - 1) % 2 ? fmtShort(w.week) : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Big progress ring for an attendance %, with a tick at the required line. */
export function Ring({ percent, threshold, size = 'lg', label = 'present' }: { percent: number | null; threshold: number; size?: 'sm' | 'lg'; label?: string }) {
  const r = 70
  const c = 2 * Math.PI * r
  const mv = useMotionValue(0)
  const offset = useTransform(mv, (v) => c - (v / 100) * c)
  const danger = percent !== null && percent < threshold

  useEffect(() => {
    const controls = animate(mv, percent ?? 0, { duration: 1.3, ease: [0.16, 1, 0.3, 1], delay: 0.2 })
    return () => controls.stop()
  }, [percent, mv])

  const angle = (threshold / 100) * 360
  return (
    <div className={cx('relative shrink-0', size === 'lg' ? 'size-44' : 'size-24')}>
      <svg viewBox="0 0 180 180" className="size-full -rotate-90">
        <circle cx="90" cy="90" r={r} fill="none" stroke="var(--color-ink)" strokeWidth="26" />
        <circle cx="90" cy="90" r={r} fill="none" stroke="var(--color-paper)" strokeWidth="18" />
        <motion.circle
          cx="90"
          cy="90"
          r={r}
          fill="none"
          stroke={danger ? 'var(--color-tomato)' : 'var(--color-lime)'}
          strokeWidth="18"
          strokeDasharray={c}
          style={{ strokeDashoffset: offset }}
        />
        <line x1={90 + r - 15} y1="90" x2={90 + r + 15} y2="90" stroke="var(--color-ink)" strokeWidth="5" transform={`rotate(${angle} 90 90)`} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className={cx('font-display leading-none', size === 'lg' ? 'text-4xl' : percent === 100 ? 'text-base' : 'text-lg')}>
            {percent === null ? '—' : <CountUp value={percent} suffix="%" />}
          </p>
          {size === 'lg' && <p className="font-mono text-[10px] font-bold uppercase tracking-wider">{label}</p>}
        </div>
      </div>
    </div>
  )
}
