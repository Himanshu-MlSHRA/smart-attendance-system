import { AnimatePresence, motion } from 'motion/react'
import { Camera, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useToast } from '../../components/toast'
import { Avatar, Badge, Button, Card, Empty, ErrorNote, IconButton, Input, Loader, Modal, PageHeader, cx } from '../../components/ui'
import { Viewfinder } from '../../components/Viewfinder'
import { api, type Student, type StudentRow } from '../../lib/api'
import { fmtDate } from '../../lib/format'
import { useCamera, useLoad } from '../../lib/hooks'

type Filter = 'all' | 'defaulters' | 'no-face'

export default function Students() {
  const { data, error, loading, reload } = useLoad(api.students)
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [adding, setAdding] = useState(false)
  const [enrolling, setEnrolling] = useState<Student | null>(null)
  const [deleting, setDeleting] = useState<StudentRow | null>(null)
  const [training, setTraining] = useState(false)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data ?? []).filter((s) => {
      if (filter === 'defaulters' && !s.defaulter) return false
      if (filter === 'no-face' && s.enrolled) return false
      return !q || s.name.toLowerCase().includes(q) || s.roll_number.includes(q) || s.department.toLowerCase().includes(q)
    })
  }, [data, query, filter])

  const retrain = async () => {
    setTraining(true)
    try {
      const res = await api.train()
      toast(`Model retrained · ${res.faces} faces across ${res.people} people`)
      reload()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setTraining(false)
    }
  }

  const counts = {
    all: data?.length ?? 0,
    defaulters: data?.filter((s) => s.defaulter).length ?? 0,
    'no-face': data?.filter((s) => !s.enrolled).length ?? 0,
  }

  return (
    <>
      <PageHeader kicker="Roster" title="Students">
        <Button tone="cream" onClick={retrain} disabled={training} icon={<RefreshCw size={18} strokeWidth={3} className={cx(training && 'animate-spin')} />}>
          {training ? 'Training…' : 'Retrain model'}
        </Button>
        <Button tone="pink" onClick={() => setAdding(true)} icon={<Plus size={18} strokeWidth={3} />}>
          Add student
        </Button>
      </PageHeader>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" size={18} strokeWidth={2.5} />
          <Input placeholder="Search name, roll number, department" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" />
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['all', 'All'],
              ['defaulters', 'Defaulters'],
              ['no-face', 'No face yet'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={cx(
                'cursor-pointer border-[3px] border-ink px-3 py-2 text-sm font-bold uppercase transition-transform',
                filter === value ? 'bg-ink text-cream' : 'bg-cream shadow-brut-sm hover:-translate-y-0.5',
              )}
            >
              {label} <span className="font-mono">{counts[value]}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {loading && !data && <Loader />}
      {data && shown.length === 0 && (
        <Empty title={data.length ? 'No matches' : 'No students yet'}>
          {data.length ? 'Try a different search or filter.' : 'Add your first student to get going.'}
        </Empty>
      )}

      <motion.div layout className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence>
          {shown.map((s, i) => (
            <Card
              key={s.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 10) * 0.04 } }}
              exit={{ opacity: 0, scale: 0.9 }}
              whileHover={{ y: -4, boxShadow: '8px 8px 0 0 #111' }}
              className="flex flex-col"
            >
              <div className="flex items-start gap-3 p-4">
                <Avatar name={s.name} seed={s.roll_number} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold leading-tight">{s.name}</p>
                  <p className="font-mono text-xs text-ink/60">
                    {s.roll_number} · {s.department}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.defaulter && <Badge tone="tomato">Defaulter</Badge>}
                    {s.enrolled ? <Badge tone="lime">Face ✓</Badge> : <Badge tone="tang">No face</Badge>}
                  </div>
                </div>
                <IconButton label={`Delete ${s.name}`} tone="cream" onClick={() => setDeleting(s)}>
                  <Trash2 size={16} strokeWidth={2.5} />
                </IconButton>
              </div>
              <div className="mt-auto border-t-[3px] border-ink p-4">
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="font-mono text-xs font-bold uppercase">Attendance</span>
                  <span className="font-display text-xl">{s.percent}%</span>
                </div>
                <div className="relative h-4 border-[3px] border-ink bg-paper">
                  <motion.div
                    className={cx('h-full', s.defaulter ? 'bg-tomato' : 'bg-lime')}
                    initial={{ width: 0 }}
                    animate={{ width: `${s.percent}%` }}
                    transition={{ type: 'spring', stiffness: 80, damping: 16, delay: 0.2 }}
                  />
                  <span className="absolute inset-y-0 left-3/4 w-[3px] bg-ink" title="75% threshold" />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="font-mono text-[11px] text-ink/60">
                    {s.attended}/{s.class_days} days{s.last_seen ? ` · last ${fmtDate(s.last_seen.slice(0, 10))}` : ''}
                  </p>
                  <Button size="sm" tone={s.enrolled ? 'cream' : 'sun'} onClick={() => setEnrolling(s)} icon={<Camera size={14} strokeWidth={3} />}>
                    {s.enrolled ? 'More shots' : 'Enroll face'}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </AnimatePresence>
      </motion.div>

      <AddStudentModal
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(s) => {
          setAdding(false)
          reload()
          setEnrolling(s)
        }}
      />
      <EnrollModal
        student={enrolling}
        onClose={() => setEnrolling(null)}
        onDone={() => {
          setEnrolling(null)
          reload()
        }}
      />
      <Modal open={deleting !== null} onClose={() => setDeleting(null)} title="Delete student?" tone="tomato">
        {deleting && (
          <DeleteConfirm
            student={deleting}
            onCancel={() => setDeleting(null)}
            onDeleted={() => {
              toast(`${deleting.name} removed`)
              setDeleting(null)
              reload()
            }}
          />
        )}
      </Modal>
    </>
  )
}

function DeleteConfirm({ student, onCancel, onDeleted }: { student: StudentRow; onCancel: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="space-y-4">
      <p>
        This removes <b>{student.name}</b> ({student.roll_number}), their login, all {student.attended} attendance records and their face data from
        the model. Their photos stay in <code className="bg-paper px-1">dataset/</code>.
      </p>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex justify-end gap-3">
        <Button tone="cream" onClick={onCancel}>
          Keep
        </Button>
        <Button
          tone="tomato"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await api.deleteStudent(student.id)
              onDeleted()
            } catch (e) {
              setError((e as Error).message)
              setBusy(false)
            }
          }}
        >
          {busy ? 'Deleting…' : 'Delete'}
        </Button>
      </div>
    </div>
  )
}

function AddStudentModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (s: Student) => void }) {
  return (
    <Modal open={open} onClose={onClose} title="New student" tone="pink">
      {open && <AddStudentForm onCreated={onCreated} />}
    </Modal>
  )
}

function AddStudentForm({ onCreated }: { onCreated: (s: Student) => void }) {
  const [form, setForm] = useState({ name: '', roll_number: '', department: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const s = await api.addStudent(form)
      toast(`${s.name} added · login ${s.roll_number} / ${s.roll_number}`)
      onCreated(s)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Input id="s-name" label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
      <div className="grid grid-cols-2 gap-4">
        <Input id="s-roll" label="Roll number" value={form.roll_number} onChange={(e) => setForm({ ...form, roll_number: e.target.value })} required />
        <Input id="s-dept" label="Department" placeholder="IT" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} required />
      </div>
      <p className="text-sm text-ink/70">They sign in with their roll number; the starting password is the roll number too.</p>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" tone="pink" className="w-full" disabled={busy}>
        {busy ? 'Saving…' : 'Save & enroll face →'}
      </Button>
    </form>
  )
}

const SHOTS = 12

function EnrollModal({ student, onClose, onDone }: { student: Student | null; onClose: () => void; onDone: () => void }) {
  return (
    <Modal open={student !== null} onClose={onClose} title="Enroll face" tone="sun" wide>
      {student && <EnrollBody student={student} onDone={onDone} />}
    </Modal>
  )
}

function EnrollBody({ student, onDone }: { student: Student; onDone: () => void }) {
  const camera = useCamera()
  const toast = useToast()
  const [shots, setShots] = useState<string[]>([])
  const [phase, setPhase] = useState<'ready' | 'capturing' | 'uploading'>('ready')
  const [error, setError] = useState<string | null>(null)

  const { start } = camera
  useEffect(() => void start(), [start])

  const run = async () => {
    setError(null)
    setShots([])
    setPhase('capturing')
    const taken: string[] = []
    for (let i = 0; i < SHOTS; i++) {
      await new Promise((r) => setTimeout(r, 280))
      const frame = camera.capture(640, 0.9)
      if (frame) {
        taken.push(frame)
        setShots([...taken])
      }
    }
    setPhase('uploading')
    try {
      const res = await api.enroll(student.id, taken)
      toast(`${res.added} of ${res.sent} shots enrolled for ${student.name}`)
      onDone()
    } catch (e) {
      setError((e as Error).message)
      setPhase('ready')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Avatar name={student.name} seed={student.roll_number} />
        <div>
          <p className="font-bold">{student.name}</p>
          <p className="font-mono text-xs text-ink/60">
            {student.roll_number} · {student.department}
          </p>
        </div>
      </div>
      <Viewfinder videoRef={camera.videoRef} state={camera.state} onStart={camera.start} scanning={phase === 'capturing'} />
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
        {Array.from({ length: SHOTS }, (_, i) => (
          <div key={i} className="aspect-square overflow-hidden border-2 border-ink bg-paper">
            {shots[i] && (
              <motion.img
                initial={{ scale: 1.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                src={shots[i]}
                alt=""
                className="size-full -scale-x-100 object-cover"
              />
            )}
          </div>
        ))}
      </div>
      <p className="text-sm text-ink/70">Only {student.name.split(' ')[0]} in frame, face the camera, and slowly turn your head a little while it shoots.</p>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button className="w-full" size="lg" disabled={camera.state !== 'live' || phase !== 'ready'} onClick={run} icon={<Camera size={20} strokeWidth={3} />}>
        {phase === 'capturing' ? `Shooting ${shots.length}/${SHOTS}…` : phase === 'uploading' ? 'Learning the face…' : `Capture ${SHOTS} shots`}
      </Button>
    </div>
  )
}
