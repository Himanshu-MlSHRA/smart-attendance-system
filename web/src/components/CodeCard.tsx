import { motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import type { LiveSession } from '../lib/api'
import { useNow } from '../lib/hooks'
import { Card, cx } from './ui'

/** The classroom code, with a bar that drains until it rotates. */
export function CodeCard({ session, onExpire, big }: { session: LiveSession; onExpire: () => void; big?: boolean }) {
  const now = useNow(250)
  const left = Math.max(0, (session.code_expires_in ?? 0) - (now - session.received_at) / 1000)
  const expired = left <= 0
  const onExpireRef = useRef(onExpire)
  useEffect(() => {
    onExpireRef.current = onExpire
  })
  useEffect(() => {
    if (expired) onExpireRef.current()
  }, [expired])

  if (!session.code) return null
  return (
    <Card tone="sun" className={cx('dots relative overflow-hidden', big ? 'p-8' : 'p-4')}>
      <div className={cx('brut bg-cream', big ? 'p-8' : 'flex flex-wrap items-center justify-between gap-4 p-4')}>
        <div>
          <p className={cx('font-mono font-bold uppercase tracking-wider', big ? 'text-xl' : 'text-xs')}>Self check-in code</p>
          {!big && <p className="text-sm">Students open Present! → Check in, then type this.</p>}
        </div>
        <div className={cx('flex gap-2', big && 'mt-6 justify-center gap-4')}>
          {session.code.split('').map((d, i) => (
            <motion.span
              key={`${session.code}-${i}`}
              initial={{ rotateX: 90, opacity: 0 }}
              animate={{ rotateX: 0, opacity: 1 }}
              transition={{ delay: i * 0.06, type: 'spring', stiffness: 300, damping: 20 }}
              className={cx('grid place-items-center border-[3px] border-ink bg-ink font-display text-sun', big ? 'h-48 w-36 text-[9rem]' : 'h-14 w-11 text-4xl')}
            >
              {d}
            </motion.span>
          ))}
        </div>
      </div>
      <div className={cx('mt-3 h-3 border-[3px] border-ink bg-cream', big && 'mt-6 h-5')}>
        <div className="h-full bg-ink transition-[width] duration-200 ease-linear" style={{ width: `${(left / 30) * 100}%` }} />
      </div>
      <p className={cx('mt-1 text-right font-mono font-bold', big ? 'text-lg' : 'text-xs')}>changes in {Math.ceil(left)}s</p>
    </Card>
  )
}
