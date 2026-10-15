export type Role = 'admin' | 'teacher' | 'student'
export type Status = 'present' | 'late' | 'excused' | 'absent'
export type Method = 'camera' | 'upload' | 'manual' | 'self' | 'request'

export interface Student {
  id: number
  roll_number: string
  name: string
  department: string
  email: string | null
  enrolled: boolean
  has_photo: boolean
}

export interface Summary {
  present: number
  late: number
  excused: number
  absent: number
  attended: number
  held: number
  percent: number | null
  defaulter: boolean
}

export interface StudentRow extends Student, Summary {
  last_seen: string | null
  courses: { id: number; code: string }[]
}

export interface User {
  id: number
  username: string
  name: string
  email: string | null
  role: Role
  must_change_password: boolean
  student: Student | null
}

export interface Course {
  id: number
  code: string
  name: string
  department: string
  teacher_id: number | null
  teacher_name: string | null
  students: number
  sessions: number
  open_session_id: number | null
  rate: number | null
}

export interface Session {
  id: number
  course_id: number
  course_code: string | null
  course_name: string | null
  topic: string
  date: string
  start_time: string
  end_time: string
  late_after: number
  status: 'open' | 'closed'
  closed_at: string | null
}

export interface CourseDetail extends Omit<Course, 'students' | 'sessions' | 'open_session_id' | 'rate'> {
  can_run: boolean
  threshold: number
  roster: (Student & Summary)[]
  sessions: (Session & { present: number; late: number; excused: number })[]
}

export type RosterStatus = Status | 'waiting'

export interface LiveSession extends Session {
  can_run: boolean
  roster: { student: Student; status: RosterStatus; time: string | null; method: Method | null; similarity: number | null }[]
  counts: Record<RosterStatus, number>
  unknown_faces: number
  code: string | null
  code_expires_in: number | null
  server_time: string
  /** Client clock (ms) when this response arrived; the code countdown runs from here. */
  received_at: number
}

export interface FaceResult {
  box: { top: number; left: number; bottom: number; right: number }
  status: 'marked' | 'already' | 'unknown' | 'mismatch' | 'not_in_class'
  student: Student | null
  similarity: number | null
  late: boolean
}

export interface Stats {
  total_students: number
  courses: number
  present_today: number
  sessions_held: number
  average_rate: number | null
  defaulters: number
  threshold: number
  pending_requests: number
  unknown_faces: number
  today: (Pick<Session, 'id' | 'course_id' | 'course_code' | 'course_name' | 'topic' | 'date' | 'start_time' | 'end_time' | 'status'> & {
    present: number
    roster: number
  })[]
  heatmap: { date: string; sessions: number; rate: number | null }[]
  arrivals: { minute: number; count: number }[]
  weekly: { week: string; rate: number | null }[]
  at_risk: ({ id: number; name: string; roll_number: string; department: string; weekly: (number | null)[] } & Summary)[]
  course_breakdown: { id: number; code: string; name: string; teacher_name: string | null; students: number; sessions: number; rate: number | null }[]
  recent: {
    id: number
    status: Status
    method: Method
    time: string
    date: string
    course_code: string
    student_id: number
    name: string
    roll_number: string
    department: string
  }[]
}

export interface TimelineEntry {
  session_id: number
  course_id: number
  course_code: string
  course_name: string
  date: string
  start_time: string
  topic: string
  status: Status
  time: string | null
  method: Method | null
  request: { id: number; kind: RequestKind; status: RequestStatus } | null
}

export interface Badge {
  id: string
  label: string
  description: string
  earned: boolean
}

export interface Report {
  overall: Summary
  threshold: number
  courses: ({ id: number; code: string; name: string; teacher_name: string | null } & Summary)[]
  timeline: TimelineEntry[]
  streak: number
  best_streak: number
  weekly: { week: string; rate: number | null }[]
  badges: Badge[]
}

export interface OpenSession extends Session {
  teacher_name: string | null
  my_status: Status | null
}

export interface MyAttendance extends Report {
  open_sessions: OpenSession[]
  liveness: boolean
  code_step: number
}

export type RequestKind = 'leave' | 'correction'
export type RequestStatus = 'pending' | 'approved' | 'rejected'

export interface LeaveRequest {
  id: number
  kind: RequestKind
  reason: string
  status: RequestStatus
  note: string | null
  created_at: string
  decided_at: string | null
  decided_by_name: string | null
  session_id: number
  date: string
  start_time: string
  topic: string
  course_id: number
  course_code: string
  course_name: string
  student_id: number
  name: string
  roll_number: string
}

export interface RecordRow {
  id: number | null
  session_id: number
  course_id: number
  course_code: string
  date: string
  start_time: string
  time: string | null
  status: Status
  method: Method | null
  student_id: number
  name: string
  roll_number: string
  department: string
}

export interface Teacher {
  id: number
  username: string
  name: string
  email: string | null
  created_at: string
  courses: string | null
}

export interface UnknownFace {
  id: number
  captured_at: string
  session_id: number | null
  date: string | null
  course_code: string | null
}

export interface AuditEntry {
  id: number
  at: string
  user_id: number | null
  username: string | null
  action: string
  detail: string
}

export interface DemoAccount {
  label: 'Admin' | 'Teacher' | 'Student'
  username: string
  password: string
}

export interface AlertPreview {
  dry_run: boolean
  smtp_configured: boolean
  sent: number
  preview: { name: string; roll_number: string; email: string | null; percent: number; subject: string; text: string }[]
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

function authHeaders(): Record<string, string> {
  const t = token.get()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers = authHeaders()
  let payload: BodyInit | undefined
  if (body instanceof FormData) payload = body
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  const res = await fetch(`/api${path}`, { method, headers, body: payload })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && headers.Authorization) {
      token.set(null)
      window.dispatchEvent(new Event('present:logout'))
    }
    throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status)
  }
  return data as T
}

/** Fetch a protected file (CSV, image) as a Blob. */
async function blob(path: string): Promise<Blob> {
  const res = await fetch(`/api${path}`, { headers: authHeaders() })
  if (!res.ok) throw new ApiError(res.status === 404 ? 'Not found' : `Download failed (${res.status})`, res.status)
  return res.blob()
}

const qs = (params: Record<string, string | number | undefined | null>) =>
  new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, String(v)]),
  ).toString()

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; user: User }>('POST', '/auth/login', { username, password }),
  me: () => request<User>('GET', '/auth/me'),
  demoAccounts: () => request<DemoAccount[]>('GET', '/auth/demo'),
  changePassword: (current: string, next: string) =>
    request<{ token: string; user: User }>('POST', '/auth/password', { current, new: next }),

  stats: () => request<Stats>('GET', '/stats'),
  search: (q: string) => request<{ students: Student[]; courses: { id: number; code: string; name: string }[] }>('GET', `/search?${qs({ q })}`),

  students: () => request<StudentRow[]>('GET', '/students'),
  student: (id: number) => request<Report & { student: Student }>('GET', `/students/${id}`),
  addStudent: (s: { name: string; roll_number: string; department: string; email?: string; course_ids?: number[] }) =>
    request<Student>('POST', '/students', s),
  updateStudent: (id: number, s: Partial<{ name: string; department: string; email: string; course_ids: number[] }>) =>
    request<Student>('PATCH', `/students/${id}`, s),
  importStudents: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<{ created: string[]; skipped: { line: number; reason: string }[] }>('POST', '/students/import', form)
  },
  deleteStudent: (id: number) => request('DELETE', `/students/${id}`),
  resetPassword: (id: number) => request('POST', `/students/${id}/reset-password`),
  enroll: (id: number, images: string[]) => request<{ added: number; sent: number }>('POST', `/students/${id}/faces`, { images }),
  photo: (id: number) => blob(`/students/${id}/photo`),
  train: () => request<{ faces: number; people: number }>('POST', '/model/train'),

  courses: () => request<Course[]>('GET', '/courses'),
  course: (id: number) => request<CourseDetail>('GET', `/courses/${id}`),
  addCourse: (c: { code: string; name: string; department: string; teacher_id: number | null; enroll_department: boolean }) =>
    request<{ id: number }>('POST', '/courses', c),
  updateCourse: (id: number, c: Partial<{ name: string; department: string; teacher_id: number | null }>) =>
    request('PATCH', `/courses/${id}`, c),
  setRoster: (id: number, student_ids: number[]) => request<{ students: number }>('PUT', `/courses/${id}/students`, { student_ids }),
  deleteCourse: (id: number) => request('DELETE', `/courses/${id}`),
  register: (id: number) => blob(`/courses/${id}/report.csv`),
  startSession: (courseId: number, s: { topic: string; duration: number; late_after: number }) =>
    request<{ id: number }>('POST', `/courses/${courseId}/sessions`, s),

  sessions: (params: { date?: string; status?: string; course_id?: number } = {}) =>
    request<(Session & { present: number; roster: number })[]>('GET', `/sessions?${qs(params)}`),
  session: (id: number) =>
    request<Omit<LiveSession, 'received_at'>>('GET', `/sessions/${id}`).then((s): LiveSession => ({ ...s, received_at: Date.now() })),
  closeSession: (id: number) => request('POST', `/sessions/${id}/close`),
  reopenSession: (id: number) => request('POST', `/sessions/${id}/reopen`),
  deleteSession: (id: number) => request('DELETE', `/sessions/${id}`),
  scan: (id: number, image: string) => request<{ faces: FaceResult[] }>('POST', `/sessions/${id}/scan`, { image }),
  scanUpload: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<{ faces: FaceResult[] }>('POST', `/sessions/${id}/scan/upload`, form)
  },
  setStatus: (sessionId: number, studentId: number, status: Status) =>
    request('PUT', `/sessions/${sessionId}/attendance/${studentId}`, { status }),

  records: (params: { course_id?: number; from?: string; to?: string; status?: string; q?: string }) =>
    request<{ rows: RecordRow[]; total: number; truncated: boolean }>('GET', `/attendance?${qs(params)}`),
  exportRecords: (params: { course_id?: number; from?: string; to?: string; status?: string; q?: string }) =>
    blob(`/attendance/export?${qs(params)}`),

  requests: (status?: RequestStatus) => request<LeaveRequest[]>('GET', `/requests?${qs({ status })}`),
  decide: (id: number, approve: boolean, note: string) => request('POST', `/requests/${id}/decide`, { approve, note }),

  teachers: () => request<Teacher[]>('GET', '/teachers'),
  addTeacher: (t: { username: string; name: string; email: string; password: string }) => request('POST', '/teachers', t),
  deleteTeacher: (id: number) => request('DELETE', `/teachers/${id}`),

  unknown: () => request<UnknownFace[]>('GET', '/unknown'),
  unknownImage: (id: number) => blob(`/unknown/${id}/image`),
  assignUnknown: (id: number, student_id: number) => request<{ marked: boolean }>('POST', `/unknown/${id}/assign`, { student_id }),
  dismissUnknown: (id: number) => request('DELETE', `/unknown/${id}`),

  audit: (action?: string) => request<AuditEntry[]>('GET', `/audit?${qs({ action })}`),
  alertDefaulters: (dry_run: boolean) => request<AlertPreview>('POST', '/alerts/defaulters', { dry_run }),

  myAttendance: () => request<MyAttendance>('GET', '/me/attendance'),
  checkin: (session_id: number, code: string, frames: string[]) =>
    request<{ status: 'marked' | 'already'; late: boolean; box: FaceResult['box'] | null; similarity: number | null }>(
      'POST',
      '/me/checkin',
      { session_id, code, frames },
    ),
  myRequests: () => request<LeaveRequest[]>('GET', '/me/requests'),
  createRequest: (session_id: number, kind: RequestKind, reason: string) =>
    request<{ id: number }>('POST', '/me/requests', { session_id, kind, reason }),
  cancelRequest: (id: number) => request('DELETE', `/me/requests/${id}`),
}

/** Save a Blob as a file. */
export function download(data: Blob, filename: string) {
  const url = URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
