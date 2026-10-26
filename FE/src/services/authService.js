import apiClient from './apiClient'

export const authService = {
  /**
   * Đăng nhập người dùng
   * @param {{ email: string, password: string }} credentials 
   * @returns {Promise<{ access_token: string, token_type: string, user: object }>}
   */
  async login(credentials) {
    const response = await apiClient.post('/auth/login', credentials)
    return response.data
  },

  /**
   * Lấy thông tin tài khoản hiện tại từ Token
   * @returns {Promise<object>}
   */
  async getCurrentUser() {
    const response = await apiClient.get('/auth/me')
    return response.data
  },
}