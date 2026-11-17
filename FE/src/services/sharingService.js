import apiClient from './apiClient'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1')
  .replace(/\/v1\/?$/, '')

export const sharingService = {
  async listAvailableResources(params) {
    const { data } = await apiClient.get('/shares/available-resources', { baseURL: API_BASE, params })
    return data
  },
  async listManagedResources(params = {}) {
    const { data } = await apiClient.get('/shares/manage', { baseURL: API_BASE, params })
    return data
  },
  async createBatch(resources) {
    const { data } = await apiClient.post('/shares/batch', { resources }, { baseURL: API_BASE })
    return data
  },
  async revoke(shareId) {
    const { data } = await apiClient.patch(`/shares/${shareId}/revoke`, {}, { baseURL: API_BASE })
    return data
  },
  async getManaged(shareId) {
    const { data } = await apiClient.get(`/shares/${shareId}`, { baseURL: API_BASE })
    return data
  },
  async listMine(params = {}) {
    const { data } = await apiClient.get('/shares/mine', { baseURL: API_BASE, params })
    return data
  },
  async create(payload) {
    const { data } = await apiClient.post('/shares', payload, { baseURL: API_BASE })
    return data
  },
  async update(shareId, payload) {
    const { data } = await apiClient.patch(`/shares/${shareId}`, payload, { baseURL: API_BASE })
    return data
  },
  async listPublished(params = {}) {
    const { data } = await apiClient.get('/shared-results', { baseURL: API_BASE, params })
    return data
  },
  async getPublished(shareId) {
    const { data } = await apiClient.get(`/shared-results/${shareId}`, { baseURL: API_BASE })
    return data
  },
  async getRows(shareId, itemId, section, page = 1, pageSize = 20) {
    const { data } = await apiClient.get(`/shared-results/${shareId}/items/${itemId}/rows`, {
      baseURL: API_BASE,
      params: { section, page, page_size: pageSize },
    })
    return data
  },
}
