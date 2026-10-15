import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Eye, KeyRound, RotateCcw, ScanFace } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button, ErrorNote, Modal } from '../../components/ui'
import { Viewfinder } from '../../components/Viewfinder'
import { api, type FaceResult, type OpenSession } from '../../lib/api'
import { useCamera } from '../../lib/hooks'
import { chime } from '../../lib/sound'

const BURST_FRAMES = 12
const BURST_GAP_MS = 140

type Step = 'code' | 'face' | 'done'

/**
 * Self check-in, three steps:
 * 1. type the 4-digit code shown in the classroom (proves you're in the room),
 * 2. look at the camera and blink (proves you're a live person, not a photo),
 * 3. the server matches the face against yours and marks you.
 */
export function CheckInModal({
  session,
  liveness,
  onClose,
  onDone,
}: {
  session: OpenSession | null
  liveness: boolean
  onClose: () => void
  onDone: (late: boolean) => void
}) {
  return (
    <Modal open={session !== null} onClose={onClose} title={session ? `Check in · ${session.course_code}` : 'Check in'} tone="lime" wide>
      {session && <CheckInBody session={session} liveness={liveness} onDone={onDone} />}
    </Modal>
  )
}

function CheckInBody({ session, liveness, onDone }: { session: OpenSession; liveness: boolean; onDone: (late: boolean) => void }) {
  const [step, setStep] = useState<Step>('code')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ late: boolean; similarity: number | null; already: boolean } | null>(null)

  return (
    <div className="space-y-4">
      <ol className="flex gap-2 font-mono text-[11px] font-bold uppercase">
        {[
          ['code', '1 · Room code'],
          ['face', liveness ? '2 · Face + blink' : '2 · Face'],
          ['done', '3 · Done'],
        ].map(([s, label]) => (
          <li key={s} className={`flex-1 border-[3px] border-ink px-2 py-1 text-center ${step === s ? 'bg-ink text-cream' : 'bg-cream'}`}>
            {label}
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait">
        {step === 'code' && (
          <motion.div key="code" initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -30, opacity: 0 }}>
            <CodeStep
              code={code}
              setCode={setCode}
              error={error}
              onNext={() => {
                setError(null)
                setStep('face')
              }}
            />
          </motion.div>
        )}
        {step === 'face' && (
          <motion.div key="face" initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -30, opacity: 0 }}>
            <FaceStep
              session={session}
              code={code}
              liveness={liveness}
              onBadCode={(msg) => {
                setError(msg)
                setCode('')
                setStep('code')
              }}
              onDone={(r) => {
                setResult(r)
                setStep('done')
                chime('ok')
                setTimeout(() => onDone(r.late), 1600)
              }}
            />
          </motion.div>
        )}
        {step === 'done' && result && (
          <motion.div key="done" className="grid place-items-center py-8 text-center">
            <motion.div
              initial={{ scale: 2.4, rotate: -30, opacity: 0 }}
              animate={{ scale: 1, rotate: -8, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 14 }}
              className={`border-[6px] border-ink px-8 py-3 font-display text-5xl tracking-wider uppercase shadow-brut-lg ${result.late ? 'bg-tang' : 'bg-lime'}`}
            >
              {result.already ? 'Already in' : result.late ? 'Late' : 'Present'}
            </motion.div>
            <p className="mt-6 font-bold">
              {result.already ? 'You were already marked for this class.' : result.late ? 'Marked late — you made it though!' : 'You’re in. See you in class!'}
            </p>
            {result.similarity !== null && <p className="font-mono text-xs">face match {result.similarity}%</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function CodeStep({ code, setCode, error, onNext }: { code: string; setCode: (c: string) => void; error: string | null; onNext: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (code.length === 4) onNext()
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="flex items-center gap-2 font-bold">
        <KeyRound size={18} strokeWidth={2.5} /> Type the code on the classroom screen
      </p>
      <label className="relative block cursor-text" onClick={() => inputRef.current?.focus()}>
        <input
          ref={inputRef}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label="Classroom code"
          className="absolute inset-0 opacity-0"
        />
        <div className="flex justify-center gap-3">
          {[0, 1, 2, 3].map((i) => (
            <motion.span
              key={i}
              animate={code.length === i ? { y: [0, -4, 0] } : { y: 0 }}
              transition={{ duration: 0.8, repeat: code.length === i ? Infinity : 0 }}
              className={`grid h-20 w-16 place-items-center border-[3px] border-ink font-display text-5xl ${code[i] ? 'bg-sun' : 'bg-cream'} ${code.length === i ? 'shadow-brut' : ''}`}
            >
              {code[i] ?? ''}
            </motion.span>
          ))}
        </div>
      </label>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" size="lg" tone="lime" className="w-full" disabled={code.length !== 4} icon={<ArrowRight size={20} strokeWidth={3} />}>
        Next
      </Button>
      <p className="text-center text-sm text-ink/70">The code changes every 30 seconds, so it only works if you can see the screen.</p>
    </form>
  )
}

function FaceStep({
  session,
  code,
  liveness,
  onBadCode,
  onDone,
}: {
  session: OpenSession
  code: string
  liveness: boolean
  onBadCode: (msg: string) => void
  onDone: (r: { late: boolean; similarity: number | null; already: boolean }) => void
}) {
  const camera = useCamera()
  const [phase, setPhase] = useState<'ready' | 'countdown' | 'blink' | 'checking'>('ready')
  const [count, setCount] = useState(3)
  const [error, setError] = useState<string | null>(null)
  const [box, setBox] = useState<FaceResult | null>(null)
  const cancelled = useRef(false)

  const { start } = camera
  useEffect(() => {
    cancelled.current = false
    start()
    return () => void (cancelled.current = true)
  }, [start])

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  const go = async () => {
    setError(null)
    setBox(null)
    const frames: string[] = []
    if (liveness) {
      setPhase('countdown')
      for (let i = 3; i > 0; i--) {
        setCount(i)
        await sleep(600)
        if (cancelled.current) return
      }
      setPhase('blink')
      for (let i = 0; i < BURST_FRAMES; i++) {
        const f = camera.capture(480, 0.8)
        if (f) frames.push(f)
        await sleep(BURST_GAP_MS)
      }
    } else {
      const f = camera.capture(640, 0.85)
      if (f) frames.push(f)
    }
    if (cancelled.current) return
    setPhase('checking')
    try {
      const res = await api.checkin(session.id, code, frames)
      if (res.box) setBox({ box: res.box, status: 'marked', student: null, similarity: res.similarity, late: res.late })
      onDone({ late: res.late, similarity: res.similarity, already: res.status === 'already' })
    } catch (e) {
      const msg = (e as Error).message
      chime('error')
      if (/code/i.test(msg)) onBadCode(msg)
      else {
        setError(msg)
        setPhase('ready')
      }
    }
  }

  const overlay = (
    <AnimatePresence mode="wait">
      {phase === 'countdown' && (
        <motion.div key={count} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} className="absolute inset-0 grid place-items-center">
          <span className="brut grid size-28 place-items-center bg-sun font-display text-7xl">{count}</span>
        </motion.div>
      )}
      {phase === 'blink' && (
        <motion.div key="blink" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className="brut absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 bg-lime px-5 py-2 font-display text-3xl uppercase">
          <motion.span animate={{ scaleY: [1, 0.1, 1] }} transition={{ duration: 0.5, repeat: Infinity }}>
            <Eye size={30} strokeWidth={3} />
          </motion.span>
          Blink now!
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <div className="space-y-4">
      <Viewfinder
        videoRef={camera.videoRef}
        state={camera.state}
        onStart={camera.start}
        scanning={phase === 'blink' || phase === 'checking'}
        faces={box ? [box] : []}
        overlay={overlay}
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex gap-3">
        <Button size="lg" tone="lime" className="flex-1" disabled={camera.state !== 'live' || phase !== 'ready'} onClick={go} icon={error ? <RotateCcw size={20} strokeWidth={3} /> : <ScanFace size={22} strokeWidth={2.5} />}>
          {phase === 'checking' ? 'Checking…' : phase !== 'ready' ? 'Hold still…' : error ? 'Try again' : liveness ? 'Start — then blink' : 'Scan my face'}
        </Button>
      </div>
      <p className="text-center text-sm text-ink/70">
        {liveness ? 'Face the camera in good light. When it says “Blink now”, blink once or twice — that’s how we know you’re not a photo.' : 'Face the camera in good light.'}
      </p>
    </div>
  )
}
