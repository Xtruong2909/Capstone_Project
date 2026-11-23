import axios from 'axios'
import { authStorage } from './authStorage'
import { invalidateAdminResourceCache } from './adminResourceCache'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Cookies carry the session; mutations also need the session-bound CSRF nonce.
apiClient.interceptors.request.use(
  (config) => {
    const { csrfToken } = authStorage.read()
    if (csrfToken && !['get', 'head', 'options'].includes(config.method?.toLowerCase() || 'get')) {
      config.headers['X-CSRF-Token'] = csrfToken
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response Interceptor: Xử lý khi Token hết hạn (401 Unauthorized)
apiClient.interceptors.response.use(
  (response) => {
    const method = response.config?.method?.toLowerCase()
    if (['post', 'put', 'patch', 'delete'].includes(method) && /(^|\/)admin(\/|$)/.test(response.config?.url || '')) {
      invalidateAdminResourceCache()
    }
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      authStorage.clear()
      // Có thể chuyển hướng về trang login nếu cần
    }
    return Promise.reject(error)
  }
)

export default apiClient
