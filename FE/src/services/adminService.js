import apiClient from './apiClient'

const get = async (url, params = {}, signal) => (await apiClient.get(url, { params, signal })).data

export const adminService = {
  getStats: (_, signal) => get('/admin/portal/summary', {}, signal),
  getUsers: (params, signal) => get('/admin/portal/users', params, signal),
  getRoles: (_, signal) => get('/admin/roles', {}, signal),
  getDatasets: (params, signal) => get('/admin/portal/datasets', params, signal),
  getDatasetGroups: (params, signal) => get('/admin/portal/dataset-groups', params, signal),
  getBatchEligibleUsers: ({ group_id, ...params }, signal) => get(`/admin/datasets/groups/${group_id}/eligible-users`, params, signal),
  async grantBatchAccess({ group_id, user_id }) {
    return (await apiClient.post(`/admin/datasets/groups/${group_id}/access`, { user_id })).data
  },
  getBatchAccessUsers: ({ group_id, ...params }, signal) => get(`/admin/datasets/groups/${group_id}/access`, params, signal),
  async revokeBatchAccess({ group_id, user_id }) {
    await apiClient.delete(`/admin/datasets/groups/${group_id}/access/${user_id}`)
  },
  getAccessGrants: (params, signal) => get('/admin/portal/access-grants', params, signal),
  async getAuditLogs({ page = 1, page_size = 20, ...filters } = {}, signal) {
    const result = await get('/admin/audit-logs', { ...filters, skip: (page - 1) * page_size, limit: page_size }, signal)
    return { items: result.items, total: result.total, page, page_size }
  },
  async getExperimentsOverview({ page = 1, page_size = 20 } = {}, signal) {
    const result = await get('/admin/experiments/overview', { skip: (page - 1) * page_size, limit: page_size }, signal)
    return { ...result, items: result.experiments, total: result.stats.total_experiments, page, page_size }
  },
  async getDatabaseHealth(_, signal) {
    const baseURL = apiClient.defaults.baseURL.replace(/\/api\/v1\/?$/, '')
    return (await apiClient.get('/health/db', { baseURL, signal })).data
  },
  async createUser(payload) { return (await apiClient.post('/admin/users', payload)).data },
  async updateUserStatus(userId, isActive) {
    return (await apiClient.patch(`/admin/users/${userId}/status`, { is_active: isActive })).data
  },
  async reviewDataset(datasetId, versionId, payload) {
    return (await apiClient.post(`/admin/datasets/${datasetId}/versions/${versionId}/review`, payload)).data
  },
  async reviewBatch(groupId, payload) {
    return (await apiClient.post(`/admin/datasets/groups/${groupId}/review`, payload)).data
  },
  async grantAccess({ dataset_id, user_id }) {
    return (await apiClient.post(`/admin/datasets/${dataset_id}/access`, { user_id })).data
  },
  async revokeAccess({ dataset_id, user_id }) {
    return (await apiClient.delete(`/admin/datasets/${dataset_id}/access/${user_id}`)).data
  },
  async getDatasetSessions({ dataset_id, version_id, ...params }, signal) {
    const result = await get(`/admin/datasets/${dataset_id}/versions/${version_id}/sessions`, params, signal)
    return { ...result, items: result.sessions }
  },
  getSessionPreview: ({ dataset_id, version_id, session_id, page_size = 20, ...params }, signal) =>
    get(`/admin/datasets/${dataset_id}/versions/${version_id}/sessions/${session_id}/preview`, { ...params, limit: page_size }, signal),
  getEligibleUsers: ({ dataset_id, ...params }, signal) => get(`/admin/datasets/${dataset_id}/eligible-users`, params, signal),
}
