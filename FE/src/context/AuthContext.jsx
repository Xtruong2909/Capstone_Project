import { createContext, useState, useCallback, useEffect } from 'react'
import { authService } from '../services/authService'
import { authStorage } from '../services/authStorage'
import { requiresPasswordChange } from '../services/authSession'

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => authStorage.read().user)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sessionError, setSessionError] = useState(null)

  useEffect(() => {
    let active = true
    const unsubscribe = authStorage.subscribe((session) => setUser(session.user))
    authService.restoreSession().then((session) => {
      if (active) authStorage.save(session)
    }).catch((err) => {
      if (active) {
        authStorage.clear()
        if (err.response?.status !== 401) setError('Không thể kiểm tra phiên đăng nhập. Vui lòng thử lại.')
      }
    }).finally(() => { if (active) setIsLoading(false) })
    return () => { active = false; unsubscribe() }
  }, [])

  const login = useCallback(async (email, password, rememberMe = false) => {
    const normalizedEmail = email.trim()
    const validationError = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
      ? 'Enter a valid email address.' : !password ? 'Enter your password.' : null
    if (validationError) {
      setError(validationError)
      return { success: false, error: validationError }
    }
    setIsLoading(true)
    setError(null)
    try {
      const session = await authService.login({
        email: normalizedEmail, password, remember_me: rememberMe,
      })
      authStorage.save(session)
      return { success: true, user: authStorage.read().user }
    } catch (err) {
      const message = err.response?.data?.detail || 'Đăng nhập thất bại. Vui lòng thử lại.'
      setError(message)
      return { success: false, error: message }
    } finally { setIsLoading(false) }
  }, [])

  const changeInitialPassword = useCallback(async (newPassword) => {
    const session = await authService.changeInitialPassword(newPassword)
    if (!session.user || !session.csrf_token || requiresPasswordChange(session.user)) {
      throw new Error('Password change could not be completed. Please try again.')
    }
    authStorage.replace(session)
  }, [])

  const logout = useCallback(async () => {
    // A network failure must not be reported as a successful server-side logout.
    setSessionError(null)
    try {
      await authService.logout()
      authStorage.clear()
    } catch (err) {
      setSessionError('Chưa thể đăng xuất khỏi server. Vui lòng kiểm tra kết nối và thử lại.')
      throw err
    }
  }, [])

  return <AuthContext.Provider value={{
    user, isAuthenticated: Boolean(user), role: user?.role || null,
    mustChangePassword: requiresPasswordChange(user), isLoading, error,
    login, changeInitialPassword, logout, setError,
  }}>{sessionError && <div role="alert" style={{ padding: '12px 20px', background: '#fff1f2', color: '#9f1239' }}>{sessionError}</div>}{children}</AuthContext.Provider>
}
