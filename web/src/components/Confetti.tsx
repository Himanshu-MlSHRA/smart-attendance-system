import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'

const COLORS = ['#ffd43b', '#ff7ab6', '#6ec6ff', '#a6f04a', '#ff8a3d', '#b69cff']

/** A burst of brutalist confetti every time `fire` changes (skip with 0). */
export function Confetti({ fire }: { fire: number }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (!fire) return
    setShown(fire)
    const t = setTimeout(() => setShown(0), 1800)
    return () => clearTimeout(t)
  }, [fire])

  const pieces = useMemo(
    () =>
      Array.from({ length: 42 }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 900,
        y: -(200 + Math.random() * 380),
        r: (Math.random() - 0.5) * 720,
        size: 8 + Math.random() * 10,
        color: COLORS[i % COLORS.length],
        delay: Math.random() * 0.12,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown],
  )

  return (
    <AnimatePresence>
      {shown > 0 && (
        <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden>
          {pieces.map((p) => (
            <motion.span
              key={`${shown}-${p.id}`}
              className="absolute bottom-1/3 left-1/2 border-2 border-ink"
              style={{ width: p.size, height: p.size, background: p.color }}
              initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
              animate={{ x: p.x, y: [0, p.y, p.y + 520], rotate: p.r, opacity: [1, 1, 0] }}
              transition={{ duration: 1.6, delay: p.delay, ease: 'easeOut', times: [0, 0.45, 1] }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  )
}
