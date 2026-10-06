import { AnimatePresence, motion } from 'motion/react'
import { Download, Plus, Search, Trash2, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useToast } from '../../components/toast'
import { Avatar, Badge, Button, Empty, ErrorNote, IconButton, Input, Loader, Modal, PageHeader, Select, cx } from '../../components/ui'
import { api, type AttendanceRow, type StudentRow } from '../../lib/api'
import { fmtDate, fmtTime, methodLabel, today } from '../../lib/format'
import { useLoad } from '../../lib/hooks'

const methodTone = { camera: 'lime', upload: 'sky', manual: 'violet', self: 'pink' } as const

export default function Records() {
  const toast = useToast()
  const [date, setDate] = useState('')
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250)
    return () => clearTimeout(t)
  }, [query])

  const { data, error, loading, reload } = useLoad(() => api.attendance({ date, q: debounced }), [date, debounced])

  const remove = async (row: AttendanceRow) => {
    try {
      await api.deleteAttendance(row.id)
      toast(`Removed ${row.name} on ${fmtDate(row.date)}`)
      reload()
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const exportCsv = async () => {
    try {
      const blob = await api.exportAttendance()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `attendance-${today()}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  return (
    <>
      <PageHeader kicker="The ledger" title="Records">
        <Button tone="cream" onClick={exportCsv} icon={<Download size={18} strokeWidth={3} />}>
          Export CSV
        </Button>
        <Button tone="sky" onClick={() => setAdding(true)} icon={<Plus size={18} strokeWidth={3} />}>
          Mark manually
        </Button>
      </PageHeader>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" size={18} strokeWidth={2.5} />
          <Input placeholder="Search by name or roll number" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" />
        </div>
        <Input type="date" aria-label="Filter by date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />
        <Button tone={date === today() ? 'ink' : 'cream'} size="sm" className="py-2.5" onClick={() => setDate(today())}>
          Today
        </Button>
        {date && (
          <Button tone="cream" size="sm" className="py-2.5" onClick={() => setDate('')} icon={<X size={14} strokeWidth={3} />}>
            All dates
          </Button>
        )}
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {loading && !data && <Loader />}
      {data && data.length === 0 && (
        <Empty title="Nothing here">{date ? `No one was marked on ${fmtDate(date)}.` : 'No attendance has been recorded yet.'}</Empty>
      )}

      {data && data.length > 0 && (
        <div className="brut relative overflow-x-auto bg-cream">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b-[3px] border-ink bg-sun font-mono text-xs uppercase tracking-wider">
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Dept</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">How</th>
                <th className="px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {data.map((r, i) => (
                  <motion.tr
                    key={r.id}
                    layout
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0, transition: { delay: Math.min(i, 15) * 0.02 } }}
                    exit={{ opacity: 0, x: 40 }}
                    className={cx('border-b-2 border-ink/15 last:border-b-0 hover:bg-sun/30', i % 2 === 1 && 'bg-paper/60')}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={r.name} seed={r.roll_number} size="sm" />
                        <div>
                          <p className="font-bold leading-tight">{r.name}</p>
                          <p className="font-mono text-xs text-ink/60">{r.roll_number}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-medium">{r.department}</td>
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="px-4 py-2.5 font-mono">{fmtTime(r.time)}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={methodTone[r.method]}>{methodLabel[r.method]}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <IconButton label={`Remove ${r.name} on ${r.date}`} onClick={() => remove(r)}>
                        <Trash2 size={15} strokeWidth={2.5} />
                      </IconButton>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          <p className="border-t-[3px] border-ink px-4 py-2 font-mono text-xs font-bold uppercase">{data.length} records</p>
        </div>
      )}

      <ManualModal
        open={adding}
        defaultDate={date || today()}
        onClose={() => setAdding(false)}
        onDone={() => {
          setAdding(false)
          reload()
        }}
      />
    </>
  )
}

function ManualModal({ open, defaultDate, onClose, onDone }: { open: boolean; defaultDate: string; onClose: () => void; onDone: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Mark manually" tone="sky">
      {open && <ManualForm defaultDate={defaultDate} onDone={onDone} />}
    </Modal>
  )
}

function ManualForm({ defaultDate, onDone }: { defaultDate: string; onDone: () => void }) {
  const toast = useToast()
  const [students, setStudents] = useState<StudentRow[]>([])
  const [studentId, setStudentId] = useState('')
  const [date, setDate] = useState(defaultDate)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.students().then((s) => {
      setStudents(s)
      setStudentId((cur) => cur || String(s[0]?.id ?? ''))
    })
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.addAttendance(Number(studentId), date)
      const s = students.find((x) => String(x.id) === studentId)
      toast(`${s?.name ?? 'Student'} marked for ${fmtDate(date)}`)
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Select label="Student" value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} · {s.roll_number}
          </option>
        ))}
      </Select>
      <Input id="m-date" type="date" label="Date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} required />
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" tone="sky" className="w-full" disabled={busy || !studentId}>
        {busy ? 'Saving…' : 'Mark present'}
      </Button>
    </form>
  )
}
