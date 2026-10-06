import { motion } from 'motion/react'
import { ArrowRight, GraduationCap, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Logo } from '../components/Shell'
import { Button, cx, ErrorNote, Input, Marquee } from '../components/ui'
import type { Role } from '../lib/api'
import { useAuth } from '../lib/auth'

const stickers = [
  { text: 'NO PROXIES', className: 'bg-pink top-[14%] right-[8%] rotate-6' },
  { text: '100% FACE', className: 'bg-sky top-[42%] right-[12%] -rotate-6' },
  { text: '0 ROLL CALLS', className: 'bg-lime bottom-[16%] right-[8%] rotate-3' },
]

export default function Login() {
  const { login } = useAuth()
  const [role, setRole] = useState<Role>('student')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const user = await login(username.trim(), password)
      if (user.role !== role) {
        setRole(user.role)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="grid flex-1 lg:grid-cols-[1.15fr_1fr]">
        {/* Hero */}
        <section className="dots relative overflow-hidden border-b-[3px] border-ink bg-sun px-6 py-10 sm:px-12 lg:border-r-[3px] lg:border-b-0 lg:py-14">
          <Logo />
          <motion.h1
            className="mt-10 max-w-xl font-display text-5xl leading-[0.92] uppercase sm:text-7xl lg:mt-20 lg:text-8xl"
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.09 } } }}
          >
            {['Roll call,', 'but it', 'looks', 'at you.'].map((line, i) => (
              <motion.span
                key={line}
                className={cx('block', i === 2 && 'w-fit bg-ink px-3 text-sun')}
                variants={{ hidden: { y: 60, opacity: 0, rotate: -4 }, show: { y: 0, opacity: 1, rotate: 0 } }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              >
                {line}
              </motion.span>
            ))}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-8 max-w-md border-l-[6px] border-ink pl-4 text-lg font-medium"
          >
            Walk past the camera, get marked present. Admins run the scanner; students track their own streak.
          </motion.p>

          {stickers.map((s, i) => (
            <motion.span
              key={s.text}
              drag
              dragMomentum={false}
              whileDrag={{ scale: 1.1, cursor: 'grabbing' }}
              initial={{ scale: 0 }}
              animate={{ scale: 1, y: [0, -8, 0] }}
              transition={{
                scale: { delay: 0.6 + i * 0.12, type: 'spring' },
                y: { duration: 3 + i, repeat: Infinity, ease: 'easeInOut' },
              }}
              className={cx(
                'brut absolute hidden cursor-grab px-3 py-1.5 font-display text-sm select-none xl:block',
                s.className,
              )}
            >
              {s.text}
            </motion.span>
          ))}
        </section>

        {/* Form */}
        <section className="grid place-items-center px-6 py-12 sm:px-12">
          <motion.div
            initial={{ opacity: 0, y: 30, rotate: 2 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.15 }}
            className="brut-lg w-full max-w-md bg-cream"
          >
            <div className="grid grid-cols-2 border-b-[3px] border-ink">
              {(
                [
                  ['student', 'Student', GraduationCap, 'bg-pink'],
                  ['admin', 'Admin', ShieldCheck, 'bg-sky'],
                ] as const
              ).map(([value, label, Icon, tone]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setRole(value)
                    setError(null)
                  }}
                  className={cx(
                    'relative flex cursor-pointer items-center justify-center gap-2 py-3.5 font-bold uppercase',
                    value === 'admin' && 'border-l-[3px] border-ink',
                  )}
                  aria-pressed={role === value}
                >
                  {role === value && (
                    <motion.span layoutId="role-tab" className={cx('absolute inset-0', tone)} transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
                  )}
                  <Icon className="relative" size={18} strokeWidth={2.5} />
                  <span className="relative">{label}</span>
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="space-y-5 p-6 sm:p-8">
              <div>
                <h2 className="font-display text-3xl uppercase">{role === 'admin' ? 'Admin desk' : 'Hey, student'}</h2>
                <p className="mt-1 text-ink/70">
                  {role === 'admin'
                    ? 'Run scans, manage students and fix records.'
                    : 'Sign in with your roll number. First time? Your password is your roll number too.'}
                </p>
              </div>
              <Input
                id="username"
                label={role === 'admin' ? 'Username' : 'Roll number'}
                autoComplete="username"
                inputMode={role === 'student' ? 'numeric' : undefined}
                placeholder={role === 'admin' ? 'admin' : 'e.g. 231417'}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
              <Input
                id="password"
                label="Password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {error && <ErrorNote>{error}</ErrorNote>}
              <Button
                type="submit"
                tone={role === 'admin' ? 'sky' : 'pink'}
                size="lg"
                className="w-full"
                disabled={busy}
                icon={<ArrowRight size={20} strokeWidth={3} />}
              >
                {busy ? 'Checking…' : 'Sign in'}
              </Button>
            </form>
          </motion.div>
        </section>
      </div>
      <Marquee items={['Face recognition', 'Live scanner', 'Group photo upload', 'Streaks', 'Defaulter alerts', 'CSV export']} />
    </div>
  )
}
