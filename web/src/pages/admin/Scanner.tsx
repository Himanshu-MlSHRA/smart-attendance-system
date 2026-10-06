import { AnimatePresence, motion } from 'motion/react'
import { ImageUp, Pause, Play, Video } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useToast } from '../../components/toast'
import { Avatar, Badge, Button, Card, Empty, ErrorNote, PageHeader, cx } from '../../components/ui'
import { Viewfinder } from '../../components/Viewfinder'
import { api, type FaceResult, type Student } from '../../lib/api'
import { useCamera } from '../../lib/hooks'

type Mode = 'live' | 'upload'
interface LogEntry {
  student: Student
  status: 'marked' | 'already'
  at: Date
}

const SCAN_GAP_MS = 900

export default function Scanner() {
  const [mode, setMode] = useState<Mode>('live')
  const [log, setLog] = useState<LogEntry[]>([])

  const record = (faces: FaceResult[]) => {
    const seen = faces.filter((f) => f.student && (f.status === 'marked' || f.status === 'already'))
    if (!seen.length) return
    setLog((prev) => {
      const next = [...prev]
      for (const f of seen) {
        if (next.some((e) => e.student.id === f.student!.id)) continue
        next.unshift({ student: f.student!, status: f.status as LogEntry['status'], at: new Date() })
      }
      return next
    })
  }

  return (
    <>
      <PageHeader kicker="Take attendance" title="Scanner">
        <div className="brut flex bg-cream">
          {(
            [
              ['live', 'Live camera', Video],
              ['upload', 'Group photo', ImageUp],
            ] as const
          ).map(([value, label, Icon], i) => (
            <button
              key={value}
              onClick={() => setMode(value)}
              className={cx('relative flex cursor-pointer items-center gap-2 px-4 py-2.5 font-bold uppercase', i === 1 && 'border-l-[3px] border-ink')}
              aria-pressed={mode === value}
            >
              {mode === value && <motion.span layoutId="scan-mode" className="absolute inset-0 bg-lime" />}
              <Icon className="relative" size={18} strokeWidth={2.5} />
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_340px]">
        <div>{mode === 'live' ? <LiveScan onResult={record} /> : <UploadScan onResult={record} />}</div>
        <SessionLog log={log} onClear={() => setLog([])} />
      </div>
    </>
  )
}

function LiveScan({ onResult }: { onResult: (f: FaceResult[]) => void }) {
  const camera = useCamera()
  const toast = useToast()
  const [scanning, setScanning] = useState(false)
  const [faces, setFaces] = useState<FaceResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<Student | null>(null)
  const onResultRef = useRef(onResult)
  useEffect(() => {
    onResultRef.current = onResult
  })

  // Auto-start the camera when the page opens.
  const { start, capture, state: cameraState } = camera
  useEffect(() => void start(), [start])

  useEffect(() => {
    if (!scanning || cameraState !== 'live') return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    const tick = async () => {
      const frame = capture()
      if (frame) {
        try {
          const res = await api.scan(frame)
          if (cancelled) return
          setFaces(res.faces)
          setError(null)
          onResultRef.current(res.faces)
          const fresh = res.faces.find((f) => f.status === 'marked')
          if (fresh?.student) {
            setFlash(fresh.student)
            toast(`${fresh.student.name} marked present`)
            setTimeout(() => setFlash(null), 1600)
          }
        } catch (e) {
          if (cancelled) return
          setError((e as Error).message)
        }
      }
      if (!cancelled) timer = setTimeout(tick, SCAN_GAP_MS)
    }
    tick()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [scanning, cameraState, capture, toast])

  return (
    <div className="space-y-4">
      <div className="relative">
        <Viewfinder videoRef={camera.videoRef} state={camera.state} onStart={camera.start} scanning={scanning} faces={scanning ? faces : []} />
        <AnimatePresence>
          {flash && (
            <motion.div
              key={flash.id}
              initial={{ scale: 0.4, rotate: -12, opacity: 0 }}
              animate={{ scale: 1, rotate: -4, opacity: 1 }}
              exit={{ scale: 1.3, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 18 }}
              className="brut-lg pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 bg-lime px-6 py-3 text-center"
            >
              <p className="font-display text-3xl uppercase">Present!</p>
              <p className="font-bold">{flash.name}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          tone={scanning ? 'tomato' : 'lime'}
          disabled={camera.state !== 'live'}
          onClick={() => setScanning((s) => !s)}
          icon={scanning ? <Pause size={20} strokeWidth={3} /> : <Play size={20} strokeWidth={3} />}
        >
          {scanning ? 'Pause scanning' : 'Start scanning'}
        </Button>
        <p className="text-sm text-ink/70">
          Point it at the door. Every recognised face is marked once per day — duplicates are ignored.
        </p>
      </div>
    </div>
  )
}

function UploadScan({ onResult }: { onResult: (f: FaceResult[]) => void }) {
  const [preview, setPreview] = useState<string | null>(null)
  const [faces, setFaces] = useState<FaceResult[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const toast = useToast()

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])

  const handle = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('That’s not an image.')
      return
    }
    setPreview(URL.createObjectURL(file))
    setFaces(null)
    setError(null)
    setBusy(true)
    try {
      const res = await api.scanUpload(file)
      setFaces(res.faces)
      onResult(res.faces)
      const marked = res.faces.filter((f) => f.status === 'marked').length
      toast(res.faces.length ? `${res.faces.length} faces found · ${marked} newly marked` : 'No faces found in that photo', res.faces.length ? 'ok' : 'info')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    handle(e.dataTransfer.files[0])
  }

  return (
    <div className="space-y-4">
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => handle(e.target.files?.[0])} />
      {!preview ? (
        <motion.button
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          animate={{ rotate: dragging ? -1 : 0, scale: dragging ? 1.01 : 1 }}
          className={cx(
            'brut-lg grid aspect-video w-full cursor-pointer place-items-center p-6 text-center',
            dragging ? 'bg-lime' : 'dots bg-violet',
          )}
        >
          <div className="brut bg-cream px-6 py-5">
            <ImageUp className="mx-auto mb-2" size={40} strokeWidth={2.5} />
            <p className="font-display text-xl uppercase">Drop a class photo</p>
            <p className="text-sm">or click to pick one. Everyone recognised gets marked.</p>
          </div>
        </motion.button>
      ) : (
        <div className="brut-lg relative overflow-hidden bg-ink">
          <img src={preview} alt="Uploaded class" className="block w-full" />
          {busy && (
            <motion.div
              className="absolute inset-x-0 h-1 bg-lime shadow-[0_0_24px_6px_rgba(166,240,74,0.7)]"
              animate={{ top: ['0%', '100%', '0%'] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          )}
          {faces?.map((f, i) => (
            <motion.div
              key={i}
              initial={{ scale: 1.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: i * 0.08, type: 'spring' }}
              className={cx('absolute border-4', f.status === 'unknown' ? 'border-tomato' : f.status === 'marked' ? 'border-lime' : 'border-sky')}
              style={{
                left: `${f.box.left * 100}%`,
                top: `${f.box.top * 100}%`,
                width: `${(f.box.right - f.box.left) * 100}%`,
                height: `${(f.box.bottom - f.box.top) * 100}%`,
              }}
            >
              <span
                className={cx(
                  'absolute -top-7 left-[-4px] border-2 border-ink px-1.5 text-xs font-bold whitespace-nowrap',
                  f.status === 'unknown' ? 'bg-tomato' : f.status === 'marked' ? 'bg-lime' : 'bg-sky',
                )}
              >
                {f.student?.name.split(' ')[0] ?? '?'}
              </span>
            </motion.div>
          ))}
        </div>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      {preview && (
        <div className="flex flex-wrap items-center gap-3">
          <Button tone="violet" onClick={() => inputRef.current?.click()} disabled={busy} icon={<ImageUp size={18} strokeWidth={3} />}>
            {busy ? 'Recognising…' : 'Another photo'}
          </Button>
          {faces && (
            <p className="font-mono text-sm font-bold">
              {faces.length} faces · {faces.filter((f) => f.student).length} recognised · {faces.filter((f) => f.status === 'unknown').length} unknown
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function SessionLog({ log, onClear }: { log: LogEntry[]; onClear: () => void }) {
  return (
    <Card className="flex max-h-[640px] flex-col self-start">
      <div className="flex items-center justify-between border-b-[3px] border-ink bg-sun px-4 py-3">
        <h2 className="font-display text-xl uppercase">This session</h2>
        <span className="brut grid min-w-9 place-items-center bg-cream px-1.5 font-display text-lg">{log.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {log.length === 0 ? (
          <Empty title="Waiting…">Recognised students land here.</Empty>
        ) : (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {log.map((e) => (
                <motion.li
                  key={e.student.id}
                  layout
                  initial={{ opacity: 0, x: 40, rotate: 3 }}
                  animate={{ opacity: 1, x: 0, rotate: 0 }}
                  className="flex items-center gap-3 border-[3px] border-ink bg-cream p-2"
                >
                  <Avatar name={e.student.name} seed={e.student.roll_number} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{e.student.name}</p>
                    <p className="font-mono text-[11px] text-ink/60">
                      {e.student.roll_number} · {e.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <Badge tone={e.status === 'marked' ? 'lime' : 'sky'}>{e.status === 'marked' ? 'New' : 'Had'}</Badge>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
      {log.length > 0 && (
        <button onClick={onClear} className="cursor-pointer border-t-[3px] border-ink py-2 font-mono text-xs font-bold uppercase hover:bg-paper">
          Clear list
        </button>
      )}
    </Card>
  )
}
