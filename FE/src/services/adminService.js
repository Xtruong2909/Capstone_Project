import apiClient from './apiClient'

export const adminService = {
  /**
   * Lấy thống kê tổng quan hệ thống từ DB
   */
  async getStats() {
    const response = await apiClient.get('/admin/stats')
    return response.data
  },

  /**
   * Lấy danh sách toàn bộ người dùng
   */
  async getUsers(params = {}) {
    const response = await apiClient.get('/admin/users', { params })
    return response.data
  },

  /**
   * Tạo người dùng mới
   */
  async createUser(userData) {
    const response = await apiClient.post('/admin/users', userData)
    return response.data
  },

  /**
   * Cập nhật trạng thái kích hoạt tài khoản
   */
  async updateUserStatus(userId, isActive) {
    const response = await apiClient.patch(`/admin/users/${userId}/status`, {
      is_active: isActive,
    })
    return response.data
  },

  /**
   * Lấy danh sách các vai trò hệ thống
   */
  async getRoles() {
    const response = await apiClient.get('/admin/roles')
    return response.data
  },

  /**
   * Lấy nhật ký hoạt động hệ thống (Audit Trail)
   */
  async getAuditLogs(params = {}) {
    const response = await apiClient.get('/admin/audit-logs', { params })
    return response.data
  },

  /**
   * Lấy danh sách phiên bản dataset để phê duyệt
   */
  async getDatasets(params = {}) {
    const response = await apiClient.get('/admin/datasets', { params })
    return response.data
  },

  /**
   * Phê duyệt hoặc từ chối phiên bản dataset
   */
  async reviewDataset(versionId, action) {
    const response = await apiClient.post(`/admin/datasets/${versionId}/review`, action)
    return response.data
  },
}
