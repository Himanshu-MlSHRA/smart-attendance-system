import { motion } from 'motion/react'
import { AlertTriangle, ArrowUpRight, BookOpen, CalendarDays, Inbox, Mail, Play, Radio, ScanSearch, UserCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrivalChart, Heatmap, Sparkline, WeeklyBars } from '../../components/charts'
import { useToast } from '../../components/toast'
import { Avatar, Badge, Button, Card, CountUp, Empty, ErrorNote, Modal, PageHeader, PageSkeleton, PercentBar, SectionTitle, cx } from '../../components/ui'
import { api, type AlertPreview, type Stats } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { fmtPct, fmtRelDay, fmtTime, greeting, longToday, methodLabel, statusTone } from '../../lib/format'
import { useLoad } from '../../lib/hooks'

const container = { show: { transition: { staggerChildren: 0.06 } } }
const item = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }

export default function Dashboard() {
  const { user } = useAuth()
  const { data, error } = useLoad(api.stats, [], 30_000)

  return (
    <>
      <PageHeader kicker={longToday()} title={`${greeting()}, ${(user?.name ?? '').replace(/^Prof\.\s*/, '').split(' ')[0]}`}>
        <Link to="/staff/classes">
          <motion.span
            whileHover={{ x: -2, y: -2, boxShadow: '6px 6px 0 0 #111' }}
            whileTap={{ x: 4, y: 4, boxShadow: '0 0 0 0 #111' }}
            className="brut inline-flex items-center gap-2 bg-lime px-5 py-3 font-bold uppercase"
          >
            <Play size={20} strokeWidth={2.5} /> Start a class
          </motion.span>
        </Link>
      </PageHeader>

      {error && <ErrorNote>{error}</ErrorNote>}
      {!data && !error && <PageSkeleton />}
      {data && <Body stats={data} isAdmin={user?.role === 'admin'} />}
    </>
  )
}

function Body({ stats, isAdmin }: { stats: Stats; isAdmin: boolean }) {
  const [alerts, setAlerts] = useState(false)
  const tiles = [
    { label: 'Present today', value: stats.present_today, sub: `of ${stats.total_students} students`, icon: UserCheck, tone: 'lime' as const },
    { label: 'Avg attendance', value: stats.average_rate ?? 0, suffix: '%', sub: `${stats.sessions_held} classes held`, icon: CalendarDays, tone: 'sky' as const },
    { label: 'Defaulters', value: stats.defaulters, sub: `below ${stats.threshold}%`, icon: AlertTriangle, tone: stats.defaulters ? ('tomato' as const) : ('cream' as const) },
    { label: 'Courses', value: stats.courses, sub: `${stats.total_students} students`, icon: BookOpen, tone: 'pink' as const },
  ]

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      {(stats.pending_requests > 0 || stats.unknown_faces > 0) && (
        <motion.div variants={item} className="flex flex-wrap gap-3">
          {stats.pending_requests > 0 && (
            <Link to="/staff/requests" className="brut flex items-center gap-2 bg-tang px-4 py-2 font-bold transition-transform hover:-translate-y-0.5">
              <Inbox size={18} strokeWidth={2.5} /> {stats.pending_requests} request{stats.pending_requests > 1 ? 's' : ''} waiting for you <ArrowUpRight size={16} strokeWidth={3} />
            </Link>
          )}
          {isAdmin && stats.unknown_faces > 0 && (
            <Link to="/staff/unknown" className="brut flex items-center gap-2 bg-violet px-4 py-2 font-bold transition-transform hover:-translate-y-0.5">
              <ScanSearch size={18} strokeWidth={2.5} /> {stats.unknown_faces} unknown face{stats.unknown_faces > 1 ? 's' : ''} to review <ArrowUpRight size={16} strokeWidth={3} />
            </Link>
          )}
        </motion.div>
      )}

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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1fr]">
        <Card variants={item} className="flex flex-col">
          <SectionTitle aside={<Badge tone="ink">{stats.today.length} today</Badge>}>Today’s classes</SectionTitle>
          {stats.today.length === 0 ? (
            <div className="p-5">
              <Empty title="Nothing scheduled yet">Start a class from the Classes page when you walk in.</Empty>
            </div>
          ) : (
            <ul className="divide-y-[3px] divide-ink">
              {stats.today.map((s) => (
                <li key={s.id}>
                  <Link to={`/staff/sessions/${s.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-sun/40">
                    <span className={cx('grid size-11 shrink-0 place-items-center border-[3px] border-ink', s.status === 'open' ? 'bg-lime' : 'bg-paper')}>
                      {s.status === 'open' ? (
                        <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
                          <Radio size={20} strokeWidth={2.5} />
                        </motion.span>
                      ) : (
                        <span className="font-mono text-xs font-bold">{fmtTime(s.start_time)}</span>
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">
                        {s.course_code} · {s.topic || s.course_name}
                      </p>
                      <PercentBar value={s.roster ? Math.round((s.present * 100) / s.roster) : 0} className="mt-1.5 h-2.5" />
                    </div>
                    <span className="font-display text-xl">
                      {s.present}/{s.roster}
                    </span>
                    {s.status === 'open' && <Badge tone="lime">Live</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card variants={item} className="p-5 sm:p-6">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="font-display text-xl uppercase sm:text-2xl">Weekly attendance</h2>
            <span className="font-mono text-xs font-bold uppercase text-ink/60">last 8 weeks</span>
          </div>
          <WeeklyBars weeks={stats.weekly} threshold={stats.threshold} />
        </Card>
      </div>

      <Card variants={item} className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl uppercase sm:text-2xl">Turnout heatmap</h2>
          <span className="font-mono text-xs font-bold uppercase text-ink/60">share of the roster present, per day</span>
        </div>
        <Heatmap days={stats.heatmap} />
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_1fr]">
        <Card variants={item} className="flex flex-col">
          <SectionTitle
            aside={
              stats.defaulters > 0 && (
                <Button size="sm" tone="tomato" onClick={() => setAlerts(true)} icon={<Mail size={14} strokeWidth={3} />}>
                  Alert defaulters
                </Button>
              )
            }
          >
            At risk
          </SectionTitle>
          {stats.at_risk.length === 0 ? (
            <div className="p-5">
              <Empty title="Everyone’s safe">Nobody is near the {stats.threshold}% line.</Empty>
            </div>
          ) : (
            <ul className="divide-y-2 divide-ink/15">
              {stats.at_risk.map((s) => (
                <li key={s.id}>
                  <Link to={`/staff/students/${s.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-sun/40">
                    <Avatar name={s.name} seed={s.roll_number} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{s.name}</p>
                      <p className="font-mono text-xs text-ink/60">
                        {s.roll_number} · {s.attended}/{s.held}
                      </p>
                    </div>
                    <Sparkline values={s.weekly} threshold={stats.threshold} className={s.defaulter ? 'text-tomato' : 'text-ink'} />
                    <Badge tone={s.defaulter ? 'tomato' : 'tang'} className="min-w-14 justify-center">
                      {fmtPct(s.percent)}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card variants={item} className="p-5 sm:p-6">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="font-display text-xl uppercase sm:text-2xl">When they arrive</h2>
            <span className="font-mono text-xs font-bold uppercase text-ink/60">minutes vs. class start</span>
          </div>
          <ArrivalChart data={stats.arrivals} lateAfter={10} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1fr]">
        <Card variants={item} className="flex flex-col">
          <SectionTitle>Courses</SectionTitle>
          <ul className="divide-y-2 divide-ink/15">
            {stats.course_breakdown.map((c) => (
              <li key={c.id}>
                <Link to={`/staff/classes/${c.id}`} className="block px-5 py-3 hover:bg-sun/40">
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <p className="truncate font-bold">
                      <span className="font-mono text-sm">{c.code}</span> · {c.name}
                    </p>
                    <span className="font-display text-xl">{fmtPct(c.rate)}</span>
                  </div>
                  <PercentBar value={c.rate} threshold={stats.threshold} />
                  <p className="mt-1 font-mono text-[11px] text-ink/60">
                    {c.teacher_name ?? 'No teacher'} · {c.sessions} classes · {c.students} students
                  </p>
                </Link>
              </li>
            ))}
            {stats.course_breakdown.length === 0 && (
              <li className="p-5">
                <Empty title="No courses">{isAdmin ? 'Create one on the Classes page.' : 'An admin hasn’t assigned you a course yet.'}</Empty>
              </li>
            )}
          </ul>
        </Card>

        <Card variants={item} className="flex flex-col">
          <SectionTitle
            aside={
              <Link to="/staff/records" className="inline-flex items-center gap-1 font-bold underline decoration-[3px] underline-offset-4 hover:bg-sun">
                All records <ArrowUpRight size={16} strokeWidth={3} />
              </Link>
            }
          >
            Latest check-ins
          </SectionTitle>
          {stats.recent.length === 0 ? (
            <div className="p-5">
              <Empty title="Nobody yet">Start a class to fill this up.</Empty>
            </div>
          ) : (
            <ul className="divide-y-2 divide-ink/15">
              {stats.recent.map((r, i) => (
                <motion.li key={r.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.04 }}>
                  <Link to={`/staff/students/${r.student_id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-sun/40">
                    <Avatar name={r.name} seed={r.roll_number} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{r.name}</p>
                      <p className="font-mono text-xs text-ink/60">
                        {r.course_code} · {fmtRelDay(r.date)} {fmtTime(r.time)} · {methodLabel[r.method]}
                      </p>
                    </div>
                    <Badge tone={statusTone[r.status]}>{r.status}</Badge>
                  </Link>
                </motion.li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <AlertsModal open={alerts} onClose={() => setAlerts(false)} />
    </motion.div>
  )
}

function AlertsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Defaulter alerts" tone="tomato" wide>
      {open && <AlertsBody onClose={onClose} />}
    </Modal>
  )
}

function AlertsBody({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const { data, error } = useLoad(() => api.alertDefaulters(true))
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState(0)
  const send = async () => {
    setBusy(true)
    try {
      const res: AlertPreview = await api.alertDefaulters(false)
      toast(res.dry_run ? 'SMTP isn’t set up, so nothing was sent' : `Sent ${res.sent} emails`, res.dry_run ? 'info' : 'ok')
      onClose()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }
  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!data) return <p className="font-bold">Preparing emails…</p>
  const msg = data.preview[picked]
  return (
    <div className="space-y-4">
      <p>
        {data.preview.length} student{data.preview.length === 1 ? '' : 's'} below the line.{' '}
        {data.smtp_configured ? 'Each gets an email with their numbers and how to recover.' : 'SMTP isn’t configured (set SMTP_HOST), so this is a preview only.'}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {data.preview.map((p, i) => (
          <button key={p.roll_number} onClick={() => setPicked(i)} className={cx('cursor-pointer border-2 border-ink px-2 py-0.5 text-sm font-bold', i === picked ? 'bg-ink text-cream' : 'bg-cream')}>
            {p.name.split(' ')[0]} · {p.percent}%
          </button>
        ))}
      </div>
      {msg && (
        <div className="border-[3px] border-ink bg-paper p-3">
          <p className="font-mono text-xs">To: {msg.email ?? '(no email on file)'}</p>
          <p className="font-mono text-xs font-bold">Subject: {msg.subject}</p>
          <pre className="mt-2 max-h-56 overflow-y-auto font-sans text-sm whitespace-pre-wrap">{msg.text}</pre>
        </div>
      )}
      <div className="flex justify-end gap-3">
        <Button tone="cream" onClick={onClose}>
          Close
        </Button>
        <Button tone="tomato" disabled={busy || !data.smtp_configured} onClick={send} icon={<Mail size={16} strokeWidth={3} />}>
          {busy ? 'Sending…' : 'Send all'}
        </Button>
      </div>
    </div>
  )
}
