import { motion } from 'motion/react'
import { ArrowUpRight, BookOpen, Play, Plus, Radio, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Ring } from '../../components/charts'
import { StartClassModal } from '../../components/StartClass'
import { useToast } from '../../components/toast'
import { Badge, Button, Card, Empty, ErrorNote, Input, Modal, PageHeader, PageSkeleton, Select, Skeleton } from '../../components/ui'
import { api, type Course } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { fmtDate, fmtTime } from '../../lib/format'
import { useLoad } from '../../lib/hooks'

export default function Classes() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin'
  const { data, error, reload } = useLoad(api.courses)
  const recent = useLoad(() => api.sessions())
  const [starting, setStarting] = useState<Course | null>(null)
  const [adding, setAdding] = useState(false)

  return (
    <>
      <PageHeader kicker={isAdmin ? 'Every course' : 'What you teach'} title="Classes">
        {isAdmin && (
          <Button tone="pink" onClick={() => setAdding(true)} icon={<Plus size={18} strokeWidth={3} />}>
            New course
          </Button>
        )}
      </PageHeader>

      {error && <ErrorNote>{error}</ErrorNote>}
      {!data && !error && <PageSkeleton tiles={0} />}
      {data && data.length === 0 && <Empty title="No courses yet">{isAdmin ? 'Create the first one.' : 'Ask an admin to assign you a course.'}</Empty>}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {data?.map((c, i) => (
          <Card
            key={c.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05 } }}
            whileHover={{ y: -4, boxShadow: '8px 8px 0 0 #111' }}
            className="flex flex-col"
          >
            <div className="flex items-start gap-4 p-5">
              <Ring percent={c.rate} threshold={75} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="ink">{c.code}</Badge>
                  {c.open_session_id && (
                    <Badge tone="lime">
                      <motion.span animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 1, repeat: Infinity }}>
                        ●
                      </motion.span>{' '}
                      Live now
                    </Badge>
                  )}
                </div>
                <p className="mt-2 font-display text-2xl leading-tight uppercase">{c.name}</p>
                <p className="mt-1 text-sm font-medium">{c.teacher_name ?? 'No teacher assigned'}</p>
                <p className="mt-1 flex items-center gap-3 font-mono text-xs text-ink/70">
                  <span className="flex items-center gap-1">
                    <Users size={13} strokeWidth={2.5} /> {c.students}
                  </span>
                  <span className="flex items-center gap-1">
                    <BookOpen size={13} strokeWidth={2.5} /> {c.sessions} held
                  </span>
                </p>
              </div>
            </div>
            <div className="mt-auto flex flex-wrap gap-3 border-t-[3px] border-ink bg-paper p-4">
              {c.open_session_id ? (
                <Button tone="lime" onClick={() => navigate(`/staff/sessions/${c.open_session_id}`)} icon={<Radio size={18} strokeWidth={3} />}>
                  Open live class
                </Button>
              ) : (
                <Button tone="lime" onClick={() => setStarting(c)} icon={<Play size={18} strokeWidth={3} />}>
                  Start class
                </Button>
              )}
              <Button tone="cream" onClick={() => navigate(`/staff/classes/${c.id}`)} icon={<ArrowUpRight size={18} strokeWidth={3} />}>
                Roster & history
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <h2 className="mt-10 mb-4 font-display text-2xl uppercase">Recent classes</h2>
      {!recent.data && <Skeleton className="h-40" />}
      {recent.data && recent.data.length === 0 && <Empty title="None yet" />}
      {recent.data && recent.data.length > 0 && (
        <div className="brut overflow-x-auto bg-cream">
          <table className="w-full min-w-[560px] text-left">
            <thead>
              <tr className="border-b-[3px] border-ink bg-sun font-mono text-xs uppercase tracking-wider">
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Turnout</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {recent.data.slice(0, 12).map((s) => (
                <tr key={s.id} className="border-b-2 border-ink/15 last:border-b-0 hover:bg-sun/30">
                  <td className="px-4 py-2.5">
                    <p className="font-bold">{s.course_code}</p>
                    <p className="text-sm text-ink/70">{s.topic || s.course_name}</p>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-sm whitespace-nowrap">
                    {fmtDate(s.date)} · {fmtTime(s.start_time)}
                  </td>
                  <td className="px-4 py-2.5 font-display text-lg">
                    {s.present}/{s.roster}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link to={`/staff/sessions/${s.id}`} className="font-bold underline decoration-2 underline-offset-2">
                      {s.status === 'open' ? 'Live →' : 'Open →'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <StartClassModal course={starting} onClose={() => setStarting(null)} />
      <NewCourseModal
        open={adding}
        onClose={() => setAdding(false)}
        onDone={() => {
          setAdding(false)
          reload()
        }}
      />
    </>
  )
}

function NewCourseModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="New course" tone="pink">
      {open && <NewCourseForm onDone={onDone} />}
    </Modal>
  )
}

function NewCourseForm({ onDone }: { onDone: () => void }) {
  const toast = useToast()
  const teachers = useLoad(api.teachers)
  const [form, setForm] = useState({ code: '', name: '', department: 'IT', teacher_id: '', enroll_department: true })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.addCourse({ ...form, teacher_id: form.teacher_id ? Number(form.teacher_id) : null })
      toast(`${form.code.toUpperCase()} created`)
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-[1fr_2fr] gap-4">
        <Input id="c-code" label="Code" placeholder="ITC601" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required autoFocus />
        <Input id="c-name" label="Name" placeholder="Deep Learning" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input id="c-dept" label="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} required />
        <Select label="Teacher" value={form.teacher_id} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}>
          <option value="">— None yet —</option>
          {teachers.data?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </div>
      <label className="flex cursor-pointer items-center gap-2 font-bold">
        <input type="checkbox" className="size-5 accent-ink" checked={form.enroll_department} onChange={(e) => setForm({ ...form, enroll_department: e.target.checked })} />
        Put every {form.department || 'department'} student on the roster
      </label>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" tone="pink" className="w-full" disabled={busy}>
        {busy ? 'Creating…' : 'Create course'}
      </Button>
    </form>
  )
}
