import { AnimatePresence, motion } from 'motion/react'
import { Maximize, X } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { CodeCard } from '../../components/CodeCard'
import { Logo } from '../../components/Shell'
import { Avatar, ErrorNote, Loader } from '../../components/ui'
import { api } from '../../lib/api'
import { fmtTime } from '../../lib/format'
import { useLoad } from '../../lib/hooks'

/** Full-screen view for the classroom projector: the rotating code and who's arrived. */
export default function Projector() {
  const id = Number(useParams().id)
  const { data, error, reload } = useLoad(() => api.session(id), [id], 2000)

  if (error && !data) {
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <ErrorNote>{error}</ErrorNote>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Loader label="Opening class" />
      </div>
    )
  }

  const arrived = data.roster
    .filter((r) => r.status === 'present' || r.status === 'late')
    .sort((a, b) => (b.time ?? '').localeCompare(a.time ?? ''))
  const inRoom = data.counts.present + data.counts.late

  return (
    <div className="dots flex min-h-dvh flex-col bg-sun">
      <header className="flex items-center justify-between border-b-[3px] border-ink bg-cream px-6 py-4">
        <Logo />
        <p className="hidden font-display text-2xl uppercase md:block">
          {data.course_code} · {data.topic || data.course_name}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
            className="grid size-10 cursor-pointer place-items-center border-[3px] border-ink bg-cream shadow-brut-sm"
            aria-label="Full screen"
          >
            <Maximize size={18} strokeWidth={3} />
          </button>
          <button onClick={() => window.close()} className="grid size-10 cursor-pointer place-items-center border-[3px] border-ink bg-tomato shadow-brut-sm" aria-label="Close">
            <X size={18} strokeWidth={3} />
          </button>
        </div>
      </header>

      {data.status !== 'open' ? (
        <div className="grid flex-1 place-items-center p-6">
          <div className="brut-lg bg-cream p-10 text-center">
            <p className="font-display text-6xl uppercase">Class over</p>
            <p className="mt-3 text-2xl font-bold">
              {inRoom} of {data.roster.length} made it.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-1 gap-6 p-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="flex flex-col justify-center">
            <p className="mb-4 text-center font-display text-3xl uppercase sm:text-4xl">
              Open <span className="bg-ink px-2 text-sun">Present!</span> → Check in → type:
            </p>
            <CodeCard session={data} onExpire={reload} big />
          </div>
          <div className="brut-lg flex flex-col bg-cream">
            <div className="border-b-[3px] border-ink bg-lime p-5">
              <p className="font-mono text-sm font-bold uppercase">In the room</p>
              <p className="font-display text-8xl leading-none">
                <motion.span key={inRoom} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className="inline-block">
                  {inRoom}
                </motion.span>
                <span className="text-4xl text-ink/50">/{data.roster.length}</span>
              </p>
            </div>
            <ul className="flex-1 space-y-2 overflow-hidden p-4">
              <AnimatePresence initial={false}>
                {arrived.slice(0, 7).map((r) => (
                  <motion.li
                    key={r.student.id}
                    layout
                    initial={{ x: 60, opacity: 0, rotate: 3 }}
                    animate={{ x: 0, opacity: 1, rotate: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-3 border-[3px] border-ink bg-paper p-2"
                  >
                    <Avatar name={r.student.name} seed={r.student.roll_number} photoId={r.student.has_photo && r.student.id} />
                    <span className="flex-1 text-xl font-bold">{r.student.name}</span>
                    <span className="font-mono text-sm font-bold">
                      {fmtTime(r.time)}
                      {r.status === 'late' ? ' · late' : ''}
                    </span>
                  </motion.li>
                ))}
              </AnimatePresence>
              {arrived.length === 0 && <li className="p-6 text-center text-xl font-bold text-ink/60">Waiting for the first face…</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
