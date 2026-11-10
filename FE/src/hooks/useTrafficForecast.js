import { useCallback, useEffect, useRef, useState } from 'react'
import { trafficForecastService } from '../services/trafficForecastService'
import { trainingFeatureState } from '../services/trainingFeatureState'
import { extractErrorMessage } from '../features/scientist/utils/formatters'

const JOB_POLL_INTERVAL_MS = 2000
const FINISHED_JOB_STATES = ['completed', 'failed']

/** Aggregation status (GET .../status) for a dataset + interval + ROI. */
export function useAggregationStatus(datasetId, { aggregationInterval, roiIdentifier }) {
  const [status, setStatus] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    if (!datasetId) return
    setIsLoading(true)
    setError(null)
    try {
      setStatus(
        await trafficForecastService.getAggregationStatus(datasetId, { aggregationInterval, roiIdentifier })
      )
    } catch (err) {
      setStatus(null)
      setError(extractErrorMessage(err, 'Failed to load aggregation status.'))
    } finally {
      setIsLoading(false)
    }
  }, [datasetId, aggregationInterval, roiIdentifier])

  useEffect(() => {
    reload()
  }, [reload])

  return { status, isLoading, error, reload }
}

/** Calculation summary (formulas / units) for the dataset. */
export function useCalculationSummary(datasetId, { aggregationInterval, roiIdentifier }) {
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!datasetId) return undefined
    let cancelled = false
    setError(null)
    trafficForecastService
      .getCalculationSummary(datasetId, { aggregationInterval, roiIdentifier })
      .then((data) => !cancelled && setSummary(data))
      .catch((err) => !cancelled && setError(extractErrorMessage(err, 'Failed to load calculation summary.')))
    return () => {
      cancelled = true
    }
  }, [datasetId, aggregationInterval, roiIdentifier])

  return { summary, error }
}

/** Start a background aggregation job and poll it until completed / failed. */
export function useAggregationJob(datasetId, onFinished) {
  const [job, setJob] = useState(null)
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState(null)
  const timerRef = useRef(null)
  const onFinishedRef = useRef(onFinished)
  onFinishedRef.current = onFinished

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => stopPolling, [stopPolling])

  const poll = useCallback(
    async (jobId) => {
      try {
        const current = await trafficForecastService.getAggregationJob(datasetId, jobId)
        setJob(current)
        if (FINISHED_JOB_STATES.includes(current.status)) {
          stopPolling()
          onFinishedRef.current?.(current)
          return
        }
      } catch (err) {
        setError(extractErrorMessage(err, 'Failed to poll aggregation job.'))
        stopPolling()
        return
      }
      timerRef.current = setTimeout(() => poll(jobId), JOB_POLL_INTERVAL_MS)
    },
    [datasetId, stopPolling]
  )

  const start = useCallback(
    async (options) => {
      stopPolling()
      setIsStarting(true)
      setError(null)
      setJob(null)
      try {
        const started = await trafficForecastService.startAggregation(datasetId, options)
        setJob({ ...started, progress_percent: 0, records_created: 0 })
        poll(started.job_id)
      } catch (err) {
        setError(extractErrorMessage(err, 'Failed to start aggregation job.'))
      } finally {
        setIsStarting(false)
      }
    },
    [datasetId, poll, stopPolling]
  )

  const isRunning = Boolean(job) && !FINISHED_JOB_STATES.includes(job.status)

  return { job, isStarting, isRunning, error, start }
}

/** Chart data + paginated aggregation preview for the prediction page. */
export function useAggregationExplorer(datasetId, { aggregationInterval, roiIdentifier, startTime, endTime, page, pageSize, refreshKey = 0 }) {
  const [chart, setChart] = useState(null)
  const [preview, setPreview] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!datasetId) return undefined
    let cancelled = false
    setIsLoading(true)
    setError(null)
    Promise.all([
      trafficForecastService.getAggregationChartData(datasetId, {
        aggregationInterval,
        roiIdentifier,
        startTime,
        endTime,
      }),
      trafficForecastService.getAggregationPreview(datasetId, {
        aggregationInterval,
        roiIdentifier,
        startTime,
        endTime,
        page,
        pageSize,
      }),
    ])
      .then(([chartData, previewData]) => {
        if (cancelled) return
        setChart(chartData)
        setPreview(previewData)
      })
      .catch((err) => {
        if (cancelled) return
        setChart(null)
        setPreview(null)
        setError(extractErrorMessage(err, 'Failed to load aggregated traffic data.'))
      })
      .finally(() => !cancelled && setIsLoading(false))
    return () => {
      cancelled = true
    }
  }, [datasetId, aggregationInterval, roiIdentifier, startTime, endTime, page, pageSize, reloadKey, refreshKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  return { chart, preview, isLoading, error, reload }
}

/**
 * One-click 1-minute vehicle aggregation flow for the Training page:
 * starts the 60s aggregation job, polls until completed, and loads chart data.
 */
export function useOneMinuteVehicleAggregation(datasetId) {
  const [chart, setChart] = useState(null)
  const [statusInfo, setStatusInfo] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isCalculating, setIsCalculating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const requestRef = useRef(0)

  useEffect(() => {
    const requestId = ++requestRef.current
    setChart(null)
    setStatusInfo(null)
    setIsLoading(Boolean(datasetId))
    setIsCalculating(false)
    setProgress(0)
    setError(null)

    const restoreResults = async () => {
      try {
        const options = { aggregationInterval: 60, roiIdentifier: 'MAIN_ROI' }
        const status = await trafficForecastService.getAggregationStatus(datasetId, options)
        if (requestId !== requestRef.current) return
        if (status.is_ready) {
          const savedChart = await trafficForecastService.getAggregationChartData(datasetId, options)
          if (requestId !== requestRef.current) return
          setChart(savedChart)
          setProgress(100)
        }
        setStatusInfo(status)
      } catch (err) {
        if (requestId !== requestRef.current) return
        setError(extractErrorMessage(err, 'Failed to load saved vehicle aggregation.'))
      } finally {
        if (requestId === requestRef.current) setIsLoading(false)
      }
    }

    if (datasetId) restoreResults()
    return () => {
      requestRef.current += 1
    }
  }, [datasetId])

  const aggregateOneMinute = useCallback(async () => {
    if (!datasetId) return
    const requestId = ++requestRef.current
    setIsLoading(false)
    setIsCalculating(true)
    setProgress(10)
    setError(null)

    try {
      const started = await trafficForecastService.startAggregation(datasetId, {
        aggregationInterval: 60,
        roiIdentifier: 'MAIN_ROI',
        replaceExisting: false,
      })

      if (requestId !== requestRef.current) return
      let currentJob = started
      while (!FINISHED_JOB_STATES.includes(currentJob.status)) {
        await new Promise((resolve) => setTimeout(resolve, 600))
        if (requestId !== requestRef.current) return
        currentJob = await trafficForecastService.getAggregationJob(datasetId, started.job_id)
        if (requestId !== requestRef.current) return
        setProgress(Math.max(25, currentJob.progress_percent ?? 50))
      }

      if (currentJob.status === 'failed') {
        throw new Error(currentJob.error_message || 'Aggregation job failed.')
      }

      setProgress(90)
      const [chartData, aggStatus] = await Promise.all([
        trafficForecastService.getAggregationChartData(datasetId, {
          aggregationInterval: 60,
          roiIdentifier: 'MAIN_ROI',
        }),
        trafficForecastService.getAggregationStatus(datasetId, {
          aggregationInterval: 60,
          roiIdentifier: 'MAIN_ROI',
        }),
      ])

      if (requestId !== requestRef.current) return
      setChart(chartData)
      setStatusInfo(aggStatus)
      setProgress(100)
    } catch (err) {
      if (requestId !== requestRef.current) return
      setError(extractErrorMessage(err, err?.message || 'Failed to aggregate vehicle counts.'))
    } finally {
      if (requestId === requestRef.current) setIsCalculating(false)
    }
  }, [datasetId])

  return {
    chart,
    statusInfo,
    isLoading,
    isCalculating,
    progress,
    error,
    aggregateOneMinute,
  }
}

/**
 * POST /api/feature-engineering/training hook for the Training page.
 * Automatically ensures 60s temporal aggregation exists if initial sample_count is 0.
 */
export function useTrainingFeatureEngineering(datasetId, versionId) {
  const [featureData, setFeatureData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [roiInput, setRoiInput] = useState('MAIN_ROI')
  const requestRef = useRef(0)

  useEffect(() => {
    const requestId = ++requestRef.current
    const savedRoi = trainingFeatureState.read(datasetId, versionId)
    setFeatureData(null)
    setRoiInput(savedRoi || 'MAIN_ROI')
    setIsLoading(Boolean(savedRoi))
    setError(null)
    if (savedRoi) {
      trafficForecastService.prepareTrainingFeatures(versionId, savedRoi)
        .then((data) => {
          if (requestId === requestRef.current) setFeatureData(data)
        })
        .catch((err) => {
          if (requestId === requestRef.current) {
            setError(extractErrorMessage(err, 'Failed to restore training features. Please retry.'))
          }
        })
        .finally(() => {
          if (requestId === requestRef.current) setIsLoading(false)
        })
    }
    return () => { requestRef.current += 1 }
  }, [datasetId, versionId])

  const generateTrainingFeatures = useCallback(
    async (roiIdentifier = 'MAIN_ROI') => {
      if (!versionId) return null
      const requestId = ++requestRef.current
      setIsLoading(true)
      setError(null)

      try {
        let data = await trafficForecastService.prepareTrainingFeatures(versionId, roiIdentifier)
        if (requestId !== requestRef.current) return null

        // If no samples were returned because 60s aggregation hasn't been generated yet,
        // automatically run the 60s aggregation job and re-fetch training features.
        if (data.sample_count === 0 && datasetId) {
          const status = await trafficForecastService.getAggregationStatus(datasetId, {
            aggregationInterval: 60,
            roiIdentifier,
          })
          if (requestId !== requestRef.current) return null
          if (!status?.is_ready) {
            const started = await trafficForecastService.startAggregation(datasetId, {
              aggregationInterval: 60,
              roiIdentifier,
              replaceExisting: false,
            })
            if (requestId !== requestRef.current) return null
            let currentJob = started
            while (!FINISHED_JOB_STATES.includes(currentJob.status)) {
              await new Promise((resolve) => setTimeout(resolve, 600))
              if (requestId !== requestRef.current) return null
              currentJob = await trafficForecastService.getAggregationJob(datasetId, started.job_id)
              if (requestId !== requestRef.current) return null
            }
            if (currentJob.status === 'failed') {
              throw new Error(currentJob.error_message || 'Aggregation job failed.')
            }
            if (currentJob.status === 'completed') {
              data = await trafficForecastService.prepareTrainingFeatures(versionId, roiIdentifier)
            }
          }
        }

        if (requestId !== requestRef.current) return null
        trainingFeatureState.save(datasetId, versionId, roiIdentifier)
        setRoiInput(roiIdentifier)
        setFeatureData(data)
        return data
      } catch (err) {
        if (requestId !== requestRef.current) return null
        setError(extractErrorMessage(err, 'Failed to extract training features.'))
        return null
      } finally {
        if (requestId === requestRef.current) setIsLoading(false)
      }
    },
    [datasetId, versionId]
  )

  return {
    featureData,
    roiInput,
    setRoiInput,
    isLoading,
    error,
    generateTrainingFeatures,
  }
}

/**
 * POST /api/train-test-split/training hook for Step 2 (70/30 Chronological Split).
 */
export function useTrainTestSplit(datasetId, versionId) {
  const [splitData, setSplitData] = useState(() =>
    trainingFeatureState.readSplit(datasetId, versionId)
  )
  const [isSplitting, setIsSplitting] = useState(false)
  const [splitError, setSplitError] = useState(null)
  const requestRef = useRef(0)

  useEffect(() => {
    requestRef.current += 1
    setSplitData(trainingFeatureState.readSplit(datasetId, versionId))
    setIsSplitting(false)
    setSplitError(null)
  }, [datasetId, versionId])

  const runTrainTestSplit = useCallback(
    async (featureResponse, { trainRatio = 0.7, splitStrategy = 'chronological' } = {}) => {
      if (!featureResponse?.samples?.length) {
        setSplitError('Chưa có dữ liệu mẫu Lag Features (X/Y) từ Bước 1 để chia Train/Test.')
        return null
      }
      const requestId = ++requestRef.current
      setIsSplitting(true)
      setSplitError(null)
      try {
        const result = await trafficForecastService.splitTrainingData(featureResponse, {
          trainRatio,
          splitStrategy,
        })
        if (requestId !== requestRef.current) return null
        setSplitData(result)
        trainingFeatureState.saveSplit(datasetId, versionId, result)
        return result
      } catch (err) {
        if (requestId !== requestRef.current) return null
        setSplitError(
          extractErrorMessage(err, 'Không thể chia dữ liệu Train/Test 70/30. Vui lòng thử lại.')
        )
        return null
      } finally {
        if (requestId === requestRef.current) setIsSplitting(false)
      }
    },
    [datasetId, versionId]
  )

  return {
    splitData,
    setSplitData,
    isSplitting,
    splitError,
    setSplitError,
    runTrainTestSplit,
  }
}

/**
 * Hook for Step 3, Step 4, and Step 5:
 * - POST /api/model-training/experiment
 * - GET  /api/model-training/experiments
 * - GET  /api/model-training/experiments/{experiment_id}
 * - POST /api/model-training/experiments/compare
 */
export function useModelTrainingExperiments(versionId) {
  const [experiments, setExperiments] = useState([])
  const [isLoadingList, setIsLoadingList] = useState(false)
  const [listError, setListError] = useState(null)

  const [latestExperiment, setLatestExperiment] = useState(null)
  const [isTraining, setIsTraining] = useState(false)
  const [trainError, setTrainError] = useState(null)

  const [selectedExperiment, setSelectedExperiment] = useState(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState(null)

  const [comparisonData, setComparisonData] = useState(null)
  const [isComparing, setIsComparing] = useState(false)
  const [compareError, setCompareError] = useState(null)

  const listReqRef = useRef(0)
  const detailReqRef = useRef(0)

  const reloadExperiments = useCallback(async () => {
    if (!versionId) return []
    const reqId = ++listReqRef.current
    setIsLoadingList(true)
    setListError(null)
    try {
      const data = await trafficForecastService.listTrainingExperiments({
        datasetVersionId: versionId,
        skip: 0,
        limit: 100,
      })
      if (reqId !== listReqRef.current) return []
      const items = Array.isArray(data) ? data : []
      setExperiments(items)
      return items
    } catch (err) {
      if (reqId !== listReqRef.current) return []
      setListError(extractErrorMessage(err, 'Không thể tải danh sách thí nghiệm.'))
      return []
    } finally {
      if (reqId === listReqRef.current) setIsLoadingList(false)
    }
  }, [versionId])

  useEffect(() => {
    setExperiments([])
    setLatestExperiment(null)
    setTrainError(null)
    setSelectedExperiment(null)
    setDetailError(null)
    setComparisonData(null)
    setCompareError(null)
    if (versionId) {
      reloadExperiments()
    }
  }, [versionId, reloadExperiments])

  const runExperiment = useCallback(
    async (params) => {
      setIsTraining(true)
      setTrainError(null)
      try {
        const created = await trafficForecastService.createTrainingExperiment(params)
        setLatestExperiment(created)
        // Refresh the experiment list so the new Ex-00N appears immediately
        await reloadExperiments()
        return created
      } catch (err) {
        setTrainError(
          extractErrorMessage(err, 'Huấn luyện mô hình thất bại. Vui lòng kiểm tra cấu hình.')
        )
        return null
      } finally {
        setIsTraining(false)
      }
    },
    [reloadExperiments]
  )

  const loadExperimentDetail = useCallback(async (experimentId) => {
    if (!experimentId) return null
    const reqId = ++detailReqRef.current
    setIsLoadingDetail(true)
    setDetailError(null)
    try {
      const detail = await trafficForecastService.getTrainingExperimentDetail(experimentId)
      if (reqId !== detailReqRef.current) return null
      setSelectedExperiment(detail)
      return detail
    } catch (err) {
      if (reqId !== detailReqRef.current) return null
      setDetailError(extractErrorMessage(err, 'Không thể tải chi tiết thí nghiệm.'))
      return null
    } finally {
      if (reqId === detailReqRef.current) setIsLoadingDetail(false)
    }
  }, [])

  const compareExperiments = useCallback(async (experimentIds) => {
    if (!Array.isArray(experimentIds) || experimentIds.length < 2) {
      setCompareError('Vui lòng chọn ít nhất 2 thí nghiệm COMPLETED để so sánh.')
      return null
    }
    setIsComparing(true)
    setCompareError(null)
    try {
      const data = await trafficForecastService.compareTrainingExperiments(experimentIds)
      setComparisonData(data)
      return data
    } catch (err) {
      setCompareError(
        extractErrorMessage(
          err,
          'Không thể so sánh các thí nghiệm đã chọn. Hãy đảm bảo cùng Split ID và chế độ đánh giá.'
        )
      )
      return null
    } finally {
      setIsComparing(false)
    }
  }, [])

  return {
    experiments,
    isLoadingList,
    listError,
    reloadExperiments,
    latestExperiment,
    setLatestExperiment,
    isTraining,
    trainError,
    setTrainError,
    runExperiment,
    selectedExperiment,
    setSelectedExperiment,
    isLoadingDetail,
    detailError,
    loadExperimentDetail,
    comparisonData,
    setComparisonData,
    isComparing,
    compareError,
    setCompareError,
    compareExperiments,
  }
}

/**
 * POST /api/feature-engineering/prediction hook for the Prediction page.
 * Extracts the latest 5 continuous lag features (X) and target forecast timestamps (+1, +3, +5 min).
 */
export function usePredictionFeatureEngineering(datasetId, versionId) {
  const [featureData, setFeatureData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [roiInput, setRoiInput] = useState('MAIN_ROI')
  const requestRef = useRef(0)

  useEffect(() => {
    const requestId = ++requestRef.current
    const savedRoi = trainingFeatureState.readPredictionRoi(datasetId, versionId)
    setFeatureData(null)
    setRoiInput(savedRoi || 'MAIN_ROI')
    setIsLoading(Boolean(savedRoi))
    setError(null)
    if (savedRoi && versionId) {
      trafficForecastService
        .preparePredictionFeatures(versionId, savedRoi)
        .then((data) => {
          if (requestId === requestRef.current) setFeatureData(data)
        })
        .catch((err) => {
          if (requestId === requestRef.current) {
            setError(
              extractErrorMessage(
                err,
                'Không thể khôi phục đặc trưng dự báo. Vui lòng nhấn Tạo Đặc trưng Dự báo.'
              )
            )
          }
        })
        .finally(() => {
          if (requestId === requestRef.current) setIsLoading(false)
        })
    }
    return () => {
      requestRef.current += 1
    }
  }, [datasetId, versionId])

  const generatePredictionFeatures = useCallback(
    async (roiIdentifier = 'MAIN_ROI') => {
      if (!versionId) return null
      const requestId = ++requestRef.current
      setIsLoading(true)
      setError(null)

      try {
        let data
        try {
          data = await trafficForecastService.preparePredictionFeatures(versionId, roiIdentifier)
        } catch (initialErr) {
          // If 60s aggregation hasn't been generated yet, automatically run aggregation and retry
          if (datasetId) {
            const status = await trafficForecastService.getAggregationStatus(datasetId, {
              aggregationInterval: 60,
              roiIdentifier,
            })
            if (requestId !== requestRef.current) return null
            if (!status?.is_ready) {
              const started = await trafficForecastService.startAggregation(datasetId, {
                aggregationInterval: 60,
                roiIdentifier,
                replaceExisting: false,
              })
              if (requestId !== requestRef.current) return null
              let currentJob = started
              while (!FINISHED_JOB_STATES.includes(currentJob.status)) {
                await new Promise((resolve) => setTimeout(resolve, 600))
                if (requestId !== requestRef.current) return null
                currentJob = await trafficForecastService.getAggregationJob(
                  datasetId,
                  started.job_id
                )
                if (requestId !== requestRef.current) return null
              }
              if (currentJob.status === 'failed') {
                throw new Error(currentJob.error_message || 'Aggregation job failed.')
              }
              if (currentJob.status === 'completed') {
                data = await trafficForecastService.preparePredictionFeatures(
                  versionId,
                  roiIdentifier
                )
              }
            } else {
              throw initialErr
            }
          } else {
            throw initialErr
          }
        }

        if (requestId !== requestRef.current) return null
        trainingFeatureState.savePredictionRoi(datasetId, versionId, roiIdentifier)
        setRoiInput(roiIdentifier)
        setFeatureData(data)
        return data
      } catch (err) {
        if (requestId !== requestRef.current) return null
        setError(
          extractErrorMessage(
            err,
            'Không thể trích xuất 5 đặc trưng trễ cho dự báo. Hãy đảm bảo chuỗi quan sát mới nhất liên tục.'
          )
        )
        return null
      } finally {
        if (requestId === requestRef.current) setIsLoading(false)
      }
    },
    [datasetId, versionId]
  )

  return {
    featureData,
    roiInput,
    setRoiInput,
    isLoading,
    error,
    generatePredictionFeatures,
  }
}

/**
 * POST /api/model-training/predict hook for forecasting +1, +3, +5 minutes.
 */
export function useTrafficPrediction(datasetId, versionId) {
  const [forecastData, setForecastData] = useState(() =>
    trainingFeatureState.readForecast(datasetId, versionId)
  )
  const [isPredicting, setIsPredicting] = useState(false)
  const [predictError, setPredictError] = useState(null)
  const [predictErrorCode, setPredictErrorCode] = useState(null)
  const requestRef = useRef(0)

  useEffect(() => {
    requestRef.current += 1
    setForecastData(trainingFeatureState.readForecast(datasetId, versionId))
    setIsPredicting(false)
    setPredictError(null)
    setPredictErrorCode(null)
  }, [datasetId, versionId])

  const runTrafficPrediction = useCallback(
    async ({ datasetVersionId, splitId, experimentId } = {}) => {
      const targetVersionId = datasetVersionId || versionId
      if (!targetVersionId && !experimentId) {
        setPredictError('Cần cung cấp dataset_version_id hoặc experiment_id để dự báo.')
        return null
      }
      const requestId = ++requestRef.current
      setIsPredicting(true)
      setPredictError(null)
      setPredictErrorCode(null)
      try {
        const result = await trafficForecastService.predictTrafficFlow({
          datasetVersionId: targetVersionId,
          splitId: splitId || undefined,
          experimentId: experimentId || undefined,
        })
        if (requestId !== requestRef.current) return null
        setForecastData(result)
        trainingFeatureState.saveForecast(datasetId, versionId, result)
        return result
      } catch (err) {
        if (requestId !== requestRef.current) return null
        const detail = err?.response?.data?.detail
        const code = typeof detail === 'object' && detail !== null ? detail.code || null : null
        setPredictErrorCode(code)
        setPredictError(
          extractErrorMessage(
            err,
            'Không thể thực hiện dự báo lưu lượng giao thông (+1, +3, +5 phút).'
          )
        )
        return null
      } finally {
        if (requestId === requestRef.current) setIsPredicting(false)
      }
    },
    [datasetId, versionId]
  )

  return {
    forecastData,
    setForecastData,
    isPredicting,
    predictError,
    predictErrorCode,
    setPredictError,
    runTrafficPrediction,
  }
}

/**
 * POST /api/ai/assistant hook for the floating Gemini AI Assistant chat box.
 */
export function useAiAssistant(defaultVersionId) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      action: 'CHAT',
      timestamp: new Date().toISOString(),
      result: {
        message:
          'Xin chào! Tôi là Trợ lý AI phân tích dữ liệu và dự báo giao thông đô thị (UAV / pNEUMA). Bạn có thể hỏi kiến thức về Lag Features, chia Train/Test, Random Forest, MAE/RMSE hoặc chọn các tác vụ Phân tích / Đề xuất / So sánh thí nghiệm bên dưới.',
      },
    },
  ])
  const [isSending, setIsSending] = useState(false)
  const [assistantError, setAssistantError] = useState(null)

  const sendRequest = useCallback(
    async ({
      action = 'CHAT',
      message,
      experimentIds,
      predictionId,
      modelId,
      datasetVersionId,
      userDisplayLabel,
    } = {}) => {
      const userText =
        userDisplayLabel ||
        message ||
        {
          EXPERIMENT_ANALYSIS: 'Phân tích kết quả thí nghiệm đã chọn',
          MODEL_RECOMMENDATION: 'Gợi ý cấu hình Random Forest tối ưu',
          EXPERIMENT_COMPARISON: 'So sánh hiệu năng các thí nghiệm đã chọn',
          FORECAST_EXPLANATION: `Giải thích kết quả dự báo #${predictionId || ''}`,
          CHAT: 'Câu hỏi cho Trợ lý AI',
        }[action]

      const userMsg = {
        id: `user-${Date.now()}`,
        role: 'user',
        action,
        timestamp: new Date().toISOString(),
        text: userText,
      }
      setMessages((prev) => [...prev, userMsg])
      setIsSending(true)
      setAssistantError(null)

      try {
        const res = await trafficForecastService.askAiAssistant({
          action,
          message,
          experimentIds,
          predictionId,
          modelId,
          datasetVersionId: datasetVersionId ?? defaultVersionId,
        })
        const aiMsg = {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          action: res.action || action,
          timestamp: new Date().toISOString(),
          result: res.result || {},
        }
        setMessages((prev) => [...prev, aiMsg])
        return res
      } catch (err) {
        const errText = extractErrorMessage(
          err,
          'Không thể kết nối với Trợ lý AI Gemini. Vui lòng thử lại.'
        )
        setAssistantError(errText)
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            action,
            isError: true,
            timestamp: new Date().toISOString(),
            result: { message: errText },
          },
        ])
        return null
      } finally {
        setIsSending(false)
      }
    },
    [defaultVersionId]
  )

  const clearMessages = useCallback(() => {
    setAssistantError(null)
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        action: 'CHAT',
        timestamp: new Date().toISOString(),
        result: {
          message:
            'Đã làm mới cuộc trò chuyện. Bạn cần hỗ trợ phân tích dữ liệu, thí nghiệm hay dự báo lưu lượng giao thông?',
        },
      },
    ])
  }, [])

  return {
    messages,
    isSending,
    assistantError,
    sendRequest,
    clearMessages,
  }
}



