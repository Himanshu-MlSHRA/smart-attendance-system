import { AnimatePresence, motion } from 'motion/react'
import { Check, MessageSquare, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../../components/toast'
import { Avatar, Badge, Button, Card, Empty, ErrorNote, Input, PageHeader, Segmented, Skeleton } from '../../components/ui'
import { api, type LeaveRequest, type RequestStatus } from '../../lib/api'
import { fmtDate, fmtRelDay, fmtTime } from '../../lib/format'
import { useLoad } from '../../lib/hooks'

const kindLabel = { leave: 'Leave', correction: 'Correction' }
const statusTone = { pending: 'sun', approved: 'lime', rejected: 'tomato' } as const

export default function Requests() {
  const [filter, setFilter] = useState<RequestStatus | ''>('pending')
  const { data, error, reload } = useLoad(() => api.requests(filter || undefined), [filter])

  return (
    <>
      <PageHeader kicker="Leave & corrections" title="Requests">
        <Segmented
          id="req-filter"
          value={filter}
          onChange={setFilter}
          options={[
            ['pending', 'Pending'],
            ['approved', 'Approved'],
            ['rejected', 'Rejected'],
            ['', 'All'],
          ]}
        />
      </PageHeader>
      <p className="mb-6 max-w-2xl text-ink/80">
        <b>Leave</b> turns an absence into <i>excused</i>, so it doesn’t count against the student. <b>Correction</b> means “I was there but wasn’t marked” and turns it into
        <i> present</i>.
      </p>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data && !error && <Skeleton className="h-60" />}
      {data && data.length === 0 && <Empty title={filter === 'pending' ? 'Inbox zero' : 'Nothing here'}>{filter === 'pending' ? 'No one is waiting on you.' : 'No requests match.'}</Empty>}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AnimatePresence initial={false}>
          {data?.map((r, i) => (
            <RequestCard key={r.id} r={r} delay={i * 0.04} onDone={reload} />
          ))}
        </AnimatePresence>
      </div>
    </>
  )
}

function RequestCard({ r, delay, onDone }: { r: LeaveRequest; delay: number; onDone: () => void }) {
  const toast = useToast()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const decide = async (approve: boolean) => {
    setBusy(true)
    try {
      await api.decide(r.id, approve, note)
      toast(`${approve ? 'Approved' : 'Rejected'} ${r.name.split(' ')[0]}’s ${r.kind}`, approve ? 'ok' : 'info')
      onDone()
    } catch (e) {
      toast((e as Error).message, 'error')
      setBusy(false)
    }
  }
  return (
    <Card layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0, transition: { delay } }} exit={{ opacity: 0, x: 60 }} className="flex flex-col">
      <div className="flex items-start gap-3 p-4">
        <Link to={`/staff/students/${r.student_id}`}>
          <Avatar name={r.name} seed={r.roll_number} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold">{r.name}</p>
            <Badge tone={r.kind === 'leave' ? 'sky' : 'violet'}>{kindLabel[r.kind]}</Badge>
            <Badge tone={statusTone[r.status]}>{r.status}</Badge>
          </div>
          <p className="font-mono text-xs text-ink/60">
            {r.course_code} · {fmtDate(r.date)} {fmtTime(r.start_time)}
            {r.topic ? ` · ${r.topic}` : ''}
          </p>
          <p className="mt-2 border-l-[4px] border-ink pl-3 font-medium">“{r.reason}”</p>
          <p className="mt-1 font-mono text-[11px] text-ink/60">asked {fmtRelDay(r.created_at)}</p>
          {r.status !== 'pending' && (
            <p className="mt-2 flex items-start gap-1.5 text-sm">
              <MessageSquare size={14} strokeWidth={2.5} className="mt-0.5 shrink-0" />
              {r.decided_by_name ?? 'Staff'}
              {r.note ? `: ${r.note}` : ''}
            </p>
          )}
        </div>
      </div>
      {r.status === 'pending' && (
        <motion.div className="mt-auto flex flex-wrap items-center gap-2 border-t-[3px] border-ink bg-paper p-3">
          <Input placeholder="Note to student (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="min-w-40 flex-1 py-1.5" />
          <Button size="sm" tone="lime" disabled={busy} onClick={() => decide(true)} icon={<Check size={14} strokeWidth={3} />}>
            Approve
          </Button>
          <Button size="sm" tone="tomato" disabled={busy} onClick={() => decide(false)} icon={<X size={14} strokeWidth={3} />}>
            Reject
          </Button>
        </motion.div>
      )}
    </Card>
  )
}
