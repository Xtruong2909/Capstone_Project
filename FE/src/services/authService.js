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
  /**
   * Gửi yêu cầu OTP quên mật khẩu
   * @param {string} email
   */
  async forgotPassword(email) {
    const response = await apiClient.post('/auth/forgot-password', { email })
    return response.data
  },
  /**
   * Xác thực mã OTP
   * @param {{ email: string, otp: string }} payload
   */
  async verifyOtp({ email, otp }) {
    const response = await apiClient.post('/auth/verify-otp', { email, otp })
    return response.data
  },
  /**
   * Đặt lại mật khẩu mới
   * @param {{ email: string, reset_token: string, new_password: string }} payload
   */
  async resetPassword({ email, reset_token, new_password }) {
    const response = await apiClient.post('/auth/reset-password', {
      email,
      reset_token,
      new_password,
    })
    return response.data
  },
}