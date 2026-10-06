import { Navigate, Route, Routes } from 'react-router-dom'
import { Loader } from './components/ui'
import Shell from './components/Shell'
import { useAuth } from './lib/auth'
import type { Role } from './lib/api'
import Login from './pages/Login'
import Dashboard from './pages/admin/Dashboard'
import Records from './pages/admin/Records'
import Scanner from './pages/admin/Scanner'
import Students from './pages/admin/Students'
import Account from './pages/Account'
import StudentHome from './pages/student/Home'

function Guard({ role }: { role: Role }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Loader label="Checking your pass" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/me'} replace />
  return <Shell role={role} />
}

export default function App() {
  const { user } = useAuth()
  const home = user ? (user.role === 'admin' ? '/admin' : '/me') : '/login'
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={home} replace /> : <Login />} />
      <Route path="/admin" element={<Guard role="admin" />}>
        <Route index element={<Dashboard />} />
        <Route path="scan" element={<Scanner />} />
        <Route path="students" element={<Students />} />
        <Route path="records" element={<Records />} />
        <Route path="account" element={<Account />} />
      </Route>
      <Route path="/me" element={<Guard role="student" />}>
        <Route index element={<StudentHome />} />
        <Route path="account" element={<Account />} />
      </Route>
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  )
}
