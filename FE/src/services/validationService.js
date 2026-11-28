import apiClient from './apiClient'
const config = {
  baseURL: (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1').replace(/\/v1\/?$/, ''),
  timeout: 300000,
}
export const validationService = {
  async list(generationId) {
    return (await apiClient.get('/validation-studies', { ...config, params: { feature_generation_id: generationId } })).data
  },
  async create(payload) { return (await apiClient.post('/validation-studies', payload, config)).data },
  async get(id) { return (await apiClient.get(`/validation-studies/${id}`, config)).data },
  async run(id, index) { return (await apiClient.post(`/validation-studies/${id}/candidates/${index}/run`, {}, config)).data },
  async finalize(id) { return (await apiClient.post(`/validation-studies/${id}/finalize`, {}, config)).data },
}
