import { AnimatePresence, motion } from 'motion/react'
import { BookOpen, CornerDownLeft, Search, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type Student } from '../lib/api'
import { useHotkey } from '../lib/hooks'
import { Avatar, cx } from './ui'

export interface PaletteLink {
  to: string
  label: string
  icon: LucideIcon
}

interface Item {
  key: string
  label: string
  hint: string
  to: string
  render: () => ReactNode
}

/** Ctrl/⌘+K: jump to any page, student or course. */
export function CommandPalette({ links, open, setOpen }: { links: PaletteLink[]; open: boolean; setOpen: (v: boolean) => void }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [found, setFound] = useState<{ students: Student[]; courses: { id: number; code: string; name: string }[] }>({ students: [], courses: [] })
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useHotkey('mod+k', () => setOpen(!open))

  // Fresh search every time it opens.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setQ('')
      setActive(0)
    }
  }

  useEffect(() => {
    if (!q.trim()) return
    const t = setTimeout(() => api.search(q).then(setFound).catch(() => {}), 150)
    return () => clearTimeout(t)
  }, [q])

  const items: Item[] = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const pages = links
      .filter((l) => !needle || l.label.toLowerCase().includes(needle))
      .map((l) => ({
        key: `p-${l.to}`,
        label: l.label,
        hint: 'Page',
        to: l.to,
        render: () => (
          <span className="grid size-8 place-items-center border-[3px] border-ink bg-sun">
            <l.icon size={16} strokeWidth={2.5} />
          </span>
        ),
      }))
    const results = needle ? found : { students: [], courses: [] }
    const students = results.students.map((s) => ({
      key: `s-${s.id}`,
      label: s.name,
      hint: s.roll_number,
      to: `/staff/students/${s.id}`,
      render: () => <Avatar name={s.name} seed={s.roll_number} size="sm" photoId={s.has_photo && s.id} />,
    }))
    const courses = results.courses.map((c) => ({
      key: `c-${c.id}`,
      label: `${c.code} · ${c.name}`,
      hint: 'Course',
      to: `/staff/classes/${c.id}`,
      render: () => (
        <span className="grid size-8 place-items-center border-[3px] border-ink bg-sky">
          <BookOpen size={16} strokeWidth={2.5} />
        </span>
      ),
    }))
    return [...students, ...courses, ...pages]
  }, [q, found, links])

  const go = (item: Item | undefined) => {
    if (!item) return
    setOpen(false)
    navigate(item.to)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[55] flex items-start justify-center bg-ink/60 p-4 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-label="Search"
            className="brut-lg w-full max-w-xl bg-cream"
            initial={{ y: -30, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false)
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(a + 1, items.length - 1))
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(a - 1, 0))
              }
              if (e.key === 'Enter') go(items[active])
            }}
          >
            <div className="flex items-center gap-3 border-b-[3px] border-ink px-4">
              <Search size={20} strokeWidth={2.5} />
              <input
                ref={inputRef}
                autoFocus
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  setActive(0)
                }}
                placeholder="Search students, courses, pages…"
                className="w-full bg-transparent py-4 text-lg font-medium outline-none placeholder:text-ink/40"
              />
              <kbd className="border-2 border-ink px-1.5 font-mono text-[11px] font-bold">ESC</kbd>
            </div>
            <ul className="max-h-[50vh] overflow-y-auto p-2">
              {items.length === 0 && <li className="px-3 py-6 text-center font-bold text-ink/60">Nothing matches “{q}”.</li>}
              {items.map((item, i) => (
                <li key={item.key}>
                  <button
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(item)}
                    className={cx('flex w-full cursor-pointer items-center gap-3 border-[3px] px-3 py-2 text-left', i === active ? 'border-ink bg-sun' : 'border-transparent')}
                  >
                    {item.render()}
                    <span className="min-w-0 flex-1 truncate font-bold">{item.label}</span>
                    <span className="font-mono text-xs text-ink/60">{item.hint}</span>
                    {i === active && <CornerDownLeft size={14} strokeWidth={3} />}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
