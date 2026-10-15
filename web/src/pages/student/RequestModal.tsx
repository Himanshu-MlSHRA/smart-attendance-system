import { Send } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useToast } from '../../components/toast'
import { Button, ErrorNote, Modal, Segmented, StatusBadge, Textarea } from '../../components/ui'
import { api, type RequestKind, type TimelineEntry } from '../../lib/api'
import { fmtDate, fmtTime } from '../../lib/format'

/** Ask for an absence to be excused (leave) or fixed (correction). */
export function RequestModal({ entry, onClose, onDone }: { entry: TimelineEntry | null; onClose: () => void; onDone: () => void }) {
  return (
    <Modal open={entry !== null} onClose={onClose} title="Raise a request" tone="tang">
      {entry && <RequestForm entry={entry} onDone={onDone} />}
    </Modal>
  )
}

function RequestForm({ entry, onDone }: { entry: TimelineEntry; onDone: () => void }) {
  const toast = useToast()
  const [kind, setKind] = useState<RequestKind>(entry.status === 'late' ? 'correction' : 'leave')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.createRequest(entry.session_id, kind, reason)
      toast('Request sent to your teacher')
      onDone()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center justify-between gap-3 border-[3px] border-ink bg-paper px-3 py-2">
        <div>
          <p className="font-bold">
            {entry.course_code} · {entry.topic || entry.course_name}
          </p>
          <p className="font-mono text-xs">
            {fmtDate(entry.date)} · {fmtTime(entry.start_time)}
          </p>
        </div>
        <StatusBadge status={entry.status} />
      </div>
      {entry.status === 'absent' && (
        <div>
          <p className="mb-1.5 font-mono text-xs font-bold uppercase tracking-wider">What happened?</p>
          <Segmented
            id="req-kind"
            value={kind}
            onChange={setKind}
            options={[
              ['leave', 'I had a reason to miss it'],
              ['correction', 'I was there'],
            ]}
          />
        </div>
      )}
      <p className="text-sm text-ink/70">
        {kind === 'leave'
          ? 'If approved, this class is excused and won’t count against your percentage.'
          : entry.status === 'late'
            ? 'If approved, you’ll be marked on time.'
            : 'If approved, you’ll be marked present.'}
      </p>
      <Textarea id="reason" label="Reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={kind === 'leave' ? 'e.g. Fever — doctor’s note available' : 'e.g. Sat in the back row, scanner missed me'} required minLength={5} />
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" tone="tang" className="w-full" disabled={busy || reason.trim().length < 5} icon={<Send size={18} strokeWidth={3} />}>
        {busy ? 'Sending…' : 'Send request'}
      </Button>
    </form>
  )
}
