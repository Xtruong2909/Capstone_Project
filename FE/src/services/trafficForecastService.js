import apiClient from './apiClient'

/**
 * Feature-engineering endpoints are mounted under `/api` (NOT `/api/v1`),
 * so we override the baseURL of the shared client for those calls.
 */
const FEATURE_API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'
).replace(/\/v1\/?$/, '')

const aggregationUrl = (datasetId, suffix = '') =>
  `/datasets/${datasetId}/traffic/aggregation${suffix}`

export const trafficForecastService = {
  // ---------------------------------------------------------------- Aggregation
  /** POST /datasets/{dataset_id}/traffic/aggregation - starts a background job (202). */
  async startAggregation(datasetId, { aggregationInterval = 60, roiIdentifier = 'MAIN_ROI', replaceExisting = false } = {}) {
    const response = await apiClient.post(aggregationUrl(datasetId), {
      aggregation_interval: aggregationInterval,
      roi_identifier: roiIdentifier,
      replace_existing: replaceExisting,
    })
    return response.data
  },

  /** GET /datasets/{dataset_id}/traffic/aggregation/jobs/{job_id} - poll job. */
  async getAggregationJob(datasetId, jobId) {
    const response = await apiClient.get(aggregationUrl(datasetId, `/jobs/${jobId}`))
    return response.data
  },

  /** GET /datasets/{dataset_id}/traffic/aggregation/status */
  async getAggregationStatus(datasetId, { aggregationInterval = 60, roiIdentifier = 'MAIN_ROI' } = {}) {
    const response = await apiClient.get(aggregationUrl(datasetId, '/status'), {
      params: { aggregation_interval: aggregationInterval, roi_identifier: roiIdentifier },
    })
    return response.data
  },

  /** GET /datasets/{dataset_id}/traffic/aggregation/calculation-summary */
  async getCalculationSummary(datasetId, { aggregationInterval = 60, roiIdentifier = 'MAIN_ROI' } = {}) {
    const response = await apiClient.get(aggregationUrl(datasetId, '/calculation-summary'), {
      params: { aggregation_interval: aggregationInterval, roi_identifier: roiIdentifier },
    })
    return response.data
  },

  /** GET /datasets/{dataset_id}/traffic/aggregation/preview - paginated aggregated table. */
  async getAggregationPreview(
    datasetId,
    { aggregationInterval = 60, roiIdentifier = 'MAIN_ROI', startTime, endTime, page = 1, pageSize = 20 } = {}
  ) {
    const params = {
      aggregation_interval: aggregationInterval,
      roi_identifier: roiIdentifier,
      page,
      page_size: pageSize,
    }
    if (startTime) params.start_time = startTime
    if (endTime) params.end_time = endTime
    const response = await apiClient.get(aggregationUrl(datasetId, '/preview'), { params })
    return response.data
  },

  /** GET /datasets/{dataset_id}/traffic/aggregation/chart-data - 3 series for charts. */
  async getAggregationChartData(
    datasetId,
    { aggregationInterval = 60, roiIdentifier = 'MAIN_ROI', startTime, endTime } = {}
  ) {
    const params = { aggregation_interval: aggregationInterval, roi_identifier: roiIdentifier }
    if (startTime) params.start_time = startTime
    if (endTime) params.end_time = endTime
    const response = await apiClient.get(aggregationUrl(datasetId, '/chart-data'), { params })
    return response.data
  },

  // ---------------------------------------------------------- Feature Engineering
  /** POST /api/feature-engineering/training - prepare complete lag X and target Y samples. */
  async prepareTrainingFeatures(datasetVersionId, roiIdentifier = 'MAIN_ROI') {
    const response = await apiClient.post(
      '/feature-engineering/training',
      {
        dataset_version_id: datasetVersionId,
        roi_identifier: roiIdentifier,
      },
      { baseURL: FEATURE_API_BASE_URL }
    )
    return response.data
  },

  /** POST /api/feature-engineering/prediction - prepare latest lag X and forecast timestamps. */
  async preparePredictionFeatures(datasetVersionId, roiIdentifier = 'MAIN_ROI') {
    const response = await apiClient.post(
      '/feature-engineering/prediction',
      {
        dataset_version_id: datasetVersionId,
        roi_identifier: roiIdentifier,
      },
      { baseURL: FEATURE_API_BASE_URL }
    )
    return response.data
  },
}
