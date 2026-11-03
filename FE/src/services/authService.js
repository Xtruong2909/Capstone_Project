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
   * Lấy thông tin tài khoản hiện tại từ Token (GET /api/v1/auth/me)
   * @returns {Promise<object>}
   */
  async getCurrentUser() {
    const response = await apiClient.get('/auth/me')
    return response.data
  },

  /**
   * Đổi mật khẩu trong Profile bằng mật khẩu hiện tại (POST /api/v1/auth/profile/change-password)
   * @param {{ current_password: string, new_password: string, confirm_new_password: string }} payload
   * @returns {Promise<{ message: string }>}
   */
  async changePasswordInProfile(payload) {
    const response = await apiClient.post('/auth/profile/change-password', payload)
    return response.data
  },
}