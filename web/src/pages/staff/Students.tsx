import { AnimatePresence, motion } from 'motion/react'
import { Camera, FileUp, KeyRound, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../../components/toast'
import { Avatar, Badge, Button, Card, Confirm, Empty, ErrorNote, IconButton, Input, Modal, PageHeader, PageSkeleton, PercentBar, cx } from '../../components/ui'
import { Viewfinder } from '../../components/Viewfinder'
import { api, type Student, type StudentRow } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { fmtPct, fmtRelDay } from '../../lib/format'
import { forgetPhoto, useCamera, useLoad } from '../../lib/hooks'

type Filter = 'all' | 'defaulters' | 'no-face'

export default function Students() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const navigate = useNavigate()
  const { data, error, reload } = useLoad(api.students)
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const [enrolling, setEnrolling] = useState<Student | null>(null)
  const [deleting, setDeleting] = useState<StudentRow | null>(null)
  const [resetting, setResetting] = useState<StudentRow | null>(null)
  const [training, setTraining] = useState(false)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data ?? []).filter((s) => {
      if (filter === 'defaulters' && !s.defaulter) return false
      if (filter === 'no-face' && s.enrolled) return false
      return !q || s.name.toLowerCase().includes(q) || s.roll_number.toLowerCase().includes(q) || s.department.toLowerCase().includes(q)
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
      <PageHeader kicker={isAdmin ? 'Everyone' : 'In your classes'} title="Students">
        {isAdmin && (
          <>
            <Button tone="cream" onClick={retrain} disabled={training} icon={<RefreshCw size={18} strokeWidth={3} className={cx(training && 'animate-spin')} />}>
              {training ? 'Training…' : 'Retrain model'}
            </Button>
            <Button tone="sky" onClick={() => setImporting(true)} icon={<FileUp size={18} strokeWidth={3} />}>
              Import CSV
            </Button>
            <Button tone="pink" onClick={() => setAdding(true)} icon={<Plus size={18} strokeWidth={3} />}>
              Add student
            </Button>
          </>
        )}
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
      {!data && !error && <PageSkeleton tiles={0} />}
      {data && shown.length === 0 && (
        <Empty title={data.length ? 'No matches' : 'No students yet'}>{data.length ? 'Try a different search or filter.' : 'Add your first student to get going.'}</Empty>
      )}

      <motion.div layout className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence>
          {shown.map((s, i) => (
            <Card
              key={s.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 12) * 0.03 } }}
              exit={{ opacity: 0, scale: 0.9 }}
              whileHover={{ y: -4, boxShadow: '8px 8px 0 0 #111' }}
              className="flex flex-col"
            >
              <div className="flex items-start gap-3 p-4">
                <button onClick={() => navigate(`/staff/students/${s.id}`)} className="cursor-pointer" aria-label={`Open ${s.name}`}>
                  <Avatar name={s.name} seed={s.roll_number} size="lg" photoId={s.has_photo && s.id} />
                </button>
                <div className="min-w-0 flex-1">
                  <button onClick={() => navigate(`/staff/students/${s.id}`)} className="cursor-pointer text-left font-bold leading-tight hover:underline">
                    {s.name}
                  </button>
                  <p className="font-mono text-xs text-ink/60">
                    {s.roll_number} · {s.department}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.defaulter && <Badge tone="tomato">Defaulter</Badge>}
                    {s.enrolled ? <Badge tone="lime">Face ✓</Badge> : <Badge tone="tang">No face</Badge>}
                    {s.courses.slice(0, 3).map((c) => (
                      <Badge key={c.id} tone="cream">
                        {c.code}
                      </Badge>
                    ))}
                    {s.courses.length > 3 && <Badge tone="cream">+{s.courses.length - 3}</Badge>}
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex flex-col gap-1.5">
                    <IconButton label={`Delete ${s.name}`} onClick={() => setDeleting(s)}>
                      <Trash2 size={15} strokeWidth={2.5} />
                    </IconButton>
                    <IconButton label={`Reset ${s.name}’s password`} onClick={() => setResetting(s)}>
                      <KeyRound size={15} strokeWidth={2.5} />
                    </IconButton>
                  </div>
                )}
              </div>
              <div className="mt-auto border-t-[3px] border-ink p-4">
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="font-mono text-xs font-bold uppercase">Attendance</span>
                  <span className="font-display text-xl">{fmtPct(s.percent)}</span>
                </div>
                <PercentBar value={s.percent} threshold={75} />
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="font-mono text-[11px] text-ink/60">
                    {s.attended}/{s.held} classes{s.last_seen ? ` · seen ${fmtRelDay(s.last_seen)}` : ''}
                  </p>
                  {isAdmin && (
                    <Button size="sm" tone={s.enrolled ? 'cream' : 'sun'} onClick={() => setEnrolling(s)} icon={<Camera size={14} strokeWidth={3} />}>
                      {s.enrolled ? 'More shots' : 'Enroll face'}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </AnimatePresence>
      </motion.div>

      <Modal open={adding} onClose={() => setAdding(false)} title="New student" tone="pink">
        {adding && (
          <AddStudentForm
            onCreated={(s) => {
              setAdding(false)
              reload()
              setEnrolling(s)
            }}
          />
        )}
      </Modal>
      <Modal open={importing} onClose={() => setImporting(false)} title="Import students" tone="sky" wide>
        {importing && <ImportForm onDone={reload} />}
      </Modal>
      <EnrollModal
        student={enrolling}
        onClose={() => setEnrolling(null)}
        onDone={() => {
          if (enrolling) forgetPhoto(enrolling.id)
          setEnrolling(null)
          reload()
        }}
      />
      <Confirm
        open={deleting !== null}
        title="Delete student?"
        confirmLabel="Delete"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await api.deleteStudent(deleting!.id)
          toast(`${deleting!.name} removed`)
          reload()
        }}
      >
        This removes <b>{deleting?.name}</b> ({deleting?.roll_number}), their login, all their attendance marks, and their face photos, so a retrain
        can’t bring them back.
      </Confirm>
      <Confirm
        open={resetting !== null}
        title="Reset password?"
        confirmLabel="Reset"
        tone="sun"
        onClose={() => setResetting(null)}
        onConfirm={async () => {
          await api.resetPassword(resetting!.id)
          toast(`${resetting!.name.split(' ')[0]} can sign in with ${resetting!.roll_number} again`)
        }}
      >
        {resetting?.name}’s password goes back to their roll number (<code className="bg-paper px-1">{resetting?.roll_number}</code>), they’re signed out everywhere, and they’ll
        have to pick a new one on next sign-in.
      </Confirm>
    </>
  )
}

function AddStudentForm({ onCreated }: { onCreated: (s: Student) => void }) {
  const courses = useLoad(api.courses)
  const [form, setForm] = useState({ name: '', roll_number: '', department: 'IT', email: '' })
  const [picked, setPicked] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const s = await api.addStudent({ ...form, course_ids: picked })
      toast(`${s.name} added · first login ${s.roll_number} / ${s.roll_number}`)
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
        <Input id="s-dept" label="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} required />
      </div>
      <Input id="s-email" type="email" label="Email (for alerts)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      {courses.data && courses.data.length > 0 && (
        <div>
          <p className="mb-1.5 font-mono text-xs font-bold uppercase tracking-wider">Courses</p>
          <div className="flex flex-wrap gap-2">
            {courses.data.map((c) => {
              const on = picked.includes(c.id)
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setPicked(on ? picked.filter((x) => x !== c.id) : [...picked, c.id])}
                  className={cx('cursor-pointer border-[3px] border-ink px-2 py-1 text-sm font-bold', on ? 'bg-lime' : 'bg-cream')}
                  aria-pressed={on}
                >
                  {c.code}
                </button>
              )
            })}
          </div>
        </div>
      )}
      <p className="text-sm text-ink/70">They sign in with their roll number as the password and must change it on first login.</p>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" tone="pink" className="w-full" disabled={busy}>
        {busy ? 'Saving…' : 'Save & enroll face →'}
      </Button>
    </form>
  )
}

function ImportForm({ onDone }: { onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ created: string[]; skipped: { line: number; reason: string }[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const upload = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const res = await api.importStudents(file)
      setResult(res)
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const sample = 'name,roll_number,department,email,courses\nPriya Nair,231501,IT,priya@example.edu,ITC501;ITC502\n'

  return (
    <div className="space-y-4">
      <p>Upload a CSV with these columns (email and courses are optional; separate course codes with <code>;</code>):</p>
      <pre className="overflow-x-auto border-[3px] border-ink bg-paper p-3 font-mono text-xs">{sample}</pre>
      <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => upload(e.target.files?.[0])} />
      <div className="flex flex-wrap gap-3">
        <Button tone="sky" disabled={busy} onClick={() => inputRef.current?.click()} icon={<FileUp size={18} strokeWidth={3} />}>
          {busy ? 'Importing…' : 'Choose CSV'}
        </Button>
        <Button
          tone="cream"
          onClick={() => {
            const a = document.createElement('a')
            a.href = URL.createObjectURL(new Blob([sample], { type: 'text/csv' }))
            a.download = 'students-template.csv'
            a.click()
          }}
        >
          Download template
        </Button>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {result && (
        <div className="space-y-2">
          <p className="border-[3px] border-ink bg-lime px-3 py-2 font-bold">
            Added {result.created.length} student{result.created.length === 1 ? '' : 's'}.
          </p>
          {result.skipped.length > 0 && (
            <div className="border-[3px] border-ink bg-tang/60 px-3 py-2">
              <p className="font-bold">Skipped {result.skipped.length}:</p>
              <ul className="mt-1 max-h-40 overflow-y-auto font-mono text-xs">
                {result.skipped.map((s) => (
                  <li key={s.line}>
                    line {s.line}: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Guided enrollment: varied angles give the model a better picture of a face.
const PROMPTS = ['Look straight at the camera', 'Turn a little to your left', 'Turn a little to your right', 'Chin up a touch', 'Chin down a touch', 'Big smile!']
const SHOTS_PER_PROMPT = 2

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
  const [prompt, setPrompt] = useState<number | null>(null)
  const [phase, setPhase] = useState<'ready' | 'capturing' | 'uploading'>('ready')
  const [error, setError] = useState<string | null>(null)
  const total = PROMPTS.length * SHOTS_PER_PROMPT

  const { start } = camera
  useEffect(() => void start(), [start])

  const run = async () => {
    setError(null)
    setShots([])
    setPhase('capturing')
    const taken: string[] = []
    for (let p = 0; p < PROMPTS.length; p++) {
      setPrompt(p)
      await new Promise((r) => setTimeout(r, 1100))
      for (let i = 0; i < SHOTS_PER_PROMPT; i++) {
        const frame = camera.capture(640, 0.9)
        if (frame) {
          taken.push(frame)
          setShots([...taken])
        }
        await new Promise((r) => setTimeout(r, 250))
      }
    }
    setPrompt(null)
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
      <Viewfinder
        videoRef={camera.videoRef}
        state={camera.state}
        onStart={camera.start}
        scanning={phase === 'capturing'}
        overlay={
          <AnimatePresence mode="wait">
            {prompt !== null && (
              <motion.div
                key={prompt}
                initial={{ y: 20, opacity: 0, rotate: -3 }}
                animate={{ y: 0, opacity: 1, rotate: 0 }}
                exit={{ y: -20, opacity: 0 }}
                className="brut absolute bottom-4 left-1/2 -translate-x-1/2 bg-sun px-4 py-2 text-center font-display text-xl whitespace-nowrap uppercase"
              >
                {PROMPTS[prompt]}
              </motion.div>
            )}
          </AnimatePresence>
        }
      />
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
        {Array.from({ length: total }, (_, i) => (
          <div key={i} className="aspect-square overflow-hidden border-2 border-ink bg-paper">
            {shots[i] && <motion.img initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} src={shots[i]} alt="" className="size-full -scale-x-100 object-cover" />}
          </div>
        ))}
      </div>
      <p className="text-sm text-ink/70">Only {student.name.split(' ')[0]} in frame, good light on the face. Follow the prompts — it takes about 10 seconds.</p>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button className="w-full" size="lg" disabled={camera.state !== 'live' || phase !== 'ready'} onClick={run} icon={<Camera size={20} strokeWidth={3} />}>
        {phase === 'capturing' ? `Shooting ${shots.length}/${total}…` : phase === 'uploading' ? 'Learning the face…' : `Start guided capture`}
      </Button>
    </div>
  )
}
