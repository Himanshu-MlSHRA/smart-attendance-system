import { motion } from 'motion/react'
import { ArrowLeft, Download, Pencil, Play, Radio, Search, Trash2, UserPlus } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { StartClassModal } from '../../components/StartClass'
import { useToast } from '../../components/toast'
import { Avatar, Badge, Button, Card, Confirm, Empty, ErrorNote, Input, Modal, PageSkeleton, PercentBar, Segmented, Select, cx } from '../../components/ui'
import { api, download, type CourseDetail as Detail } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { fmtDate, fmtPct, fmtTime, today } from '../../lib/format'
import { useLoad } from '../../lib/hooks'

export default function CourseDetail() {
  const id = Number(useParams().id)
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const toast = useToast()
  const navigate = useNavigate()
  const { data, error, reload } = useLoad(() => api.course(id), [id])
  const [tab, setTab] = useState<'roster' | 'classes'>('roster')
  const [starting, setStarting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [rostering, setRostering] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [query, setQuery] = useState('')

  const roster = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data?.roster ?? [])
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.roll_number.includes(q))
      .sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101))
  }, [data, query])

  if (error && !data) return <ErrorNote>{error}</ErrorNote>
  if (!data) return <PageSkeleton tiles={0} />

  const live = data.sessions.find((s) => s.status === 'open')
  const exportRegister = async () => {
    try {
      download(await api.register(id), `${data.code}-register-${today()}.csv`)
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  return (
    <>
      <Link to="/staff/classes" className="mb-3 inline-flex items-center gap-1 font-mono text-xs font-bold uppercase hover:underline">
        <ArrowLeft size={14} strokeWidth={3} /> All classes
      </Link>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge tone="ink" className="mb-2 text-sm">
            {data.code}
          </Badge>
          <h1 className="font-display text-4xl leading-none uppercase sm:text-5xl">{data.name}</h1>
          <p className="mt-2 font-medium">
            {data.teacher_name ?? 'No teacher assigned'} · {data.department} · {data.roster.length} students
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {data.can_run &&
            (live ? (
              <Button tone="lime" onClick={() => navigate(`/staff/sessions/${live.id}`)} icon={<Radio size={18} strokeWidth={3} />}>
                Live class
              </Button>
            ) : (
              <Button tone="lime" onClick={() => setStarting(true)} icon={<Play size={18} strokeWidth={3} />}>
                Start class
              </Button>
            ))}
          <Button tone="cream" onClick={exportRegister} icon={<Download size={18} strokeWidth={3} />}>
            Register CSV
          </Button>
          {isAdmin && (
            <>
              <Button tone="sky" onClick={() => setRostering(true)} icon={<UserPlus size={18} strokeWidth={3} />}>
                Roster
              </Button>
              <Button tone="cream" onClick={() => setEditing(true)} icon={<Pencil size={16} strokeWidth={3} />}>
                Edit
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          id="course-tab"
          value={tab}
          onChange={setTab}
          options={[
            ['roster', `Students · ${data.roster.length}`],
            ['classes', `Classes · ${data.sessions.length}`],
          ]}
        />
        {tab === 'roster' && (
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" size={18} strokeWidth={2.5} />
            <Input placeholder="Find a student" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" />
          </div>
        )}
      </div>

      {tab === 'roster' ? (
        roster.length === 0 ? (
          <Empty title="No students">{isAdmin ? 'Add some with the Roster button.' : 'Nobody is enrolled yet.'}</Empty>
        ) : (
          <div className="brut overflow-x-auto bg-cream">
            <table className="w-full min-w-[680px] text-left">
              <thead>
                <tr className="border-b-[3px] border-ink bg-sun font-mono text-xs uppercase tracking-wider">
                  <th className="px-4 py-3">Student</th>
                  <th className="w-56 px-4 py-3">Attendance</th>
                  <th className="px-4 py-3 text-center">P</th>
                  <th className="px-4 py-3 text-center">L</th>
                  <th className="px-4 py-3 text-center">E</th>
                  <th className="px-4 py-3 text-center">A</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((s, i) => (
                  <motion.tr
                    key={s.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: { delay: Math.min(i, 20) * 0.015 } }}
                    onClick={() => navigate(`/staff/students/${s.id}`)}
                    className="cursor-pointer border-b-2 border-ink/15 last:border-b-0 hover:bg-sun/30"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={s.name} seed={s.roll_number} size="sm" photoId={s.has_photo && s.id} />
                        <div>
                          <p className="font-bold leading-tight">{s.name}</p>
                          <p className="font-mono text-xs text-ink/60">{s.roll_number}</p>
                        </div>
                        {s.defaulter && <Badge tone="tomato">Defaulter</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <PercentBar value={s.percent} threshold={data.threshold} className="flex-1" />
                        <span className="w-11 text-right font-display">{fmtPct(s.percent)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono">{s.present}</td>
                    <td className="px-4 py-2.5 text-center font-mono">{s.late}</td>
                    <td className="px-4 py-2.5 text-center font-mono">{s.excused}</td>
                    <td className={cx('px-4 py-2.5 text-center font-mono', s.absent > 0 && 'font-bold')}>{s.absent}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : data.sessions.length === 0 ? (
        <Empty title="No classes yet">Start the first one.</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {data.sessions.map((s, i) => {
            const rate = data.roster.length ? Math.round((s.present * 100) / Math.max(data.roster.length - s.excused, 1)) : 0
            return (
              <Card
                key={s.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 12) * 0.03 } }}
                className="cursor-pointer p-4 transition-transform hover:-translate-y-1"
                onClick={() => navigate(`/staff/sessions/${s.id}`)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{s.topic || 'Class'}</p>
                    <p className="font-mono text-xs text-ink/60">
                      {fmtDate(s.date)} · {fmtTime(s.start_time)}–{fmtTime(s.end_time)}
                    </p>
                  </div>
                  {s.status === 'open' ? <Badge tone="lime">Live</Badge> : <span className="font-display text-xl">{rate}%</span>}
                </div>
                <PercentBar value={rate} threshold={data.threshold} className="mt-3" />
                <p className="mt-1.5 font-mono text-[11px] text-ink/70">
                  {s.present} in · {s.late} late · {s.excused} excused
                </p>
              </Card>
            )
          })}
        </div>
      )}

      {isAdmin && (
        <div className="mt-10 border-t-[3px] border-dashed border-ink/30 pt-6">
          <Button tone="cream" size="sm" onClick={() => setDeleting(true)} icon={<Trash2 size={14} strokeWidth={3} />}>
            Delete course
          </Button>
        </div>
      )}

      <StartClassModal course={starting ? data : null} onClose={() => setStarting(false)} />
      <EditModal course={editing ? data : null} onClose={() => setEditing(false)} onDone={() => { setEditing(false); reload() }} />
      <RosterModal course={rostering ? data : null} onClose={() => setRostering(false)} onDone={() => { setRostering(false); reload() }} />
      <Confirm
        open={deleting}
        title={`Delete ${data.code}?`}
        confirmLabel="Delete course"
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          await api.deleteCourse(id)
          toast(`${data.code} deleted`)
          navigate('/staff/classes')
        }}
      >
        This deletes the course, its {data.sessions.length} classes and every attendance mark in them. Download the register first if you need it.
      </Confirm>
    </>
  )
}

function EditModal({ course, onClose, onDone }: { course: Detail | null; onClose: () => void; onDone: () => void }) {
  return (
    <Modal open={course !== null} onClose={onClose} title="Edit course" tone="sky">
      {course && <EditForm course={course} onDone={onDone} />}
    </Modal>
  )
}

function EditForm({ course, onDone }: { course: Detail; onDone: () => void }) {
  const toast = useToast()
  const teachers = useLoad(api.teachers)
  const [form, setForm] = useState({ name: course.name, department: course.department, teacher_id: String(course.teacher_id ?? '') })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.updateCourse(course.id, { ...form, teacher_id: form.teacher_id ? Number(form.teacher_id) : null })
      toast('Course updated')
      onDone()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Input id="e-name" label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      <Input id="e-dept" label="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} required />
      <Select label="Teacher" value={form.teacher_id} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}>
        <option value="">— None —</option>
        {teachers.data?.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </Select>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" tone="sky" className="w-full" disabled={busy}>
        {busy ? 'Saving…' : 'Save'}
      </Button>
    </form>
  )
}

function RosterModal({ course, onClose, onDone }: { course: Detail | null; onClose: () => void; onDone: () => void }) {
  return (
    <Modal open={course !== null} onClose={onClose} title="Who takes this course?" tone="sky" wide>
      {course && <RosterForm course={course} onDone={onDone} />}
    </Modal>
  )
}

function RosterForm({ course, onDone }: { course: Detail; onDone: () => void }) {
  const toast = useToast()
  const all = useLoad(api.students)
  const [picked, setPicked] = useState(() => new Set(course.roster.map((s) => s.id)))
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const shown = (all.data ?? []).filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()) || s.roll_number.includes(q))
  const toggle = (id: number) => {
    const next = new Set(picked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPicked(next)
  }
  const save = async () => {
    setBusy(true)
    try {
      const res = await api.setRoster(course.id, [...picked])
      toast(`${res.students} students on ${course.code}`)
      onDone()
    } catch (e) {
      toast((e as Error).message, 'error')
      setBusy(false)
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Button size="sm" tone="cream" onClick={() => setPicked(new Set((all.data ?? []).map((s) => s.id)))}>
          All
        </Button>
        <Button size="sm" tone="cream" onClick={() => setPicked(new Set())}>
          None
        </Button>
        <span className="ml-auto font-mono text-sm font-bold">{picked.size} picked</span>
      </div>
      <ul className="grid max-h-[50vh] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
        {shown.map((s) => (
          <li key={s.id}>
            <label className={cx('flex cursor-pointer items-center gap-2 border-[3px] border-ink p-2', picked.has(s.id) ? 'bg-lime' : 'bg-cream')}>
              <input type="checkbox" className="size-4 accent-ink" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
              <span className="min-w-0 flex-1 truncate font-bold">{s.name}</span>
              <span className="font-mono text-xs">{s.roll_number}</span>
            </label>
          </li>
        ))}
      </ul>
      <Button tone="sky" className="w-full" disabled={busy} onClick={save}>
        {busy ? 'Saving…' : 'Save roster'}
      </Button>
    </div>
  )
}
