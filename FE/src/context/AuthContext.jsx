import { createContext, useState, useCallback } from 'react'
import { authService } from '../services/authService'
import { authStorage } from '../services/authStorage'

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => authStorage.read().user)
  const [token, setToken] = useState(() => authStorage.read().token)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  // Hàm thực hiện đăng nhập
  const login = useCallback(async (email, password, rememberMe = false) => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await authService.login({ email, password })
      authStorage.save(data, rememberMe)
      
      // Lưu vào state và LocalStorage
      setToken(data.access_token)
      setUser(data.user)
      
      return { success: true, user: data.user }
    } catch (err) {
      const errorMessage =
        err.response?.data?.detail || 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.'
      setError(errorMessage)
      return { success: false, error: errorMessage }
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Hàm đăng xuất
  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    authStorage.clear()
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token,
        role: user?.role || null,
        isLoading,
        error,
        login,
        logout,
        setError,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
