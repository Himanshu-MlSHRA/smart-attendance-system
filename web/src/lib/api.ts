export type Role = 'admin' | 'student'

export interface Student {
  id: number
  roll_number: string
  name: string
  department: string
  enrolled: boolean
}

export interface StudentRow extends Student {
  attended: number
  class_days: number
  percent: number
  defaulter: boolean
  last_seen: string | null
}

export interface User {
  id: number
  username: string
  role: Role
  student: Student | null
}

export type Method = 'camera' | 'upload' | 'manual' | 'self'

export interface AttendanceRow {
  id: number
  date: string
  time: string
  method: Method
  student_id: number
  name: string
  roll_number: string
  department: string
}

export interface Stats {
  total_students: number
  present_today: number
  class_days: number
  enrolled_faces: number
  average_rate: number
  defaulters: number
  series: { date: string; count: number }[]
  recent: Omit<AttendanceRow, 'student_id'>[]
}

export interface FaceResult {
  box: { top: number; left: number; bottom: number; right: number }
  status: 'marked' | 'already' | 'unknown' | 'mismatch'
  student: Student | null
}

export interface MyAttendance {
  records: { id: number; date: string; time: string; method: Method }[]
  class_days: string[]
  attended: number
  percent: number
  defaulter: boolean
  threshold: number
  streak: number
  present_today: boolean
}

const TOKEN_KEY = 'present.token'

export const token = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set: (value: string | null) => {
    try {
      if (value) localStorage.setItem(TOKEN_KEY, value)
      else localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* storage unavailable; session lasts until reload */
    }
  },
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  const t = token.get()
  if (t) headers.Authorization = `Bearer ${t}`
  let payload: BodyInit | undefined
  if (body instanceof FormData) payload = body
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  const res = await fetch(`/api${path}`, { method, headers, body: payload })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && t) {
      token.set(null)
      window.dispatchEvent(new Event('present:logout'))
    }
    throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status)
  }
  return data as T
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; user: User }>('POST', '/auth/login', { username, password }),
  me: () => request<User>('GET', '/auth/me'),
  changePassword: (current: string, next: string) =>
    request('POST', '/auth/password', { current, new: next }),

  stats: () => request<Stats>('GET', '/stats'),
  students: () => request<StudentRow[]>('GET', '/students'),
  addStudent: (s: { name: string; roll_number: string; department: string }) =>
    request<Student>('POST', '/students', s),
  deleteStudent: (id: number) => request('DELETE', `/students/${id}`),
  enroll: (id: number, images: string[]) =>
    request<{ added: number; sent: number }>('POST', `/students/${id}/faces`, { images }),
  train: () => request<{ faces: number; people: number }>('POST', '/model/train'),

  attendance: (params: { date?: string; q?: string }) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][])
    return request<AttendanceRow[]>('GET', `/attendance?${qs}`)
  },
  addAttendance: (student_id: number, date: string) =>
    request('POST', '/attendance', { student_id, date }),
  deleteAttendance: (id: number) => request('DELETE', `/attendance/${id}`),
  exportAttendance: async () => {
    const res = await fetch('/api/attendance/export', {
      headers: { Authorization: `Bearer ${token.get()}` },
    })
    if (!res.ok) throw new ApiError('Export failed', res.status)
    return res.blob()
  },

  scan: (image: string) => request<{ faces: FaceResult[] }>('POST', '/scan', { image }),
  scanUpload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<{ faces: FaceResult[] }>('POST', '/scan/upload', form)
  },

  myAttendance: () => request<MyAttendance>('GET', '/me/attendance'),
  checkin: (image: string) => request<{ faces: FaceResult[] }>('POST', '/me/checkin', { image }),
}
