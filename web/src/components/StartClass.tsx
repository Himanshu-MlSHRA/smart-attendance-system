import { Play } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { Button, ErrorNote, Input, Modal, Segmented } from './ui'

const DURATIONS = [
  ['45', '45 min'],
  ['60', '1 hr'],
  ['90', '1.5 hr'],
  ['120', '2 hr'],
] as const
const LATE = [
  ['5', '5 min'],
  ['10', '10 min'],
  ['15', '15 min'],
] as const

export function StartClassModal({ course, onClose }: { course: { id: number; code: string; name: string } | null; onClose: () => void }) {
  return (
    <Modal open={course !== null} onClose={onClose} title="Start a class" tone="lime">
      {course && <StartClassForm course={course} />}
    </Modal>
  )
}

function StartClassForm({ course }: { course: { id: number; code: string; name: string } }) {
  const navigate = useNavigate()
  const [topic, setTopic] = useState('')
  const [duration, setDuration] = useState<(typeof DURATIONS)[number][0]>('60')
  const [late, setLate] = useState<(typeof LATE)[number][0]>('10')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { id } = await api.startSession(course.id, { topic, duration: Number(duration), late_after: Number(late) })
      navigate(`/staff/sessions/${id}`)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="font-bold">
        <span className="font-mono">{course.code}</span> · {course.name}
      </p>
      <Input id="topic" label="Topic (optional)" placeholder="e.g. Decision trees" value={topic} onChange={(e) => setTopic(e.target.value)} autoFocus />
      <div>
        <p className="mb-1.5 font-mono text-xs font-bold uppercase tracking-wider">Length</p>
        <Segmented id="duration" value={duration} onChange={setDuration} options={DURATIONS} />
      </div>
      <div>
        <p className="mb-1.5 font-mono text-xs font-bold uppercase tracking-wider">Late after</p>
        <Segmented id="late" value={late} onChange={setLate} options={LATE} />
      </div>
      <p className="text-sm text-ink/70">
        Starting now opens the scanner and a rotating code students can use to check themselves in.
      </p>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" tone="lime" size="lg" className="w-full" disabled={busy} icon={<Play size={20} strokeWidth={3} />}>
        {busy ? 'Starting…' : 'Start class now'}
      </Button>
    </form>
  )
}
