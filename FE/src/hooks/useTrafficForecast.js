import { useCallback, useEffect, useRef, useState } from 'react'
import { trafficForecastService } from '../services/trafficForecastService'
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
  const [isCalculating, setIsCalculating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)

  useEffect(() => {
    setChart(null)
    setStatusInfo(null)
    setIsCalculating(false)
    setProgress(0)
    setError(null)
  }, [datasetId])

  const aggregateOneMinute = useCallback(async () => {
    if (!datasetId) return
    setIsCalculating(true)
    setProgress(10)
    setError(null)

    try {
      const started = await trafficForecastService.startAggregation(datasetId, {
        aggregationInterval: 60,
        roiIdentifier: 'MAIN_ROI',
        replaceExisting: false,
      })

      let currentJob = started
      while (!FINISHED_JOB_STATES.includes(currentJob.status)) {
        await new Promise((resolve) => setTimeout(resolve, 600))
        currentJob = await trafficForecastService.getAggregationJob(datasetId, started.job_id)
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

      setChart(chartData)
      setStatusInfo(aggStatus)
      setProgress(100)
    } catch (err) {
      setError(extractErrorMessage(err, err?.message || 'Không thể tổng hợp dữ liệu phương tiện.'))
    } finally {
      setIsCalculating(false)
    }
  }, [datasetId])

  return {
    chart,
    statusInfo,
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
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setFeatureData(null)
    setIsLoading(false)
    setError(null)
  }, [datasetId, versionId])

  const generateTrainingFeatures = useCallback(
    async (roiIdentifier = 'MAIN_ROI') => {
      if (!versionId) return null
      setIsLoading(true)
      setError(null)

      try {
        let data = await trafficForecastService.prepareTrainingFeatures(versionId, roiIdentifier)

        // If no samples were returned because 60s aggregation hasn't been generated yet,
        // automatically run the 60s aggregation job and re-fetch training features.
        if (data.sample_count === 0 && datasetId) {
          const status = await trafficForecastService.getAggregationStatus(datasetId, {
            aggregationInterval: 60,
            roiIdentifier,
          })
          if (!status?.is_ready) {
            const started = await trafficForecastService.startAggregation(datasetId, {
              aggregationInterval: 60,
              roiIdentifier,
              replaceExisting: false,
            })
            let currentJob = started
            while (!FINISHED_JOB_STATES.includes(currentJob.status)) {
              await new Promise((resolve) => setTimeout(resolve, 600))
              currentJob = await trafficForecastService.getAggregationJob(datasetId, started.job_id)
            }
            if (currentJob.status === 'completed') {
              data = await trafficForecastService.prepareTrainingFeatures(versionId, roiIdentifier)
            }
          }
        }

        setFeatureData(data)
        return data
      } catch (err) {
        setError(extractErrorMessage(err, 'Không thể trích xuất đặc trưng huấn luyện (Training Features).'))
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [datasetId, versionId]
  )

  return {
    featureData,
    isLoading,
    error,
    generateTrainingFeatures,
  }
}


