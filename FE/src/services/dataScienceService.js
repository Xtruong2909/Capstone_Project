import apiClient from './apiClient'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1')
  .replace(/\/v1\/?$/, '')
const config = { baseURL: API_BASE }

export const dataScienceService = {
  async startAggregation(groupId, aggregationInterval = 60) {
    const { data } = await apiClient.post('/v1/ds/aggregations', { group_id: groupId, aggregation_interval: aggregationInterval }, config)
    return data
  },
  async getLatestAggregation(groupId) {
    const { data } = await apiClient.get(`/v1/ds/aggregations/groups/${groupId}/latest`, config)
    return data
  },
  async getAggregation(aggregationId, page = 1, pageSize = 20, sessionId = null) {
    const { data } = await apiClient.get(`/v1/ds/aggregations/${aggregationId}/results`, { ...config, params: { page, page_size: pageSize, ...(sessionId ? { session_id: sessionId } : {}) } })
    return { ...data,
      completed_sessions: (data.sessions || []).filter((session) => session.status === 'COMPLETED').length,
      failed_sessions: (data.sessions || []).filter((session) => session.status === 'FAILED').length,
    }
  },
  async generateFeatures(aggregationId) {
    const { data } = await apiClient.post('/lag-features/generate', { aggregation_id: aggregationId }, config)
    return data
  },
  async getFeatures(featureGenerationId) {
    const { data } = await apiClient.get(`/lag-features/${featureGenerationId}`, config)
    return data
  },
  async getLatestFeatures(aggregationId) {
    const { data } = await apiClient.get(`/lag-features/aggregations/${aggregationId}/latest`, config)
    return data
  },
  async getFeaturePreview(featureGenerationId, page = 1, { pageSize = 20, daysPerPage } = {}) {
    const params = daysPerPage ? { page, days_per_page: daysPerPage } : { page, page_size: pageSize }
    const { data } = await apiClient.get(`/lag-features/${featureGenerationId}/preview`, { ...config, params })
    return data
  },
  async createSplit(featureGenerationId) {
    const { data } = await apiClient.post('/train-test-splits', { feature_generation_id: featureGenerationId }, config)
    return data
  },
  async getSplit(splitId) {
    const { data } = await apiClient.get(`/train-test-splits/${splitId}`, config)
    return data
  },
  async getLatestSplit(featureGenerationId) {
    const { data } = await apiClient.get(`/train-test-splits/feature-generations/${featureGenerationId}/latest`, config)
    return data
  },
  async createExperiment(splitId, hyperparameters) {
    const { data } = await apiClient.post('/model-training/experiments', {
      split_id: splitId,
      hyperparameters,
    }, config)
    return data
  },
  async listExperiments({ datasetVersionId, page = 1, pageSize = 100 } = {}) {
    const { data } = await apiClient.get('/model-training/experiments', { ...config, params: { dataset_version_id: datasetVersionId, page, page_size: pageSize } })
    return data
  },
  async getExperiment(experimentId) {
    const { data } = await apiClient.get(`/model-training/experiments/${experimentId}`, config)
    return data
  },
  async getForecastOriginAnalysis(experimentId, { sessionId, originTime } = {}) {
    const { data } = await apiClient.get(`/model-training/experiments/${experimentId}/forecast-origin-analysis`, {
      ...config,
      params: {
        ...(sessionId ? { session_id: sessionId } : {}),
        ...(originTime ? { origin_time: originTime } : {}),
      },
    })
    return data
  },
  async compareExperiments(experimentIds) {
    const { data } = await apiClient.post('/model-training/experiments/compare', {
      experiment_ids: experimentIds,
    }, config)
    return data
  },
  async listPredictionExperiments() {
    const { data } = await apiClient.get('/prediction/experiments', config)
    return data.experiments
  },
  async listPredictionSessions({ experimentId, versionId, page = 1 }) {
    const { data } = await apiClient.get('/prediction/sessions', { ...config, params: { experiment_id: experimentId || undefined, dataset_version_id: versionId || undefined, eligible_only: true, page, page_size: 100 } })
    return data
  },
  async createForecast(experimentId, sessionIds) {
    const { data } = await apiClient.post('/prediction/forecasts', { experiment_id: experimentId, session_ids: sessionIds }, config)
    return data
  },
  async listForecasts({ page = 1, sessionId } = {}) {
    const { data } = await apiClient.get('/prediction/forecasts', {
      ...config,
      params: { page, page_size: 100, ...(sessionId ? { session_id: sessionId } : {}) },
    })
    return data
  },
  async getForecastDetail(forecastId) {
    const { data } = await apiClient.get(`/prediction/forecasts/${forecastId}`, config)
    return data
  },
  async getForecastResults(forecastId, page = 1, pageSize = 100) {
    const { data } = await apiClient.get(`/prediction/forecasts/${forecastId}/results`, {
      ...config,
      params: { page, page_size: pageSize },
    })
    return data
  },
  async getForecastChart(forecastId, sessionId) {
    const { data } = await apiClient.get(`/prediction/forecasts/${forecastId}/chart`, {
      ...config,
      params: { session_id: sessionId },
    })
    return data
  },
}
