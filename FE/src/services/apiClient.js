import axios from 'axios'
import { authStorage } from './authStorage'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request Interceptor: Tự động gắn Token vào Header nếu đã đăng nhập
apiClient.interceptors.request.use(
  (config) => {
    const { token } = authStorage.read()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response Interceptor: Xử lý khi Token hết hạn (401 Unauthorized)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      authStorage.clear()
      // Có thể chuyển hướng về trang login nếu cần
    }
    return Promise.reject(error)
  }
)

export default apiClient
