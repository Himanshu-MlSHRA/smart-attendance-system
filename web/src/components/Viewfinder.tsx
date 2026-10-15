import { AnimatePresence, motion } from 'motion/react'
import { Camera, CameraOff } from 'lucide-react'
import type { ReactNode, RefObject } from 'react'
import type { FaceResult } from '../lib/api'
import type { CameraState } from '../lib/hooks'
import { Button, cx } from './ui'

const first = (f: FaceResult) => f.student?.name.split(' ')[0] ?? ''
const score = (f: FaceResult) => (f.similarity !== null ? ` · ${f.similarity}%` : '')

const statusStyle: Record<FaceResult['status'], { color: string; label: (f: FaceResult) => string }> = {
  marked: { color: 'border-lime bg-lime', label: (f) => `${f.late ? 'Late' : 'Marked'} · ${first(f)}${score(f)}` },
  already: { color: 'border-sky bg-sky', label: (f) => `Already in · ${first(f)}` },
  mismatch: { color: 'border-tang bg-tang', label: () => 'Not you!' },
  not_in_class: { color: 'border-violet bg-violet', label: (f) => `${first(f)} · not in this class` },
  unknown: { color: 'border-tomato bg-tomato', label: () => 'Unknown face' },
}

/**
 * Mirrored webcam view with brutalist corner brackets, a sweeping scan line
 * and labelled boxes for the last set of recognised faces.
 */
export function Viewfinder({
  videoRef,
  state,
  onStart,
  scanning,
  faces = [],
  className,
  overlay,
}: {
  videoRef: RefObject<HTMLVideoElement | null>
  state: CameraState
  onStart: () => void
  scanning?: boolean
  faces?: FaceResult[]
  className?: string
  /** Extra layer drawn over the live picture (prompts, countdowns). */
  overlay?: ReactNode
}) {
  const live = state === 'live'
  return (
    <div className={cx('brut-lg relative aspect-video w-full overflow-hidden bg-ink', className)}>
      <video ref={videoRef} playsInline muted className={cx('size-full -scale-x-100 object-cover', !live && 'invisible')} />

      {!live && (
        <div className="dots absolute inset-0 grid place-items-center bg-violet p-6 text-center">
          <div className="brut max-w-xs bg-cream p-5">
            {state === 'denied' || state === 'unsupported' ? (
              <>
                <CameraOff className="mx-auto mb-2" size={36} strokeWidth={2.5} />
                <p className="font-display text-lg uppercase">No camera access</p>
                <p className="mt-1 text-sm">
                  {state === 'unsupported'
                    ? 'This browser can’t open a camera here. Use localhost or HTTPS.'
                    : 'Allow camera permission in your browser, then try again.'}
                </p>
                <Button className="mt-4" size="sm" onClick={onStart}>
                  Try again
                </Button>
              </>
            ) : (
              <>
                <Camera className="mx-auto mb-2" size={36} strokeWidth={2.5} />
                <p className="font-display text-lg uppercase">Camera is off</p>
                <Button className="mt-4" tone="pink" onClick={onStart} disabled={state === 'starting'}>
                  {state === 'starting' ? 'Starting…' : 'Turn it on'}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {live && (
        <>
          {/* corner brackets */}
          {['top-3 left-3 border-t-[6px] border-l-[6px]', 'top-3 right-3 border-t-[6px] border-r-[6px]', 'bottom-3 left-3 border-b-[6px] border-l-[6px]', 'right-3 bottom-3 border-r-[6px] border-b-[6px]'].map((pos) => (
            <motion.span
              key={pos}
              className={cx('pointer-events-none absolute size-10 border-sun', pos)}
              animate={scanning ? { scale: [1, 0.88, 1] } : { scale: 1 }}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
          ))}

          {scanning && (
            <motion.div
              className="pointer-events-none absolute inset-x-0 h-1 bg-lime shadow-[0_0_24px_6px_rgba(166,240,74,0.7)]"
              initial={{ top: '0%' }}
              animate={{ top: ['0%', '100%', '0%'] }}
              transition={{ duration: 2.6, ease: 'easeInOut', repeat: Infinity }}
            />
          )}

          <AnimatePresence>
            {faces.map((f, i) => {
              const s = statusStyle[f.status]
              // The video is mirrored, so flip the box horizontally.
              const left = (1 - f.box.right) * 100
              const width = (f.box.right - f.box.left) * 100
              return (
                <motion.div
                  key={`${i}-${f.student?.id ?? 'x'}-${f.status}`}
                  className={cx('pointer-events-none absolute border-4 bg-transparent!', s.color)}
                  style={{
                    left: `${left}%`,
                    top: `${f.box.top * 100}%`,
                    width: `${width}%`,
                    height: `${(f.box.bottom - f.box.top) * 100}%`,
                  }}
                  initial={{ scale: 1.3, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                >
                  <span className={cx('absolute -top-8 left-[-4px] border-[3px] border-ink px-2 py-0.5 text-xs font-bold whitespace-nowrap text-ink', s.color)}>
                    {s.label(f)}
                  </span>
                </motion.div>
              )
            })}
          </AnimatePresence>

          <div className="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-2 border-[3px] border-ink bg-cream px-2 py-0.5 font-mono text-xs font-bold uppercase">
            <motion.span
              className={cx('size-2.5 rounded-full', scanning ? 'bg-tomato' : 'bg-ink/30')}
              animate={scanning ? { opacity: [1, 0.2, 1] } : { opacity: 1 }}
              transition={{ duration: 1, repeat: Infinity }}
            />
            {scanning ? 'Scanning' : 'Paused'}
          </div>
          {overlay}
        </>
      )}
    </div>
  )
}
