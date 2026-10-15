import type { Method, RosterStatus } from './api'

const parse = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`)

export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const today = () => isoDate(new Date())

export const fmtDate = (iso: string) =>
  parse(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export const fmtShort = (iso: string) => parse(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export const fmtDay = (iso: string) => parse(iso).toLocaleDateString(undefined, { weekday: 'short' })

export const fmtTime = (hms: string | null | undefined) => (hms ? hms.slice(0, 5) : '—')

export const fmtPct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n}%`)

/** "Today", "Yesterday" or a short date. */
export const fmtRelDay = (iso: string) => {
  const t = today()
  if (iso.slice(0, 10) === t) return 'Today'
  const y = new Date()
  y.setDate(y.getDate() - 1)
  if (iso.slice(0, 10) === isoDate(y)) return 'Yesterday'
  return fmtShort(iso)
}

export const initials = (name: string) => {
  const parts = name.split(/\s+/).filter((p) => p && !p.endsWith('.'))
  const picked = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts
  return picked.map((p) => p[0].toUpperCase()).join('')
}

export const methodLabel: Record<Method, string> = {
  camera: 'Live scan',
  upload: 'Photo',
  manual: 'Manual',
  self: 'Self check-in',
  request: 'Request',
}

export const statusLabel: Record<RosterStatus, string> = {
  present: 'Present',
  late: 'Late',
  excused: 'Excused',
  absent: 'Absent',
  waiting: 'Not yet',
}

export const statusTone = {
  present: 'lime',
  late: 'tang',
  excused: 'sky',
  absent: 'tomato',
  waiting: 'cream',
} as const

/** Stable accent colour per person, so avatars stay recognisable. */
const accents = ['bg-sun', 'bg-pink', 'bg-sky', 'bg-lime', 'bg-tang', 'bg-violet']
export const accentFor = (key: string) => {
  let h = 0
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return accents[h % accents.length]
}

/** Classes needed in a row to reach `threshold`%, and how many can be missed while staying above it. */
export function runway(attended: number, held: number, threshold: number) {
  const t = threshold / 100
  return {
    needed: Math.max(0, Math.ceil((t * held - attended) / (1 - t))),
    canMiss: Math.max(0, Math.floor((attended - t * held) / t)),
  }
}

export const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export const longToday = () => new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`
