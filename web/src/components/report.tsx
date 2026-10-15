import { motion } from 'motion/react'
import { Award, CalendarCheck, ChevronLeft, ChevronRight, Clock, Flame, Medal, Sparkles, Sunrise, TrendingUp } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import type { Badge as BadgeT, Report, TimelineEntry } from '../lib/api'
import { fmtDate, fmtTime, isoDate, methodLabel, runway, statusTone, today as todayIso } from '../lib/format'
import { Ring, WeeklyBars } from './charts'
import { Badge, Card, StatusBadge, cx } from './ui'

const toneBg: Record<string, string> = {
  lime: 'bg-lime',
  tang: 'bg-tang',
  sky: 'bg-sky',
  tomato: 'bg-tomato',
  cream: 'bg-cream',
}

/** One ring per course. */
export function CourseRings({ report }: { report: Report }) {
  if (report.courses.length === 0) return null
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {report.courses.map((c, i) => (
        <Card
          key={c.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.1 + i * 0.06 } }}
          tone={c.defaulter ? 'tomato' : 'cream'}
          className="flex items-center gap-3 p-4"
        >
          <Ring percent={c.percent} threshold={report.threshold} size="sm" />
          <div className="min-w-0">
            <p className="font-mono text-[11px] font-bold uppercase">{c.code}</p>
            <p className="truncate font-bold leading-tight">{c.name}</p>
            <p className="mt-1 font-mono text-[11px] text-ink/70">
              {c.attended}/{c.held} · {c.late} late{c.excused ? ` · ${c.excused} excused` : ''}
            </p>
          </div>
        </Card>
      ))}
    </div>
  )
}

/** Month grid; each class is a small square coloured by what happened. */
export function MonthCalendar({ timeline, onPick }: { timeline: TimelineEntry[]; onPick?: (e: TimelineEntry) => void }) {
  const [month, setMonth] = useState(() => (timeline[0]?.date ?? todayIso()).slice(0, 7))
  const [selected, setSelected] = useState<string | null>(null)
  const byDay = useMemo(() => {
    const m = new Map<string, TimelineEntry[]>()
    for (const e of timeline) m.set(e.date, [...(m.get(e.date) ?? []), e])
    m.forEach((list) => list.sort((a, b) => a.start_time.localeCompare(b.start_time)))
    return m
  }, [timeline])

  const [y, mo] = month.split('-').map(Number)
  const first = new Date(y, mo - 1, 1)
  const lead = (first.getDay() + 6) % 7 // Monday first
  const daysIn = new Date(y, mo, 0).getDate()
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => isoDate(new Date(y, mo - 1, i + 1)))]
  const shift = (n: number) => {
    const d = new Date(y, mo - 1 + n, 1)
    setMonth(isoDate(d).slice(0, 7))
    setSelected(null)
  }
  const today = todayIso()
  const picked = selected ? byDay.get(selected) ?? [] : []

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => shift(-1)} className="grid size-9 cursor-pointer place-items-center border-[3px] border-ink bg-cream shadow-brut-sm" aria-label="Previous month">
          <ChevronLeft size={18} strokeWidth={3} />
        </button>
        <p className="font-display text-lg uppercase">{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p>
        <button onClick={() => shift(1)} className="grid size-9 cursor-pointer place-items-center border-[3px] border-ink bg-cream shadow-brut-sm" aria-label="Next month">
          <ChevronRight size={18} strokeWidth={3} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center font-mono text-[10px] font-bold uppercase text-ink/60">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <span key={`x${i}`} />
          const list = byDay.get(d) ?? []
          return (
            <button
              key={d}
              onClick={() => setSelected(selected === d ? null : d)}
              className={cx(
                'flex aspect-square cursor-pointer flex-col items-center justify-between border-2 p-1 transition-transform hover:-translate-y-0.5',
                list.length ? 'border-ink bg-cream' : 'border-ink/15',
                selected === d && 'bg-sun',
                d === today && 'outline-[3px] outline-offset-1 outline-ink',
              )}
              aria-label={`${fmtDate(d)}: ${list.length ? list.map((e) => `${e.course_code} ${e.status}`).join(', ') : 'no class'}`}
            >
              <span className="self-start font-mono text-[11px] font-bold leading-none">{Number(d.slice(8))}</span>
              <span className="flex flex-wrap justify-center gap-0.5">
                {list.map((e) => (
                  <span key={e.session_id} className={cx('size-2.5 border-[1.5px] border-ink sm:size-3', toneBg[statusTone[e.status]])} />
                ))}
              </span>
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 font-mono text-[11px] font-bold uppercase">
        {(['present', 'late', 'excused', 'absent'] as const).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cx('size-3 border-2 border-ink', toneBg[statusTone[s]])} /> {s}
          </span>
        ))}
      </div>
      {selected && (
        <motion.ul initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 space-y-2">
          {picked.length === 0 && <li className="font-bold text-ink/60">No classes on {fmtDate(selected)}.</li>}
          {picked.map((e) => (
            <li key={e.session_id} className="flex items-center gap-3 border-[3px] border-ink bg-cream px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">
                  {e.course_code} · {e.topic || e.course_name}
                </p>
                <p className="font-mono text-xs text-ink/60">
                  {fmtTime(e.start_time)}
                  {e.time ? ` · marked ${fmtTime(e.time)}` : ''}
                  {e.method ? ` · ${methodLabel[e.method]}` : ''}
                </p>
              </div>
              <StatusBadge status={e.status} />
              {onPick && <button onClick={() => onPick(e)} className="cursor-pointer font-bold underline decoration-2 underline-offset-2">Details</button>}
            </li>
          ))}
        </motion.ul>
      )}
    </div>
  )
}

/** "If I skip / attend the next few classes, where do I land?" */
export function WhatIf({ attended, held, threshold }: { attended: number; held: number; threshold: number }) {
  const [attend, setAttend] = useState(0)
  const [skip, setSkip] = useState(0)
  const projected = held + attend + skip ? Math.round(((attended + attend) * 100) / (held + attend + skip)) : null
  const { needed, canMiss } = runway(attended, held, threshold)
  const safe = projected !== null && projected >= threshold

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 border-[3px] border-ink bg-cream px-3 py-2 text-sm font-bold">
        <TrendingUp size={18} strokeWidth={3} className="mt-0.5 shrink-0" />
        {held === 0
          ? 'No classes counted yet.'
          : needed > 0
            ? `Attend the next ${needed} class${needed === 1 ? '' : 'es'} in a row to get back to ${threshold}%.`
            : canMiss === 0
              ? 'You’re right at the line — don’t miss the next one.'
              : `You can miss ${canMiss} class${canMiss === 1 ? '' : 'es'} and stay at ${threshold}% or above.`}
      </p>
      {(
        [
          ['Attend next', attend, setAttend, 'accent-lime'],
          ['Skip next', skip, setSkip, 'accent-tomato'],
        ] as const
      ).map(([label, value, set, accent]) => (
        <label key={label} className="block">
          <span className="flex justify-between font-mono text-xs font-bold uppercase">
            <span>{label}</span>
            <span>{value} classes</span>
          </span>
          <input type="range" min={0} max={20} value={value} onChange={(e) => set(Number(e.target.value))} className={cx('mt-1 w-full cursor-pointer', accent)} />
        </label>
      ))}
      <div className={cx('flex items-center justify-between border-[3px] border-ink px-4 py-3', safe ? 'bg-lime' : 'bg-tomato')}>
        <span className="font-mono text-xs font-bold uppercase">You’d be at</span>
        <motion.span key={projected} initial={{ scale: 1.3 }} animate={{ scale: 1 }} className="font-display text-3xl">
          {projected === null ? '—' : `${projected}%`}
        </motion.span>
      </div>
    </div>
  )
}

const badgeIcon: Record<string, typeof Award> = {
  streak10: Flame,
  perfect_week: CalendarCheck,
  early_bird: Sunrise,
  never_late: Clock,
  comeback: Sparkles,
}

export function Badges({ badges }: { badges: BadgeT[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {badges.map((b, i) => {
        const Icon = badgeIcon[b.id] ?? Medal
        return (
          <motion.div
            key={b.id}
            initial={{ opacity: 0, rotate: -8, scale: 0.8 }}
            animate={{ opacity: 1, rotate: b.earned ? (i % 2 ? 2 : -2) : 0, scale: 1 }}
            transition={{ delay: 0.2 + i * 0.07, type: 'spring', stiffness: 300 }}
            whileHover={b.earned ? { rotate: 0, scale: 1.05 } : undefined}
            className={cx('border-[3px] p-3 text-center', b.earned ? 'border-ink bg-sun shadow-brut' : 'border-dashed border-ink/30 text-ink/40')}
            title={b.description}
          >
            <Icon className="mx-auto" size={26} strokeWidth={2.5} />
            <p className="mt-1 font-display text-sm leading-tight break-words uppercase">{b.label}</p>
            <p className="text-[11px] leading-tight">{b.description}</p>
          </motion.div>
        )
      })}
    </div>
  )
}

export function StatLine({ icon: Icon, label, children }: { icon: typeof Flame; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-11 shrink-0 place-items-center border-[3px] border-ink bg-cream">
        <Icon size={20} strokeWidth={2.5} />
      </span>
      <div>
        <p className="font-mono text-[11px] font-bold uppercase tracking-wider">{label}</p>
        <p className="font-display text-3xl leading-none">{children}</p>
      </div>
    </div>
  )
}

export function TimelineList({ entries, action }: { entries: TimelineEntry[]; action?: (e: TimelineEntry) => ReactNode }) {
  return (
    <ul className="divide-y-2 divide-ink/15">
      {entries.map((e) => (
        <li key={e.session_id} className="flex items-center gap-3 px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">
              {e.course_code} <span className="font-medium text-ink/70">· {e.topic || e.course_name}</span>
            </p>
            <p className="font-mono text-xs text-ink/60">
              {fmtDate(e.date)} · {fmtTime(e.start_time)}
              {e.time && e.status !== 'excused' ? ` · in at ${fmtTime(e.time)}` : ''}
            </p>
          </div>
          {e.request && e.request.status === 'pending' && <Badge tone="violet">Request pending</Badge>}
          <StatusBadge status={e.status} />
          {action?.(e)}
        </li>
      ))}
    </ul>
  )
}

/**
 * The full attendance story for one student: headline ring, per-course rings,
 * weekly trend, calendar, badges and history. Used by the student and staff views.
 */
export function ReportBody({
  report,
  headline,
  side,
  timelineAction,
}: {
  report: Report
  headline?: ReactNode
  side?: ReactNode
  timelineAction?: (e: TimelineEntry) => ReactNode
}) {
  const o = report.overall
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card tone={o.defaulter ? 'tomato' : 'sun'} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden p-5 sm:p-6">
          <motion.span
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 8 }}
            transition={{ delay: 0.8, type: 'spring', stiffness: 300 }}
            className="brut absolute top-4 right-4 bg-cream px-3 py-1 font-display text-sm uppercase"
          >
            {o.held === 0 ? 'Fresh start' : o.defaulter ? 'Danger zone' : 'All good'}
          </motion.span>
          {headline}
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <Ring percent={o.percent} threshold={report.threshold} />
            <div className="w-full space-y-3">
              <StatLine icon={Medal} label="Classes attended">
                {o.attended} <span className="text-xl">/ {o.held}</span>
              </StatLine>
              <StatLine icon={Flame} label="Current streak">
                {report.streak} <span className="text-xl">best {report.best_streak}</span>
              </StatLine>
              <p className="font-mono text-xs font-bold uppercase">
                {o.late} late · {o.excused} excused · {o.absent} absent
              </p>
            </div>
          </div>
        </Card>
        {side ?? (
          <Card initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.05 } }} className="p-5 sm:p-6">
            <h2 className="mb-4 font-display text-xl uppercase">What if…</h2>
            <WhatIf attended={o.attended} held={o.held} threshold={report.threshold} />
          </Card>
        )}
      </div>

      <CourseRings report={report} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card className="p-5 sm:p-6">
          <h2 className="mb-4 font-display text-xl uppercase">Calendar</h2>
          <MonthCalendar timeline={report.timeline} />
        </Card>
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="font-display text-xl uppercase">Week by week</h2>
              <span className="font-mono text-xs font-bold uppercase text-ink/60">last 10 weeks</span>
            </div>
            <WeeklyBars weeks={report.weekly} threshold={report.threshold} />
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="mb-4 flex items-center gap-2 font-display text-xl uppercase">
              <Award size={22} strokeWidth={2.5} /> Badges
            </h2>
            <Badges badges={report.badges} />
          </Card>
        </div>
      </div>

      <Card className="flex max-h-[560px] flex-col print:max-h-none">
        <h2 className="border-b-[3px] border-ink px-5 py-4 font-display text-xl uppercase">History</h2>
        {report.timeline.length === 0 ? (
          <p className="p-5 font-bold text-ink/60">No classes yet.</p>
        ) : (
          <div className="overflow-y-auto print:overflow-visible">
            <TimelineList entries={report.timeline} action={timelineAction} />
          </div>
        )}
      </Card>
    </div>
  )
}
