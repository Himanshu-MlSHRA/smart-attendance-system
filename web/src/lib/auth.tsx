import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, token, type User } from './api'

interface AuthState {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<User>
  changePassword: (current: string, next: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export const isStaff = (user: User | null) => user?.role === 'admin' || user?.role === 'teacher'
// eslint-disable-next-line react-refresh/only-export-components
export const homeFor = (user: User | null) => (!user ? '/login' : user.role === 'student' ? '/me' : '/staff')

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(() => token.get() !== null)

  useEffect(() => {
    if (!token.get()) return
    api
      .me()
      .then(setUser)
      .catch(() => token.set(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const onLogout = () => setUser(null)
    window.addEventListener('present:logout', onLogout)
    return () => window.removeEventListener('present:logout', onLogout)
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.login(username, password)
    token.set(res.token)
    setUser(res.user)
    return res.user
  }, [])

  // A password change signs out every other session and hands this one a new token.
  const changePassword = useCallback(async (current: string, next: string) => {
    const res = await api.changePassword(current, next)
    token.set(res.token)
    setUser(res.user)
  }, [])

  const logout = useCallback(() => {
    token.set(null)
    setUser(null)
  }, [])

  return <AuthContext.Provider value={{ user, loading, login, changePassword, logout }}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
