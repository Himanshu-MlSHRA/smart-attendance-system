import { motion } from 'motion/react'
import { LogOut } from 'lucide-react'
import { Logo } from '../components/Shell'
import { Button } from '../components/ui'
import { useAuth } from '../lib/auth'
import { PasswordForm } from './Account'

/** First sign-in: the starting password (roll number) is public, so it has to go. */
export default function Welcome() {
  const { user, logout } = useAuth()
  return (
    <div className="dots grid min-h-dvh place-items-center bg-sun p-4">
      <motion.div
        initial={{ y: 30, rotate: -2, opacity: 0 }}
        animate={{ y: 0, rotate: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 20 }}
        className="brut-lg w-full max-w-md bg-cream"
      >
        <div className="flex items-center justify-between border-b-[3px] border-ink px-5 py-4">
          <Logo className="text-xl" />
          <Button size="sm" tone="cream" onClick={logout} icon={<LogOut size={14} strokeWidth={3} />}>
            Out
          </Button>
        </div>
        <div className="space-y-4 p-6">
          <h1 className="font-display text-3xl uppercase leading-none">Welcome, {(user?.name || user?.username || '').split(' ')[0]}!</h1>
          <p className="text-ink/80">
            You signed in with a starting password that other people could guess. Pick your own before you continue.
          </p>
          <PasswordForm submitLabel="Set password & continue" />
        </div>
      </motion.div>
    </div>
  )
}
