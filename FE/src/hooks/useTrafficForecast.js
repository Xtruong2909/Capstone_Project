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

