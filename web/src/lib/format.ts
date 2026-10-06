import type { Method } from './api'

const parse = (iso: string) => new Date(`${iso}T00:00:00`)

export const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const fmtDate = (iso: string) =>
  parse(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export const fmtDay = (iso: string) => parse(iso).toLocaleDateString(undefined, { weekday: 'short' })

export const fmtTime = (hms: string) => hms.slice(0, 5)

export const initials = (name: string) => {
  const parts = name.split(/\s+/).filter(Boolean)
  const picked = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts
  return picked.map((p) => p[0].toUpperCase()).join('')
}

export const methodLabel: Record<Method, string> = {
  camera: 'Live scan',
  upload: 'Photo',
  manual: 'Manual',
  self: 'Self check-in',
}

/** Stable accent colour per person, so avatars stay recognisable. */
const accents = ['bg-sun', 'bg-pink', 'bg-sky', 'bg-lime', 'bg-tang', 'bg-violet']
export const accentFor = (key: string) => {
  let h = 0
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return accents[h % accents.length]
}
