import { AnimatePresence, motion } from 'motion/react'
import { Check, Trash2, UserRoundSearch } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useToast } from '../../components/toast'
import { Button, Card, Empty, ErrorNote, PageHeader, Select, Skeleton } from '../../components/ui'
import { api, type StudentRow, type UnknownFace } from '../../lib/api'
import { fmtDate } from '../../lib/format'
import { useLoad } from '../../lib/hooks'

/** Faces the scanner saw but couldn't name. Label them to teach the model (and fix the register). */
export default function UnknownFaces() {
  const { data, error, reload } = useLoad(api.unknown)
  const students = useLoad(api.students)

  return (
    <>
      <PageHeader kicker="Review queue" title="Unknown faces" />
      <p className="mb-6 max-w-2xl text-ink/80">
        When the scanner sees a face it can’t match, it keeps one crop per stranger per class. If it’s a student, say who — the face is added to their model
        and they’re marked present for that class. Otherwise, dismiss it.
      </p>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data && !error && <Skeleton className="h-60" />}
      {data?.length === 0 && <Empty title="All clear">No unknown faces waiting.</Empty>}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <AnimatePresence>
          {data?.map((f) => (
            <FaceCard key={f.id} face={f} students={students.data ?? []} onDone={reload} />
          ))}
        </AnimatePresence>
      </div>
    </>
  )
}

function FaceCard({ face, students, onDone }: { face: UnknownFace; students: StudentRow[]; onDone: () => void }) {
  const toast = useToast()
  const [src, setSrc] = useState<string | null>(null)
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let url: string | null = null
    api
      .unknownImage(face.id)
      .then((b) => setSrc((url = URL.createObjectURL(b))))
      .catch(() => {})
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [face.id])

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true)
    try {
      await fn()
      toast(msg)
      onDone()
    } catch (e) {
      toast((e as Error).message, 'error')
      setBusy(false)
    }
  }

  return (
    <Card layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8, rotate: -4 }} className="flex flex-col">
      <div className="relative aspect-square overflow-hidden border-b-[3px] border-ink bg-ink">
        {src ? (
          <motion.img initial={{ opacity: 0 }} animate={{ opacity: 1 }} src={src} alt="Unrecognised face" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-cream">
            <UserRoundSearch size={40} />
          </div>
        )}
        <span className="absolute top-2 left-2 border-2 border-ink bg-cream px-1.5 font-mono text-[11px] font-bold">
          {face.course_code ?? '—'} · {face.date ? fmtDate(face.date) : fmtDate(face.captured_at)}
        </span>
      </div>
      <div className="space-y-2 p-3">
        <Select aria-label="Who is this?" value={pick} onChange={(e) => setPick(e.target.value)} className="py-1.5 text-sm">
          <option value="">Who is this?</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.roll_number}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Button
            size="sm"
            tone="lime"
            className="flex-1"
            disabled={!pick || busy}
            onClick={() => {
              const s = students.find((x) => String(x.id) === pick)
              act(async () => {
                const res = await api.assignUnknown(face.id, Number(pick))
                if (res.marked) toast(`${s?.name.split(' ')[0]} also marked present for that class`)
              }, `Taught the model ${s?.name ?? 'that face'}`)
            }}
            icon={<Check size={14} strokeWidth={3} />}
          >
            That’s them
          </Button>
          <Button size="sm" tone="cream" disabled={busy} onClick={() => act(() => api.dismissUnknown(face.id), 'Dismissed')} aria-label="Dismiss">
            <Trash2 size={14} strokeWidth={3} />
          </Button>
        </div>
      </div>
    </Card>
  )
}
