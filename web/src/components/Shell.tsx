import { AnimatePresence, motion } from 'motion/react'
import {
  BookOpen,
  Check,
  ClipboardList,
  GraduationCap,
  Home,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  ScanSearch,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Suspense, useEffect, useState } from 'react'
import { NavLink, useLocation, useOutlet } from 'react-router-dom'
import { api, type Role } from '../lib/api'
import { useAuth } from '../lib/auth'
import { CommandPalette } from './CommandPalette'
import { Avatar, PageSkeleton, cx } from './ui'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  tone: string
  badge?: 'requests'
}

const nav: Record<Role, { section: string; items: NavItem[] }[]> = {
  admin: [
    {
      section: 'Run',
      items: [
        { to: '/staff', label: 'Dashboard', icon: LayoutDashboard, tone: 'bg-sun' },
        { to: '/staff/classes', label: 'Classes', icon: BookOpen, tone: 'bg-lime' },
        { to: '/staff/records', label: 'Records', icon: ClipboardList, tone: 'bg-sky' },
        { to: '/staff/requests', label: 'Requests', icon: Inbox, tone: 'bg-tang', badge: 'requests' },
      ],
    },
    {
      section: 'People',
      items: [
        { to: '/staff/students', label: 'Students', icon: Users, tone: 'bg-pink' },
        { to: '/staff/teachers', label: 'Teachers', icon: GraduationCap, tone: 'bg-violet' },
      ],
    },
    {
      section: 'System',
      items: [
        { to: '/staff/unknown', label: 'Unknown faces', icon: ScanSearch, tone: 'bg-tomato' },
        { to: '/staff/audit', label: 'Audit log', icon: ShieldCheck, tone: 'bg-sky' },
        { to: '/staff/account', label: 'Account', icon: UserRound, tone: 'bg-violet' },
      ],
    },
  ],
  teacher: [
    {
      section: 'Run',
      items: [
        { to: '/staff', label: 'Dashboard', icon: LayoutDashboard, tone: 'bg-sun' },
        { to: '/staff/classes', label: 'Classes', icon: BookOpen, tone: 'bg-lime' },
        { to: '/staff/records', label: 'Records', icon: ClipboardList, tone: 'bg-sky' },
        { to: '/staff/requests', label: 'Requests', icon: Inbox, tone: 'bg-tang', badge: 'requests' },
      ],
    },
    {
      section: 'People',
      items: [
        { to: '/staff/students', label: 'Students', icon: Users, tone: 'bg-pink' },
        { to: '/staff/account', label: 'Account', icon: UserRound, tone: 'bg-violet' },
      ],
    },
  ],
  student: [
    {
      section: 'Me',
      items: [
        { to: '/me', label: 'My attendance', icon: Home, tone: 'bg-sun' },
        { to: '/me/requests', label: 'Requests', icon: Inbox, tone: 'bg-tang' },
        { to: '/me/account', label: 'Account', icon: UserRound, tone: 'bg-violet' },
      ],
    },
  ],
}

const ROOTS = ['/staff', '/me']

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

/** Pending requests waiting on staff, refreshed every minute. */
function usePendingCount(enabled: boolean) {
  const [count, setCount] = useState(0)
  const location = useLocation()
  useEffect(() => {
    if (!enabled) return
    const load = () =>
      api
        .requests('pending')
        .then((r) => setCount(r.length))
        .catch(() => {})
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [enabled, location.pathname])
  return count
}

function CountBadge({ n }: { n: number }) {
  if (!n) return null
  return (
    <motion.span
      key={n}
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className="relative ml-auto grid min-w-6 place-items-center border-2 border-ink bg-tomato px-1 font-mono text-xs font-bold"
    >
      {n}
    </motion.span>
  )
}

export default function Shell({ role }: { role: Role }) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const outlet = useOutlet()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const sections = nav[role]
  const items = sections.flatMap((s) => s.items)
  const staff = role !== 'student'
  const pending = usePendingCount(staff)
  const displayName = user?.name || user?.username || ''
  const photoId = user?.student?.has_photo ? user.student.id : undefined

  const primary = items.slice(0, 4)
  const rest = items.slice(4)

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr] print:block">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r-[3px] border-ink bg-cream lg:flex print:hidden!">
        <div className="border-b-[3px] border-ink px-5 py-5">
          <Logo />
        </div>
        {staff && (
          <button
            onClick={() => setPaletteOpen(true)}
            className="mx-4 mt-4 flex cursor-pointer items-center gap-2 border-[3px] border-ink bg-paper px-3 py-2 text-sm font-bold text-ink/70 shadow-brut-sm transition-transform hover:-translate-y-0.5"
          >
            <Search size={16} strokeWidth={3} /> Search
            <kbd className="ml-auto border-2 border-ink bg-cream px-1 font-mono text-[10px] text-ink">Ctrl K</kbd>
          </button>
        )}
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-4">
          {sections.map((section) => (
            <div key={section.section} className="mb-2">
              {sections.length > 1 && <p className="mb-1 px-3 font-mono text-[10px] font-bold tracking-[0.2em] text-ink/50 uppercase">{section.section}</p>}
              {section.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={ROOTS.includes(item.to)} className="relative mb-1 block">
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
                          'relative flex items-center gap-3 border-[3px] border-transparent px-3 py-2 font-bold transition-colors',
                          !isActive && 'hover:border-ink hover:bg-paper',
                        )}
                      >
                        <item.icon size={19} strokeWidth={2.5} />
                        {item.label}
                        {item.badge === 'requests' && <CountBadge n={pending} />}
                      </span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t-[3px] border-ink p-4">
          <div className="flex items-center gap-3">
            <Avatar name={displayName} seed={user?.username} size="sm" photoId={photoId} />
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
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b-[3px] border-ink bg-cream px-4 py-3 lg:hidden print:hidden">
        <Logo className="text-xl" />
        <div className="flex gap-2">
          {staff && (
            <button onClick={() => setPaletteOpen(true)} className="grid size-9 cursor-pointer place-items-center border-[3px] border-ink bg-paper shadow-brut-sm" aria-label="Search">
              <Search size={16} strokeWidth={3} />
            </button>
          )}
          <button
            onClick={logout}
            className="flex cursor-pointer items-center gap-1.5 border-[3px] border-ink bg-tomato px-2.5 py-1 text-sm font-bold uppercase shadow-brut-sm"
          >
            <LogOut size={14} strokeWidth={3} /> Out
          </button>
        </div>
      </header>

      <main className="min-w-0 px-4 pt-6 pb-28 sm:px-8 lg:px-10 lg:pt-10 lg:pb-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="mx-auto max-w-6xl"
          >
            <Suspense fallback={<PageSkeleton />}>{outlet}</Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile bottom tabs, with the rest under "More" */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t-[3px] border-ink bg-cream lg:hidden print:hidden">
        {primary.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={ROOTS.includes(item.to)}
            className="relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-bold uppercase"
          >
            {({ isActive }) => (
              <>
                {isActive && <motion.span layoutId="tab-active" className={cx('absolute inset-1 border-[3px] border-ink', item.tone)} />}
                <item.icon className="relative" size={20} strokeWidth={2.5} />
                <span className="relative">{item.label.split(' ').at(-1)}</span>
                {item.badge === 'requests' && pending > 0 && <span className="absolute top-1 right-[22%] size-2.5 border-2 border-ink bg-tomato" />}
              </>
            )}
          </NavLink>
        ))}
        {rest.length > 0 && (
          <button onClick={() => setMoreOpen(true)} className="flex flex-1 cursor-pointer flex-col items-center gap-0.5 py-2 text-[11px] font-bold uppercase">
            <Menu size={20} strokeWidth={2.5} />
            More
          </button>
        )}
      </nav>

      <AnimatePresence>
        {moreOpen && (
          <motion.div className="fixed inset-0 z-40 bg-ink/50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMoreOpen(false)}>
            <motion.div
              className="absolute inset-x-0 bottom-0 border-t-[3px] border-ink bg-cream p-4"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 36 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="font-display text-xl uppercase">More</p>
                <button onClick={() => setMoreOpen(false)} className="grid size-9 cursor-pointer place-items-center border-[3px] border-ink" aria-label="Close">
                  <X size={18} strokeWidth={3} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {rest.map((item) => (
                  <NavLink key={item.to} to={item.to} onClick={() => setMoreOpen(false)} className={cx('brut flex items-center gap-2 px-3 py-3 font-bold', item.tone)}>
                    <item.icon size={18} strokeWidth={2.5} /> {item.label}
                  </NavLink>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {staff && <CommandPalette links={items} open={paletteOpen} setOpen={setPaletteOpen} />}
    </div>
  )
}
