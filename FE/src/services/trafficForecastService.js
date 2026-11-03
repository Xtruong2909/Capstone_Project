import apiClient from './apiClient'

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
}
