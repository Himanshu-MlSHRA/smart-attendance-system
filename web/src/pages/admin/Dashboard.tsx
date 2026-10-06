import { motion } from 'motion/react'
import { AlertTriangle, ArrowUpRight, CalendarDays, ScanFace, UserCheck, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, Badge, Card, CountUp, Empty, ErrorNote, Loader, PageHeader, cx } from '../../components/ui'
import { api, type Stats } from '../../lib/api'
import { fmtDate, fmtDay, fmtTime, methodLabel, today } from '../../lib/format'
import { useLoad } from '../../lib/hooks'

const container = { show: { transition: { staggerChildren: 0.07 } } }
const item = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }

export default function Dashboard() {
  const { data, error, loading } = useLoad(api.stats)

  return (
    <>
      <PageHeader kicker={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} title="Dashboard">
        <Link to="/admin/scan">
          <motion.span
            whileHover={{ x: -2, y: -2, boxShadow: '6px 6px 0 0 #111' }}
            whileTap={{ x: 4, y: 4, boxShadow: '0 0 0 0 #111' }}
            className="brut inline-flex items-center gap-2 bg-lime px-5 py-3 font-bold uppercase"
          >
            <ScanFace size={20} strokeWidth={2.5} /> Start scanning
          </motion.span>
        </Link>
      </PageHeader>

      {error && <ErrorNote>{error}</ErrorNote>}
      {loading && !data && <Loader />}
      {data && <Body stats={data} />}
    </>
  )
}

function Body({ stats }: { stats: Stats }) {
  const rateToday = stats.total_students ? Math.round((stats.present_today * 100) / stats.total_students) : 0
  const tiles = [
    { label: 'Present today', value: stats.present_today, sub: `of ${stats.total_students} · ${rateToday}%`, icon: UserCheck, tone: 'lime' as const },
    { label: 'Students', value: stats.total_students, sub: `${stats.enrolled_faces} with faces enrolled`, icon: Users, tone: 'pink' as const },
    { label: 'Avg attendance', value: stats.average_rate, suffix: '%', sub: `over ${stats.class_days} class days`, icon: CalendarDays, tone: 'sky' as const },
    { label: 'Defaulters', value: stats.defaulters, sub: 'below 75%', icon: AlertTriangle, tone: stats.defaulters ? ('tomato' as const) : ('cream' as const) },
  ]

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-8">
      <div className="grid grid-cols-2 gap-4 sm:gap-6 xl:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} tone={t.tone} variants={item} whileHover={{ rotate: -1, y: -4 }} className="relative p-4 sm:p-5">
            <t.icon className="absolute top-4 right-4" size={22} strokeWidth={2.5} />
            <p className="font-mono text-[11px] font-bold uppercase tracking-wider">{t.label}</p>
            <p className="mt-3 font-display text-5xl leading-none sm:text-6xl">
              <CountUp value={t.value} suffix={t.suffix} />
            </p>
            <p className="mt-2 text-sm font-medium">{t.sub}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card variants={item} className="p-5 sm:p-6">
          <div className="mb-6 flex items-baseline justify-between gap-4">
            <h2 className="font-display text-2xl uppercase">Check-ins, last 14 days</h2>
            <span className="font-mono text-xs font-bold uppercase text-ink/60">students / day</span>
          </div>
          <BarChart series={stats.series} max={Math.max(stats.total_students, 1)} />
        </Card>

        <Card variants={item} className="flex flex-col">
          <div className="flex items-center justify-between border-b-[3px] border-ink px-5 py-4">
            <h2 className="font-display text-2xl uppercase">Latest</h2>
            <Link to="/admin/records" className="inline-flex items-center gap-1 font-bold underline decoration-[3px] underline-offset-4 hover:bg-sun">
              All records <ArrowUpRight size={16} strokeWidth={3} />
            </Link>
          </div>
          {stats.recent.length === 0 ? (
            <div className="p-5">
              <Empty title="Nobody yet">Start the scanner to fill this up.</Empty>
            </div>
          ) : (
            <ul className="divide-y-[3px] divide-ink">
              {stats.recent.map((r, i) => (
                <motion.li
                  key={r.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.05 }}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  <Avatar name={r.name} seed={r.roll_number} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{r.name}</p>
                    <p className="font-mono text-xs text-ink/60">
                      {r.date === today() ? 'Today' : fmtDate(r.date)} · {fmtTime(r.time)}
                    </p>
                  </div>
                  <Badge tone={r.method === 'manual' ? 'violet' : r.method === 'self' ? 'pink' : 'lime'}>{methodLabel[r.method]}</Badge>
                </motion.li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </motion.div>
  )
}

function BarChart({ series, max }: { series: Stats['series']; max: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const ticks = [max, Number.isInteger(max / 2) ? max / 2 : (max / 2).toFixed(1), 0]
  const t = today()

  return (
    <div>
      <div className="relative flex h-56 gap-2">
        {/* y-axis */}
        <div className="flex w-6 flex-col justify-between text-right font-mono text-[11px] text-ink/60">
          {ticks.map((v) => (
            <span key={v} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">{v}</span>
          ))}
        </div>
        <div className="relative flex-1 border-b-[3px] border-l-[3px] border-ink">
          <div className="absolute inset-x-0 top-0 border-t border-dashed border-ink/25" />
          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-ink/25" />
          <div className="absolute inset-0 flex items-end gap-[2px] px-[2px]">
            {series.map((d, i) => {
              const pct = (d.count / max) * 100
              const isToday = d.date === t
              return (
                <div
                  key={d.date}
                  className="relative flex h-full flex-1 cursor-default items-end"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                >
                  <motion.div
                    className={cx('w-full border-x-2 border-t-2 border-ink', isToday ? 'bg-lime' : 'bg-sun', hover === i && 'bg-pink')}
                    initial={{ height: 0 }}
                    animate={{ height: `${pct}%` }}
                    transition={{ type: 'spring', stiffness: 120, damping: 18, delay: 0.2 + i * 0.03 }}
                    style={{ minHeight: d.count ? 4 : 0 }}
                  />
                  {hover === i && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 border-[3px] border-ink bg-ink px-2 py-1 text-center whitespace-nowrap text-cream"
                      style={{ bottom: `calc(${pct}% + 8px)` }}
                    >
                      <p className="font-display text-base leading-none">{d.count}</p>
                      <p className="font-mono text-[10px]">{fmtDate(d.date)}</p>
                    </motion.div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="mt-2 ml-8 flex gap-[2px] px-[2px] font-mono text-[10px] text-ink/60">
        {series.map((d, i) => (
          <span key={d.date} className={cx('flex-1 text-center', d.date === t && 'font-bold text-ink')}>
            {d.date === t ? 'Today' : i % 2 === 0 ? fmtDay(d.date).slice(0, 2) : ''}
          </span>
        ))}
      </div>
    </div>
  )
}
