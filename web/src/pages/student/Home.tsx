import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { Flame, ScanFace, Target, TrendingUp } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useToast } from '../../components/toast'
import { Badge, Button, Card, CountUp, Empty, ErrorNote, Loader, Modal, cx } from '../../components/ui'
import { Viewfinder } from '../../components/Viewfinder'
import { api, type FaceResult, type MyAttendance } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { fmtDate, fmtDay, fmtTime, methodLabel } from '../../lib/format'
import { useCamera, useLoad } from '../../lib/hooks'

export default function StudentHome() {
  const { user } = useAuth()
  const { data, error, loading, reload } = useLoad(api.myAttendance)
  const [checkingIn, setCheckingIn] = useState(false)
  const student = user!.student!
  const first = student.name.split(' ')[0]

  return (
    <>
      <div className="mb-8">
        <motion.p
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          className="mb-2 inline-block bg-ink px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-[0.2em] text-sun"
        >
          {student.roll_number} · {student.department}
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-display text-4xl leading-none uppercase sm:text-6xl"
        >
          Yo, {first}
          <motion.span
            className="ml-2 inline-block origin-[70%_70%]"
            animate={{ rotate: [0, 18, -8, 18, 0] }}
            transition={{ duration: 1.2, delay: 0.4 }}
          >
            👋
          </motion.span>
        </motion.h1>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {loading && !data && <Loader />}
      {data && (
        <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.08 } } }} className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
            <Overview data={data} />
            <CheckinCard data={data} enrolled={student.enrolled} onOpen={() => setCheckingIn(true)} />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
            <DayGrid data={data} />
            <History data={data} />
          </div>
        </motion.div>
      )}

      <Modal open={checkingIn} onClose={() => setCheckingIn(false)} title="Self check-in" tone="lime" wide>
        <CheckinBody
          onDone={() => {
            setCheckingIn(false)
            reload()
          }}
        />
      </Modal>
    </>
  )
}

const item = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }

function Ring({ percent, danger }: { percent: number; danger: boolean }) {
  const r = 70
  const c = 2 * Math.PI * r
  const mv = useMotionValue(0)
  const offset = useTransform(mv, (v) => c - (v / 100) * c)

  useEffect(() => {
    const controls = animate(mv, percent, { duration: 1.3, ease: [0.16, 1, 0.3, 1], delay: 0.2 })
    return () => controls.stop()
  }, [percent, mv])

  return (
    <div className="relative size-44 shrink-0">
      <svg viewBox="0 0 180 180" className="size-full -rotate-90">
        <circle cx="90" cy="90" r={r} fill="none" stroke="#111" strokeWidth="26" />
        <circle cx="90" cy="90" r={r} fill="none" stroke="#fff6e5" strokeWidth="18" />
        <motion.circle
          cx="90"
          cy="90"
          r={r}
          fill="none"
          stroke={danger ? '#ff5a5a' : '#a6f04a'}
          strokeWidth="18"
          strokeDasharray={c}
          style={{ strokeDashoffset: offset }}
        />
        {/* 75% threshold tick */}
        <line x1={90 + r - 14} y1="90" x2={90 + r + 14} y2="90" stroke="#111" strokeWidth="4" transform="rotate(270 90 90)" />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="font-display text-4xl leading-none">
            <CountUp value={percent} suffix="%" />
          </p>
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider">present</p>
        </div>
      </div>
    </div>
  )
}

function Overview({ data }: { data: MyAttendance }) {
  const total = data.class_days.length
  const t = data.threshold / 100
  const canMiss = Math.max(0, Math.floor((data.attended - t * total) / t))
  const needed = Math.max(0, Math.ceil((t * total - data.attended) / (1 - t)))

  return (
    <Card variants={item} tone={data.defaulter ? 'tomato' : 'sun'} className="relative overflow-hidden p-5 sm:p-6">
      <motion.span
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 8 }}
        transition={{ delay: 0.8, type: 'spring', stiffness: 300 }}
        className="brut absolute top-4 right-4 bg-cream px-3 py-1 font-display text-sm uppercase"
      >
        {total === 0 ? 'Fresh start' : data.defaulter ? 'Danger zone' : 'All good'}
      </motion.span>
      <div className="flex flex-col items-center gap-6 sm:flex-row">
        <Ring percent={data.percent} danger={data.defaulter} />
        <div className="w-full space-y-3">
          <Stat icon={Target} label="Classes attended">
            <CountUp value={data.attended} /> <span className="text-xl">/ {total}</span>
          </Stat>
          <Stat icon={Flame} label="Current streak">
            <CountUp value={data.streak} /> <span className="text-xl">{data.streak === 1 ? 'day' : 'days'}</span>
          </Stat>
          <p className="flex items-start gap-2 border-[3px] border-ink bg-cream px-3 py-2 text-sm font-bold">
            <TrendingUp size={18} strokeWidth={3} className="mt-0.5 shrink-0" />
            {total === 0
              ? 'No classes recorded yet.'
              : data.defaulter
                ? `Attend the next ${needed} class${needed === 1 ? '' : 'es'} in a row to get back to ${data.threshold}%.`
                : canMiss === 0
                  ? `You're right at the line — don't miss the next one.`
                  : `You can miss ${canMiss} class${canMiss === 1 ? '' : 'es'} and stay above ${data.threshold}%.`}
          </p>
        </div>
      </div>
    </Card>
  )
}

function Stat({ icon: Icon, label, children }: { icon: typeof Flame; label: string; children: ReactNode }) {
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

function CheckinCard({ data, enrolled, onOpen }: { data: MyAttendance; enrolled: boolean; onOpen: () => void }) {
  return (
    <Card variants={item} tone={data.present_today ? 'lime' : 'violet'} className="dots relative flex flex-col justify-between gap-6 p-5 sm:p-6">
      <div className="brut bg-cream p-4">
        <p className="font-mono text-[11px] font-bold uppercase tracking-wider">Today</p>
        <p className="font-display text-3xl uppercase">{data.present_today ? 'You’re in' : 'Not marked yet'}</p>
        <p className="mt-1 text-sm">
          {data.present_today
            ? 'Attendance is locked in for today. Nice.'
            : enrolled
              ? 'In class? Check yourself in with your face.'
              : 'Your face isn’t enrolled yet — ask your admin to enroll you.'}
        </p>
      </div>
      {data.present_today ? (
        <motion.div
          initial={{ scale: 2.2, rotate: -30, opacity: 0 }}
          animate={{ scale: 1, rotate: -8, opacity: 1 }}
          transition={{ delay: 0.5, type: 'spring', stiffness: 260, damping: 14 }}
          className="mx-auto border-[5px] border-ink bg-cream px-6 py-2 font-display text-4xl tracking-wider uppercase shadow-brut"
        >
          Present
        </motion.div>
      ) : (
        <Button size="lg" tone="lime" className="w-full" onClick={onOpen} disabled={!enrolled} icon={<ScanFace size={22} strokeWidth={2.5} />}>
          Check in now
        </Button>
      )}
    </Card>
  )
}

function DayGrid({ data }: { data: MyAttendance }) {
  const attended = new Set(data.records.map((r) => r.date))
  const days = data.class_days.slice(-35)
  return (
    <Card variants={item} className="p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl uppercase">Class days</h2>
        <div className="flex gap-3 font-mono text-xs font-bold uppercase">
          <span className="flex items-center gap-1.5">
            <span className="size-3 border-2 border-ink bg-lime" /> Present
          </span>
          <span className="flex items-center gap-1.5">
            <span className="stripes size-3 border-2 border-ink bg-tomato" /> Absent
          </span>
        </div>
      </div>
      {days.length === 0 ? (
        <Empty title="No classes yet" />
      ) : (
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-7">
          {days.map((d, i) => {
            const present = attended.has(d)
            return (
              <motion.div
                key={d}
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + i * 0.02, type: 'spring', stiffness: 400, damping: 20 }}
                whileHover={{ scale: 1.08, rotate: -3 }}
                title={`${fmtDate(d)} · ${present ? 'present' : 'absent'}`}
                className={cx(
                  'relative flex aspect-square flex-col items-center justify-center border-[3px] border-ink text-center',
                  present ? 'bg-lime' : 'bg-tomato',
                )}
              >
                {!present && <span className="stripes absolute inset-0 opacity-15" />}
                <span className="relative font-mono text-[10px] font-bold uppercase">{fmtDay(d)}</span>
                <span className="relative font-display text-lg leading-none">{Number(d.slice(8))}</span>
                <span className="relative text-[10px] font-bold">{present ? 'IN' : 'OUT'}</span>
              </motion.div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function History({ data }: { data: MyAttendance }) {
  return (
    <Card variants={item} className="flex max-h-[460px] flex-col">
      <h2 className="border-b-[3px] border-ink px-5 py-4 font-display text-2xl uppercase">History</h2>
      {data.records.length === 0 ? (
        <div className="p-5">
          <Empty title="Nothing yet" />
        </div>
      ) : (
        <ul className="divide-y-2 divide-ink/20 overflow-y-auto">
          {data.records.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div>
                <p className="font-bold">{fmtDate(r.date)}</p>
                <p className="font-mono text-xs text-ink/60">
                  {fmtDay(r.date)} · {fmtTime(r.time)}
                </p>
              </div>
              <Badge tone={r.method === 'self' ? 'pink' : r.method === 'manual' ? 'violet' : 'lime'}>{methodLabel[r.method]}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

const MAX_TRIES = 8

function CheckinBody({ onDone }: { onDone: () => void }) {
  const camera = useCamera()
  const toast = useToast()
  const [faces, setFaces] = useState<FaceResult[]>([])
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const cancelled = useRef(false)

  const { start } = camera
  useEffect(() => {
    cancelled.current = false
    start()
    return () => void (cancelled.current = true)
  }, [start])

  const go = async () => {
    setRunning(true)
    setMessage(null)
    for (let i = 0; i < MAX_TRIES && !cancelled.current; i++) {
      const frame = camera.capture()
      if (frame) {
        try {
          const res = await api.checkin(frame)
          setFaces(res.faces)
          const mine = res.faces.find((f) => f.status === 'marked' || f.status === 'already')
          if (mine) {
            toast(mine.status === 'marked' ? 'Checked in. See you in class!' : 'You were already marked today')
            setTimeout(onDone, 900)
            return
          }
        } catch (e) {
          setMessage((e as Error).message)
          break
        }
      }
      await new Promise((r) => setTimeout(r, 600))
    }
    setRunning(false)
    setMessage((m) => m ?? 'Couldn’t recognise you. Get closer, face the light and try again.')
  }

  return (
    <div className="space-y-4">
      <Viewfinder videoRef={camera.videoRef} state={camera.state} onStart={camera.start} scanning={running} faces={faces} />
      {message && <ErrorNote>{message}</ErrorNote>}
      <Button size="lg" tone="lime" className="w-full" disabled={camera.state !== 'live' || running} onClick={go} icon={<ScanFace size={22} strokeWidth={2.5} />}>
        {running ? 'Looking for you…' : 'Scan my face'}
      </Button>
      <p className="text-center text-sm text-ink/70">Only you can check yourself in — someone else’s face won’t count.</p>
    </div>
  )
}
