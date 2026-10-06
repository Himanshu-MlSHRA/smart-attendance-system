import { AnimatePresence, motion } from 'motion/react'
import { Check, ClipboardList, Home, LayoutDashboard, LogOut, ScanFace, UserRound, Users } from 'lucide-react'
import { NavLink, useLocation, useOutlet } from 'react-router-dom'
import type { Role } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Avatar, cx } from './ui'

const nav: Record<Role, { to: string; label: string; icon: typeof Home; tone: string }[]> = {
  admin: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, tone: 'bg-sun' },
    { to: '/admin/scan', label: 'Scanner', icon: ScanFace, tone: 'bg-lime' },
    { to: '/admin/students', label: 'Students', icon: Users, tone: 'bg-pink' },
    { to: '/admin/records', label: 'Records', icon: ClipboardList, tone: 'bg-sky' },
    { to: '/admin/account', label: 'Account', icon: UserRound, tone: 'bg-violet' },
  ],
  student: [
    { to: '/me', label: 'My attendance', icon: Home, tone: 'bg-sun' },
    { to: '/me/account', label: 'Account', icon: UserRound, tone: 'bg-violet' },
  ],
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2 font-display text-2xl uppercase', className)}>
      <motion.span
        className="grid size-9 place-items-center border-[3px] border-ink bg-sun shadow-brut-sm"
        whileHover={{ rotate: 12, scale: 1.08 }}
      >
        <Check size={22} strokeWidth={4} />
      </motion.span>
      Present!
    </span>
  )
}

export default function Shell({ role }: { role: Role }) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const outlet = useOutlet()
  const items = nav[role]
  const displayName = user?.student?.name ?? user?.username ?? ''

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r-[3px] border-ink bg-cream lg:flex">
        <div className="border-b-[3px] border-ink px-5 py-5">
          <Logo />
        </div>
        <nav className="flex flex-1 flex-col gap-2 p-4">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/admin' || item.to === '/me'}
              className="relative block"
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="nav-active"
                      className={cx('absolute inset-0 border-[3px] border-ink shadow-brut', item.tone)}
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <span
                    className={cx(
                      'relative flex items-center gap-3 border-[3px] px-3 py-2.5 font-bold transition-colors',
                      isActive ? 'border-transparent' : 'border-transparent hover:border-ink hover:bg-paper',
                    )}
                  >
                    <item.icon size={20} strokeWidth={2.5} />
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t-[3px] border-ink p-4">
          <div className="flex items-center gap-3">
            <Avatar name={displayName} seed={user?.username} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold leading-tight">{displayName}</p>
              <p className="font-mono text-[11px] uppercase text-ink/60">{role}</p>
            </div>
            <motion.button
              whileHover={{ rotate: -10 }}
              whileTap={{ scale: 0.85 }}
              onClick={logout}
              className="grid size-9 cursor-pointer place-items-center border-[3px] border-ink bg-tomato shadow-brut-sm"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={16} strokeWidth={3} />
            </motion.button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b-[3px] border-ink bg-cream px-4 py-3 lg:hidden">
        <Logo className="text-xl" />
        <button
          onClick={logout}
          className="flex cursor-pointer items-center gap-1.5 border-[3px] border-ink bg-tomato px-2.5 py-1 text-sm font-bold uppercase shadow-brut-sm"
        >
          <LogOut size={14} strokeWidth={3} /> Out
        </button>
      </header>

      <main className="min-w-0 px-4 pt-6 pb-28 sm:px-8 lg:px-10 lg:pt-10 lg:pb-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="mx-auto max-w-6xl"
          >
            {outlet}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t-[3px] border-ink bg-cream lg:hidden">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/admin' || item.to === '/me'}
            className="relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-bold uppercase"
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span layoutId="tab-active" className={cx('absolute inset-x-1 inset-y-1 border-[3px] border-ink', item.tone)} />
                )}
                <item.icon className="relative" size={20} strokeWidth={2.5} />
                <span className="relative">{item.label.split(' ')[0]}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
