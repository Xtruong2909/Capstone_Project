import { createContext, useState, useCallback } from 'react'
import { authService } from '../services/authService'
import { authStorage } from '../services/authStorage'
import { requiresPasswordChange, sessionUser } from '../services/authSession'

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => authStorage.read().user)
  const [token, setToken] = useState(() => authStorage.read().token)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  // Hàm thực hiện đăng nhập
  const login = useCallback(async (email, password, rememberMe = false) => {
    const normalizedEmail = email.trim()
    const validationError = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
      ? 'Enter a valid email address.'
      : !password ? 'Enter your password.' : null
    if (validationError) {
      setError(validationError)
      return { success: false, error: validationError }
    }
    setIsLoading(true)
    setError(null)
    try {
      const data = await authService.login({ email: normalizedEmail, password })
      authStorage.save(data, rememberMe)
      const currentUser = authStorage.read().user
      
      // Lưu vào state và LocalStorage
      setToken(data.access_token)
      setUser(currentUser)
      
      return { success: true, user: currentUser }
    } catch (err) {
      const errorMessage =
        err.response?.data?.detail || 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.'
      setError(errorMessage)
      return { success: false, error: errorMessage }
    } finally {
      setIsLoading(false)
    }
  }, [])

  const changeInitialPassword = useCallback(async (newPassword) => {
    try {
      const data = await authService.changeInitialPassword(newPassword)
      const updatedUser = sessionUser(data.user, data.access_token, data.must_change_password)
      if (!data.access_token || !updatedUser || requiresPasswordChange(updatedUser, data.access_token)) {
        throw new Error('Password change could not be completed. Please try again.')
      }
      authStorage.replace(data)
      setToken(data.access_token)
      setUser(updatedUser)
    } catch (err) {
      if (err.response?.status === 401) {
        authStorage.clear()
        setToken(null)
        setUser(null)
      }
      throw err
    }
  }, [])

  // Hàm đăng xuất
  const logout = useCallback(async () => {
    try {
      if (!requiresPasswordChange(user, token)) await authService.logout()
    } catch {
      // Local logout must still succeed when the API is temporarily unavailable.
    } finally {
      setToken(null)
      setUser(null)
      authStorage.clear()
    }
  }, [user, token])

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token,
        role: user?.role || null,
        mustChangePassword: requiresPasswordChange(user, token),
        isLoading,
        error,
        login,
        changeInitialPassword,
        logout,
        setError,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
