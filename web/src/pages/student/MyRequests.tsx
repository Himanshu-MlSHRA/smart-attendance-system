import { AnimatePresence } from 'motion/react'
import { MessageSquare, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '../../components/toast'
import { Badge, Button, Card, Empty, ErrorNote, IconButton, Modal, PageHeader, Skeleton, StatusBadge } from '../../components/ui'
import { api, type TimelineEntry } from '../../lib/api'
import { fmtDate, fmtRelDay, fmtTime } from '../../lib/format'
import { useLoad } from '../../lib/hooks'
import { RequestModal } from './RequestModal'

const statusTone = { pending: 'sun', approved: 'lime', rejected: 'tomato' } as const

export default function MyRequests() {
  const toast = useToast()
  const { data, error, reload } = useLoad(api.myRequests)
  const mine = useLoad(api.myAttendance)
  const [picking, setPicking] = useState(false)
  const [requesting, setRequesting] = useState<TimelineEntry | null>(null)

  const eligible = (mine.data?.timeline ?? []).filter((e) => (e.status === 'absent' || e.status === 'late') && !e.request).slice(0, 15)

  return (
    <>
      <PageHeader kicker="Leave & corrections" title="My requests">
        <Button tone="tang" onClick={() => setPicking(true)} icon={<Plus size={18} strokeWidth={3} />}>
          New request
        </Button>
      </PageHeader>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data && !error && <Skeleton className="h-48" />}
      {data?.length === 0 && <Empty title="No requests">Missed a class for a good reason, or got missed by the scanner? Raise a request.</Empty>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <AnimatePresence initial={false}>
          {data?.map((r, i) => (
            <Card key={r.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }} exit={{ opacity: 0, x: 40 }} className="p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={r.kind === 'leave' ? 'sky' : 'violet'}>{r.kind}</Badge>
                    <Badge tone={statusTone[r.status]}>{r.status}</Badge>
                  </div>
                  <p className="mt-2 font-bold">
                    {r.course_code} · {r.topic || r.course_name}
                  </p>
                  <p className="font-mono text-xs text-ink/60">
                    {fmtDate(r.date)} {fmtTime(r.start_time)} · sent {fmtRelDay(r.created_at)}
                  </p>
                  <p className="mt-2 border-l-[4px] border-ink pl-3">“{r.reason}”</p>
                  {r.status !== 'pending' && (
                    <p className="mt-2 flex items-start gap-1.5 text-sm font-medium">
                      <MessageSquare size={14} strokeWidth={2.5} className="mt-0.5 shrink-0" />
                      {r.decided_by_name ?? 'Your teacher'}
                      {r.note ? `: ${r.note}` : r.status === 'approved' ? ' approved it.' : ' rejected it.'}
                    </p>
                  )}
                </div>
                {r.status === 'pending' && (
                  <IconButton
                    label="Cancel request"
                    onClick={async () => {
                      try {
                        await api.cancelRequest(r.id)
                        toast('Request withdrawn', 'info')
                        reload()
                        mine.reload()
                      } catch (e) {
                        toast((e as Error).message, 'error')
                      }
                    }}
                  >
                    <X size={16} strokeWidth={3} />
                  </IconButton>
                )}
              </div>
            </Card>
          ))}
        </AnimatePresence>
      </div>

      <Modal open={picking} onClose={() => setPicking(false)} title="Which class?" tone="tang">
        {eligible.length === 0 ? (
          <p className="font-bold">No missed or late classes to ask about. 🎉</p>
        ) : (
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
            {eligible.map((e) => (
              <li key={e.session_id}>
                <button
                  onClick={() => {
                    setPicking(false)
                    setRequesting(e)
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 border-[3px] border-ink bg-cream px-3 py-2 text-left hover:bg-sun"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">
                      {e.course_code} · {e.topic || e.course_name}
                    </span>
                    <span className="block font-mono text-xs">
                      {fmtDate(e.date)} · {fmtTime(e.start_time)}
                    </span>
                  </span>
                  <StatusBadge status={e.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
      <RequestModal
        entry={requesting}
        onClose={() => setRequesting(null)}
        onDone={() => {
          setRequesting(null)
          reload()
          mine.reload()
        }}
      />
    </>
  )
}
