import { createContext, useState, useEffect, useCallback } from 'react'
import { authService } from '../services/authService'

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('user_info')
    return savedUser ? JSON.parse(savedUser) : null
  })
  const [token, setToken] = useState(() => localStorage.getItem('access_token') || null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  // Hàm thực hiện đăng nhập
  const login = useCallback(async (email, password) => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await authService.login({ email, password })
      
      // Lưu vào state và LocalStorage
      setToken(data.access_token)
      setUser(data.user)
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('user_info', JSON.stringify(data.user))
      
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
    localStorage.removeItem('access_token')
    localStorage.removeItem('user_info')
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