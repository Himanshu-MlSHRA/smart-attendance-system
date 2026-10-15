import { motion } from 'motion/react'
import { Coffee, MessageSquarePlus, Radio, ScanFace } from 'lucide-react'
import { useState } from 'react'
import { Confetti } from '../../components/Confetti'
import { ReportBody, WhatIf } from '../../components/report'
import { Button, Card, ErrorNote, PageSkeleton, StatusBadge } from '../../components/ui'
import { api, type MyAttendance, type OpenSession, type TimelineEntry } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { fmtTime } from '../../lib/format'
import { useLoad } from '../../lib/hooks'
import { CheckInModal } from './CheckIn'
import { RequestModal } from './RequestModal'

export default function StudentHome() {
  const { user } = useAuth()
  // Poll so a class the teacher just started shows up without a refresh.
  const { data, error, reload } = useLoad(api.myAttendance, [], 20_000)
  const [checkingIn, setCheckingIn] = useState<OpenSession | null>(null)
  const [requesting, setRequesting] = useState<TimelineEntry | null>(null)
  const [party, setParty] = useState(0)
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
        <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="font-display text-4xl leading-none uppercase sm:text-6xl">
          Yo, {first}
          <motion.span className="ml-2 inline-block origin-[70%_70%]" animate={{ rotate: [0, 18, -8, 18, 0] }} transition={{ duration: 1.2, delay: 0.4 }}>
            👋
          </motion.span>
        </motion.h1>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {!data && !error && <PageSkeleton tiles={2} />}
      {data && (
        <ReportBody
          report={data}
          side={
            <div className="space-y-6">
              <LiveNow data={data} enrolled={student.enrolled} onCheckIn={setCheckingIn} />
              <Card className="p-5">
                <h2 className="mb-4 font-display text-xl uppercase">What if…</h2>
                <WhatIf attended={data.overall.attended} held={data.overall.held} threshold={data.threshold} />
              </Card>
            </div>
          }
          timelineAction={(e) =>
            (e.status === 'absent' || e.status === 'late') && !e.request ? (
              <button
                onClick={() => setRequesting(e)}
                className="grid size-8 shrink-0 cursor-pointer place-items-center border-[3px] border-ink bg-cream shadow-brut-sm hover:bg-tang"
                title={e.status === 'absent' ? 'Ask for leave or a correction' : 'Ask for a correction'}
                aria-label="Raise a request"
              >
                <MessageSquarePlus size={15} strokeWidth={2.5} />
              </button>
            ) : (
              <span className="size-8 shrink-0" />
            )
          }
        />
      )}

      <CheckInModal
        session={checkingIn}
        liveness={data?.liveness ?? true}
        onClose={() => setCheckingIn(null)}
        onDone={() => {
          setCheckingIn(null)
          setParty(Date.now())
          reload()
        }}
      />
      <RequestModal
        entry={requesting}
        onClose={() => setRequesting(null)}
        onDone={() => {
          setRequesting(null)
          reload()
        }}
      />
      <Confetti fire={party} />
    </>
  )
}

function LiveNow({ data, enrolled, onCheckIn }: { data: MyAttendance; enrolled: boolean; onCheckIn: (s: OpenSession) => void }) {
  const open = data.open_sessions
  return (
    <Card tone={open.length ? 'lime' : 'violet'} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.05 } }} className="dots flex flex-col gap-4 p-5 sm:p-6">
      {open.length === 0 ? (
        <div className="brut bg-cream p-4">
          <p className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-wider">
            <Coffee size={14} strokeWidth={2.5} /> Right now
          </p>
          <p className="font-display text-3xl uppercase">No class running</p>
          <p className="mt-1 text-sm">When your teacher starts a class, it shows up here and you can check yourself in.</p>
        </div>
      ) : (
        open.map((s) => (
          <motion.div key={s.id} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="brut bg-cream p-4">
            <p className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-wider">
              <motion.span animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 1, repeat: Infinity }}>
                <Radio size={14} strokeWidth={3} />
              </motion.span>
              Live now · since {fmtTime(s.start_time)}
            </p>
            <p className="font-display text-2xl leading-tight uppercase">
              {s.course_code} · {s.topic || s.course_name}
            </p>
            <p className="text-sm">{s.teacher_name}</p>
            <div className="mt-3">
              {s.my_status ? (
                <div className="flex items-center gap-2">
                  <StatusBadge status={s.my_status} className="text-sm" /> <span className="text-sm font-bold">You’re checked in.</span>
                </div>
              ) : (
                <Button size="lg" tone="lime" className="w-full" disabled={!enrolled} onClick={() => onCheckIn(s)} icon={<ScanFace size={22} strokeWidth={2.5} />}>
                  {enrolled ? 'Check in now' : 'Face not enrolled yet'}
                </Button>
              )}
            </div>
          </motion.div>
        ))
      )}
      {!enrolled && <p className="text-sm font-bold">Your face isn’t enrolled yet — ask your admin, then you can check yourself in.</p>}
    </Card>
  )
}
