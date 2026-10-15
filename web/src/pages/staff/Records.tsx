import { motion } from 'motion/react'
import { Download, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../../components/toast'
import { Avatar, Button, Empty, ErrorNote, Input, Modal, PageHeader, Segmented, Select, Skeleton, StatusBadge, cx } from '../../components/ui'
import { api, download, type RecordRow, type Status } from '../../lib/api'
import { fmtDate, fmtTime, methodLabel, statusLabel, today } from '../../lib/format'
import { useLoad } from '../../lib/hooks'

type StatusFilter = '' | Status

export default function Records() {
  const toast = useToast()
  const courses = useLoad(api.courses)
  const [courseId, setCourseId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [status, setStatus] = useState<StatusFilter>('')
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [editing, setEditing] = useState<RecordRow | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250)
    return () => clearTimeout(t)
  }, [query])

  const params = { course_id: courseId ? Number(courseId) : undefined, from, to, status, q: debounced }
  const { data, error, loading, reload } = useLoad(() => api.records(params), [courseId, from, to, status, debounced])

  const exportCsv = async () => {
    try {
      download(await api.exportRecords(params), `attendance-${today()}.csv`)
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }
  const filtered = courseId || from || to || status || debounced

  return (
    <>
      <PageHeader kicker="The register" title="Records">
        <Button tone="cream" onClick={exportCsv} icon={<Download size={18} strokeWidth={3} />}>
          Export CSV
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" size={18} strokeWidth={2.5} />
          <Input placeholder="Search by name or roll number" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" />
        </div>
        <Select aria-label="Course" value={courseId} onChange={(e) => setCourseId(e.target.value)} className="w-auto!">
          <option value="">All courses</option>
          {courses.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} · {c.name}
            </option>
          ))}
        </Select>
        <Input type="date" aria-label="From" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="w-auto!" />
        <span className="font-bold">→</span>
        <Input type="date" aria-label="To" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="w-auto!" />
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Segmented
          id="status-filter"
          value={status}
          onChange={setStatus}
          options={[
            ['', 'All'],
            ['present', 'Present'],
            ['late', 'Late'],
            ['excused', 'Excused'],
            ['absent', 'Absent'],
          ]}
        />
        <Button tone={from === today() && to === today() ? 'ink' : 'cream'} size="sm" className="py-2" onClick={() => {
            setFrom(today())
            setTo(today())
          }}>
          Today
        </Button>
        {filtered && (
          <Button
            tone="cream"
            size="sm"
            className="py-2"
            onClick={() => {
              setCourseId('')
              setFrom('')
              setTo('')
              setStatus('')
              setQuery('')
            }}
            icon={<X size={14} strokeWidth={3} />}
          >
            Clear filters
          </Button>
        )}
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {!data && loading && <Skeleton className="h-96" />}
      {data && data.rows.length === 0 && <Empty title="Nothing here">No marks match those filters.</Empty>}

      {data && data.rows.length > 0 && (
        <div className={cx('brut relative overflow-x-auto bg-cream transition-opacity', loading && 'opacity-60')}>
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b-[3px] border-ink bg-sun font-mono text-xs uppercase tracking-wider">
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Marked</th>
                <th className="px-4 py-3">How</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.slice(0, 300).map((r, i) => (
                <motion.tr
                  key={`${r.session_id}-${r.student_id}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { delay: Math.min(i, 15) * 0.015 } }}
                  className={cx('cursor-pointer border-b-2 border-ink/15 last:border-b-0 hover:bg-sun/30', i % 2 === 1 && 'bg-paper/60')}
                  onClick={() => setEditing(r)}
                >
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <Avatar name={r.name} seed={r.roll_number} size="sm" />
                      <div>
                        <p className="font-bold leading-tight">{r.name}</p>
                        <p className="font-mono text-xs text-ink/60">{r.roll_number}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2 font-mono text-sm font-bold">{r.course_code}</td>
                  <td className="px-4 py-2 font-medium whitespace-nowrap">
                    {fmtDate(r.date)} <span className="font-mono text-xs text-ink/60">{fmtTime(r.start_time)}</span>
                  </td>
                  <td className="px-4 py-2 font-mono">{r.status === 'absent' || r.status === 'excused' ? '—' : fmtTime(r.time)}</td>
                  <td className="px-4 py-2 text-sm">{r.method ? methodLabel[r.method] : '—'}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          <p className="border-t-[3px] border-ink px-4 py-2 font-mono text-xs font-bold uppercase">
            {data.total} marks{data.total > 300 ? ' · showing the newest 300 — export for all' : ''}
          </p>
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Change mark" tone="sky">
        {editing && (
          <EditMark
            row={editing}
            onDone={() => {
              setEditing(null)
              reload()
            }}
          />
        )}
      </Modal>
    </>
  )
}

function EditMark({ row, onDone }: { row: RecordRow; onDone: () => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const set = async (s: Status) => {
    setBusy(true)
    try {
      await api.setStatus(row.session_id, row.student_id, s)
      toast(`${row.name.split(' ')[0]} → ${statusLabel[s].toLowerCase()} on ${fmtDate(row.date)}`)
      onDone()
    } catch (e) {
      toast((e as Error).message, 'error')
      setBusy(false)
    }
  }
  return (
    <div className="space-y-4">
      <p>
        <b>{row.name}</b> in <b>{row.course_code}</b> on {fmtDate(row.date)} at {fmtTime(row.start_time)}.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {(['present', 'late', 'excused', 'absent'] as const).map((s) => (
          <Button key={s} tone={({ present: 'lime', late: 'tang', excused: 'sky', absent: 'tomato' } as const)[s]} disabled={busy || row.status === s} onClick={() => set(s)}>
            {statusLabel[s]}
          </Button>
        ))}
      </div>
      <div className="flex justify-between text-sm">
        <Link to={`/staff/sessions/${row.session_id}`} className="font-bold underline decoration-2 underline-offset-2">
          Open the class →
        </Link>
        <Link to={`/staff/students/${row.student_id}`} className="font-bold underline decoration-2 underline-offset-2">
          Student profile →
        </Link>
      </div>
    </div>
  )
}
