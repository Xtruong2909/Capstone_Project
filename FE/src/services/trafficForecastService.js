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

  // ---------------------------------------------------------- Train / Test Split
  /**
   * POST /api/train-test-split/training
   * Forwards the Feature Engineering response directly to split 70/30 chronologically.
   */
  async splitTrainingData(
    featureResponse,
    { trainRatio = 0.7, splitStrategy = 'chronological' } = {}
  ) {
    const payload = {
      dataset_version_id: featureResponse.dataset_version_id,
      roi_identifier: featureResponse.roi_identifier || 'MAIN_ROI',
      configuration: featureResponse.configuration,
      sample_count: featureResponse.sample_count ?? featureResponse.samples?.length,
      train_ratio: trainRatio,
      split_strategy: splitStrategy,
      feature_order: featureResponse.feature_order || [
        'lag_1',
        'lag_2',
        'lag_3',
        'lag_4',
        'lag_5',
      ],
      target_order: featureResponse.target_order || [
        'target_h1',
        'target_h3',
        'target_h5',
      ],
      samples: featureResponse.samples || [],
    }
    if (featureResponse.recording_session_id) {
      payload.recording_session_id = featureResponse.recording_session_id
    }
    const response = await apiClient.post('/train-test-split/training', payload, {
      baseURL: FEATURE_API_BASE_URL,
    })
    return response.data
  },

  // ---------------------------------------------------------- Model Training & Experiments
  /**
   * POST /api/model-training/experiment
   * Sends split_id and Random Forest parameters via query parameters.
   */
  async createTrainingExperiment({
    splitId,
    nEstimators = 100,
    maxDepth = 10,
    minSamplesSplit = 2,
    minSamplesLeaf = 1,
    maxFeatures = '1.0',
    bootstrap = true,
    randomState = 42,
    evaluationMode = 'exploratory',
  }) {
    const params = {
      split_id: splitId,
      n_estimators: Number(nEstimators),
      max_depth: Number(maxDepth),
      min_samples_split: Number(minSamplesSplit),
      min_samples_leaf: Number(minSamplesLeaf),
      max_features: String(maxFeatures).trim(),
      bootstrap: Boolean(bootstrap),
      random_state: Number(randomState),
      evaluation_mode: evaluationMode,
    }
    const response = await apiClient.post('/model-training/experiment', null, {
      baseURL: FEATURE_API_BASE_URL,
      params,
    })
    return response.data
  },

  /**
   * GET /api/model-training/experiments
   * Lists persisted training experiments, optionally filtered by dataset_version_id.
   */
  async listTrainingExperiments({ datasetVersionId, skip = 0, limit = 100 } = {}) {
    const params = { skip, limit }
    if (datasetVersionId) {
      params.dataset_version_id = datasetVersionId
    }
    const response = await apiClient.get('/model-training/experiments', {
      baseURL: FEATURE_API_BASE_URL,
      params,
    })
    return response.data
  },

  /**
   * GET /api/model-training/experiments/{experiment_id}
   * Fetches full detail and 3 result tables for a single experiment.
   */
  async getTrainingExperimentDetail(experimentId) {
    const response = await apiClient.get(`/model-training/experiments/${experimentId}`, {
      baseURL: FEATURE_API_BASE_URL,
    })
    return response.data
  },

  /**
   * POST /api/model-training/experiments/compare
   * Compares 2 to 20 completed experiments sharing the same dataset version, split, and evaluation rules.
   */
  async compareTrainingExperiments(experimentIds) {
    const response = await apiClient.post(
      '/model-training/experiments/compare',
      { experiment_ids: experimentIds },
      { baseURL: FEATURE_API_BASE_URL }
    )
    return response.data
  },
}
