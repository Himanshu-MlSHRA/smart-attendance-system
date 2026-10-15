import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ImageUp, MonitorPlay, Pause, Play, RotateCcw, ScanSearch, Square, Video, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CodeCard } from '../../components/CodeCard'
import { useToast } from '../../components/toast'
import { Avatar, Badge, Button, Card, Confirm, Empty, ErrorNote, Modal, PageSkeleton, Segmented, StatusBadge, cx } from '../../components/ui'
import { Viewfinder } from '../../components/Viewfinder'
import { api, type FaceResult, type LiveSession, type RosterStatus, type Status, type Student } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { fmtDate, fmtTime, methodLabel, statusLabel } from '../../lib/format'
import { useCamera, useLoad } from '../../lib/hooks'
import { chime } from '../../lib/sound'

const SCAN_GAP_MS = 900

export default function LiveClass() {
  const id = Number(useParams().id)
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const { data, error, reload } = useLoad(() => api.session(id), [id], 3000)
  const [mode, setMode] = useState<'live' | 'upload'>('live')
  const [ending, setEnding] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState<LiveSession['roster'][number] | null>(null)
  const [sound, setSound] = useState(true)

  if (error && !data) return <ErrorNote>{error}</ErrorNote>
  if (!data) return <PageSkeleton tiles={3} />

  const open = data.status === 'open'
  const onFaces = (faces: FaceResult[]) => {
    if (faces.some((f) => f.status === 'marked')) {
      if (sound) chime('ok')
      reload()
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to={`/staff/classes/${data.course_id}`} className="mb-3 inline-flex items-center gap-1 font-mono text-xs font-bold uppercase hover:underline">
            <ArrowLeft size={14} strokeWidth={3} /> {data.course_code} · {data.course_name}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-4xl leading-none uppercase sm:text-5xl">{data.topic || 'Class'}</h1>
            {open ? (
              <Badge tone="lime" className="text-sm">
                <motion.span animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 1, repeat: Infinity }}>
                  ●
                </motion.span>{' '}
                Live
              </Badge>
            ) : (
              <Badge tone="ink" className="text-sm">
                Ended
              </Badge>
            )}
          </div>
          <p className="mt-2 font-mono text-sm">
            {fmtDate(data.date)} · {fmtTime(data.start_time)}–{fmtTime(data.end_time)} · late after {data.late_after} min
          </p>
        </div>
        {data.can_run && (
          <div className="flex flex-wrap gap-3">
            {open ? (
              <>
                <Button tone="sky" onClick={() => window.open(`/projector/${id}`, '_blank', 'noopener')} icon={<MonitorPlay size={18} strokeWidth={3} />}>
                  Projector mode
                </Button>
                <Button tone="tomato" onClick={() => setEnding(true)} icon={<Square size={16} strokeWidth={3} />}>
                  End class
                </Button>
              </>
            ) : (
              <Button
                tone="cream"
                onClick={async () => {
                  try {
                    await api.reopenSession(id)
                    toast('Class reopened')
                    reload()
                  } catch (e) {
                    toast((e as Error).message, 'error')
                  }
                }}
                icon={<RotateCcw size={16} strokeWidth={3} />}
              >
                Reopen
              </Button>
            )}
            {user?.role === 'admin' && !open && (
              <Button tone="cream" onClick={() => setDeleting(true)}>
                Delete
              </Button>
            )}
          </div>
        )}
      </div>

      <Tally session={data} />

      {open && data.can_run ? (
        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr_1fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Segmented
                id="scan-mode"
                value={mode}
                onChange={setMode}
                options={[
                  ['live', <><Video size={16} strokeWidth={2.5} /> Live camera</>],
                  ['upload', <><ImageUp size={16} strokeWidth={2.5} /> Group photo</>],
                ]}
              />
              <button onClick={() => setSound(!sound)} className="flex cursor-pointer items-center gap-1.5 font-mono text-xs font-bold uppercase" aria-pressed={sound}>
                {sound ? <Volume2 size={16} strokeWidth={2.5} /> : <VolumeX size={16} strokeWidth={2.5} />} Sound {sound ? 'on' : 'off'}
              </button>
            </div>
            {mode === 'live' ? <LiveScan sessionId={id} onFaces={onFaces} /> : <UploadScan sessionId={id} onFaces={onFaces} />}
            <CodeCard session={data} onExpire={reload} />
            {data.unknown_faces > 0 && user?.role === 'admin' && (
              <Link to="/staff/unknown" className="brut flex items-center gap-2 bg-violet px-4 py-2 font-bold">
                <ScanSearch size={18} strokeWidth={2.5} /> {data.unknown_faces} unknown face{data.unknown_faces > 1 ? 's' : ''} saved for review →
              </Link>
            )}
          </div>
          <Roster session={data} onPick={setEditing} />
        </div>
      ) : (
        <div className="mt-6">
          <Roster session={data} onPick={data.can_run ? setEditing : undefined} wide />
        </div>
      )}

      <StatusModal
        sessionId={id}
        entry={editing}
        onClose={() => setEditing(null)}
        onDone={() => {
          setEditing(null)
          reload()
        }}
      />
      <Confirm
        open={ending}
        title="End this class?"
        confirmLabel="End class"
        onClose={() => setEnding(false)}
        onConfirm={async () => {
          await api.closeSession(id)
          toast(`Class ended · ${data.counts.waiting} marked absent`)
          reload()
        }}
      >
        Everyone not marked yet ({data.counts.waiting}) will count as <b>absent</b>. You can still fix individual students afterwards, or reopen the class.
      </Confirm>
      <Confirm
        open={deleting}
        title="Delete this class?"
        confirmLabel="Delete for good"
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          await api.deleteSession(id)
          navigate(`/staff/classes/${data.course_id}`)
        }}
      >
        This removes the class and all {data.counts.present + data.counts.late + data.counts.excused} attendance marks in it. It can’t be undone.
      </Confirm>
    </>
  )
}

const segTone: Record<RosterStatus, string> = { present: 'bg-lime', late: 'bg-tang', excused: 'bg-sky', absent: 'bg-tomato', waiting: 'bg-paper' }

function Tally({ session }: { session: LiveSession }) {
  const total = session.roster.length || 1
  const order: RosterStatus[] = ['present', 'late', 'excused', session.status === 'open' ? 'waiting' : 'absent']
  const inRoom = session.counts.present + session.counts.late
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-wider">In the room</p>
          <p className="font-display text-6xl leading-none">
            <motion.span key={inRoom} initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="inline-block">
              {inRoom}
            </motion.span>
            <span className="text-3xl text-ink/50">/{session.roster.length}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {order.map((s) => (
            <span key={s} className="flex items-center gap-1.5 border-[3px] border-ink bg-cream px-2 py-1 font-mono text-xs font-bold uppercase">
              <span className={cx('size-3 border-2 border-ink', segTone[s])} />
              {statusLabel[s]} {session.counts[s]}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-4 flex h-6 overflow-hidden border-[3px] border-ink bg-paper">
        {order.map((s) => (
          <motion.div
            key={s}
            className={cx('h-full border-ink not-last:border-r-[3px]', segTone[s], session.counts[s] === 0 && 'border-r-0!')}
            initial={false}
            animate={{ width: `${(session.counts[s] / total) * 100}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
            title={`${statusLabel[s]}: ${session.counts[s]}`}
          />
        ))}
      </div>
    </Card>
  )
}

function Roster({ session, onPick, wide }: { session: LiveSession; onPick?: (e: LiveSession['roster'][number]) => void; wide?: boolean }) {
  const [filter, setFilter] = useState<'all' | 'missing' | 'in'>('all')
  const shown = session.roster.filter((r) =>
    filter === 'all' ? true : filter === 'in' ? r.status === 'present' || r.status === 'late' : r.status === 'waiting' || r.status === 'absent',
  )
  const order: Record<RosterStatus, number> = { waiting: 0, absent: 0, late: 1, present: 2, excused: 3 }
  shown.sort((a, b) => order[a.status] - order[b.status] || a.student.name.localeCompare(b.student.name))

  return (
    <Card className="flex flex-col self-start">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-[3px] border-ink bg-sun px-4 py-3">
        <h2 className="font-display text-xl uppercase">Roster</h2>
        <Segmented
          id="roster-filter"
          value={filter}
          onChange={setFilter}
          options={[
            ['all', 'All'],
            ['missing', session.status === 'open' ? 'Missing' : 'Absent'],
            ['in', 'In'],
          ]}
        />
      </div>
      {shown.length === 0 ? (
        <div className="p-4">
          <Empty title={filter === 'missing' ? 'Full house!' : 'Nobody yet'} />
        </div>
      ) : (
        <ul className={cx('grid max-h-[720px] gap-2 overflow-y-auto p-3', wide ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' : 'grid-cols-2')}>
          <AnimatePresence initial={false}>
            {shown.map((r) => (
              <motion.li key={r.student.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
                <button
                  disabled={!onPick}
                  onClick={() => onPick?.(r)}
                  className={cx(
                    'flex w-full items-center gap-2 border-[3px] border-ink p-2 text-left transition-transform enabled:cursor-pointer enabled:hover:-translate-y-0.5',
                    r.status === 'waiting' ? 'bg-cream' : segTone[r.status],
                    r.status === 'waiting' && 'border-dashed',
                  )}
                  title={r.time ? `${statusLabel[r.status]} at ${fmtTime(r.time)} · ${r.method ? methodLabel[r.method] : ''}` : statusLabel[r.status]}
                >
                  <Avatar name={r.student.name} seed={r.student.roll_number} size="sm" photoId={r.student.has_photo && r.student.id} className={cx(r.status === 'waiting' && 'grayscale')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold leading-tight">{r.student.name}</span>
                    <span className="block font-mono text-[10px] leading-tight">
                      {r.time ? `${fmtTime(r.time)} · ${r.method ? methodLabel[r.method] : ''}` : r.student.roll_number}
                    </span>
                  </span>
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {onPick && <p className="border-t-[3px] border-ink px-4 py-2 font-mono text-[11px] font-bold uppercase text-ink/60">Tap a student to change their mark</p>}
    </Card>
  )
}

function StatusModal({ sessionId, entry, onClose, onDone }: { sessionId: number; entry: LiveSession['roster'][number] | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const set = async (status: Status) => {
    if (!entry) return
    setBusy(true)
    try {
      await api.setStatus(sessionId, entry.student.id, status)
      toast(`${entry.student.name.split(' ')[0]} → ${statusLabel[status].toLowerCase()}`)
      onDone()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={entry !== null} onClose={onClose} title="Change mark" tone="sky">
      {entry && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar name={entry.student.name} seed={entry.student.roll_number} photoId={entry.student.has_photo && entry.student.id} size="lg" />
            <div>
              <p className="font-display text-xl uppercase leading-tight">{entry.student.name}</p>
              <p className="font-mono text-xs">{entry.student.roll_number}</p>
              <div className="mt-1.5">
                <StatusBadge status={entry.status} />
              </div>
              {entry.similarity !== null && <p className="mt-1 font-mono text-[11px]">face match {entry.similarity}%</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(['present', 'late', 'excused', 'absent'] as const).map((s) => (
              <Button key={s} tone={({ present: 'lime', late: 'tang', excused: 'sky', absent: 'tomato' } as const)[s]} disabled={busy || entry.status === s} onClick={() => set(s)}>
                {statusLabel[s]}
              </Button>
            ))}
          </div>
          <p className="text-sm text-ink/70">Manual changes are recorded in the audit log.</p>
        </div>
      )}
    </Modal>
  )
}

function LiveScan({ sessionId, onFaces }: { sessionId: number; onFaces: (f: FaceResult[]) => void }) {
  const camera = useCamera()
  const toast = useToast()
  const [scanning, setScanning] = useState(false)
  const [faces, setFaces] = useState<FaceResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<Student & { late: boolean } | null>(null)
  const onFacesRef = useRef(onFaces)
  useEffect(() => {
    onFacesRef.current = onFaces
  })

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
          const res = await api.scan(sessionId, frame)
          if (cancelled) return
          setFaces(res.faces)
          setError(null)
          onFacesRef.current(res.faces)
          const fresh = res.faces.find((f) => f.status === 'marked')
          if (fresh?.student) {
            setFlash({ ...fresh.student, late: fresh.late })
            toast(`${fresh.student.name} ${fresh.late ? 'marked late' : 'marked present'}`)
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
  }, [scanning, cameraState, capture, toast, sessionId])

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
              className={cx('brut-lg pointer-events-none absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 px-5 py-3', flash.late ? 'bg-tang' : 'bg-lime')}
            >
              <Avatar name={flash.name} seed={flash.roll_number} photoId={flash.has_photo && flash.id} size="lg" />
              <div>
                <p className="font-display text-3xl uppercase">{flash.late ? 'Late!' : 'Present!'}</p>
                <p className="font-bold">{flash.name}</p>
              </div>
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
        <p className="text-sm text-ink/70">Point it at the door. Each face on the roster is marked once; strangers are saved for review.</p>
      </div>
    </div>
  )
}

function UploadScan({ sessionId, onFaces }: { sessionId: number; onFaces: (f: FaceResult[]) => void }) {
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
      const res = await api.scanUpload(sessionId, file)
      setFaces(res.faces)
      onFaces(res.faces)
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

  const color = (f: FaceResult) =>
    f.status === 'unknown'
      ? { border: 'border-tomato', bg: 'bg-tomato' }
      : f.status === 'marked'
        ? { border: 'border-lime', bg: 'bg-lime' }
        : f.status === 'not_in_class'
          ? { border: 'border-violet', bg: 'bg-violet' }
          : { border: 'border-sky', bg: 'bg-sky' }

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
          className={cx('brut-lg grid aspect-video w-full cursor-pointer place-items-center p-6 text-center', dragging ? 'bg-lime' : 'dots bg-violet')}
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
              className={cx('absolute border-4', color(f).border)}
              style={{
                left: `${f.box.left * 100}%`,
                top: `${f.box.top * 100}%`,
                width: `${(f.box.right - f.box.left) * 100}%`,
                height: `${(f.box.bottom - f.box.top) * 100}%`,
              }}
            >
              <span className={cx('absolute -top-7 left-[-4px] border-2 border-ink px-1.5 text-xs font-bold whitespace-nowrap', color(f).bg)}>
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
              {faces.length} faces · {faces.filter((f) => f.status === 'marked' || f.status === 'already').length} on roster ·{' '}
              {faces.filter((f) => f.status === 'unknown').length} unknown
            </p>
          )}
        </div>
      )}
    </div>
  )
}
