import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import Shell from './components/Shell'
import { Loader } from './components/ui'
import type { Role } from './lib/api'
import { homeFor, useAuth } from './lib/auth'
import Login from './pages/Login'

const Account = lazy(() => import('./pages/Account'))
const Welcome = lazy(() => import('./pages/Welcome'))
const Audit = lazy(() => import('./pages/staff/Audit'))
const Classes = lazy(() => import('./pages/staff/Classes'))
const CourseDetail = lazy(() => import('./pages/staff/CourseDetail'))
const Dashboard = lazy(() => import('./pages/staff/Dashboard'))
const LiveClass = lazy(() => import('./pages/staff/LiveClass'))
const Projector = lazy(() => import('./pages/staff/Projector'))
const Records = lazy(() => import('./pages/staff/Records'))
const Requests = lazy(() => import('./pages/staff/Requests'))
const StudentProfile = lazy(() => import('./pages/staff/StudentProfile'))
const Students = lazy(() => import('./pages/staff/Students'))
const Teachers = lazy(() => import('./pages/staff/Teachers'))
const UnknownFaces = lazy(() => import('./pages/staff/UnknownFaces'))
const StudentHome = lazy(() => import('./pages/student/Home'))
const MyRequests = lazy(() => import('./pages/student/MyRequests'))

/** Signed in, with one of `roles`, and past the first-login password change. */
function Guard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Loader label="Checking your pass" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (user.must_change_password) return <Navigate to="/welcome" replace />
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />
  return <>{children}</>
}

function AdminOnly() {
  const { user } = useAuth()
  return user?.role === 'admin' ? <Outlet /> : <Navigate to="/staff" replace />
}

export default function App() {
  const { user } = useAuth()
  const home = homeFor(user)
  const staff: Role[] = ['admin', 'teacher']
  return (
    <Suspense
      fallback={
        <div className="grid min-h-dvh place-items-center">
          <Loader />
        </div>
      }
    >
      <Routes>
        <Route path="/login" element={user ? <Navigate to={user.must_change_password ? '/welcome' : home} replace /> : <Login />} />
        <Route path="/welcome" element={!user ? <Navigate to="/login" replace /> : user.must_change_password ? <Welcome /> : <Navigate to={home} replace />} />

        <Route path="/staff" element={<Guard roles={staff}><Shell role={user?.role ?? 'teacher'} /></Guard>}>
          <Route index element={<Dashboard />} />
          <Route path="classes" element={<Classes />} />
          <Route path="classes/:id" element={<CourseDetail />} />
          <Route path="sessions/:id" element={<LiveClass />} />
          <Route path="records" element={<Records />} />
          <Route path="requests" element={<Requests />} />
          <Route path="students" element={<Students />} />
          <Route path="students/:id" element={<StudentProfile />} />
          <Route path="account" element={<Account />} />
          <Route element={<AdminOnly />}>
            <Route path="teachers" element={<Teachers />} />
            <Route path="unknown" element={<UnknownFaces />} />
            <Route path="audit" element={<Audit />} />
          </Route>
        </Route>
        <Route path="/projector/:id" element={<Guard roles={staff}><Projector /></Guard>} />

        <Route path="/me" element={<Guard roles={['student']}><Shell role="student" /></Guard>}>
          <Route index element={<StudentHome />} />
          <Route path="requests" element={<MyRequests />} />
          <Route path="account" element={<Account />} />
        </Route>

        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </Suspense>
  )
}
