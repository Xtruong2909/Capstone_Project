import { useCallback, useEffect, useRef, useState } from 'react'
import { getScientistSession, scientistWorkflowKey, readScientistWorkflow, writeScientistWorkflow } from '../services/scientistSession'
import { dataScienceService } from '../services/dataScienceService'
import { extractErrorMessage } from '../features/scientist/utils/formatters'
import { experimentConfiguration, resolveExperimentPreset } from '../features/scientist/utils/experimentPreset'

export function useScienceTraining(groupId) {
  const storageKey = scientistWorkflowKey(groupId)
  const storedWorkflow = readScientistWorkflow(storageKey)
  const hasStoredWorkflow = Boolean(storedWorkflow.aggregation)
  const [workflow, setWorkflow] = useState({})
  const [loadedGroupId, setLoadedGroupId] = useState(null)
  const [workflowRefreshKey, setWorkflowRefreshKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [startingAggregation, setStartingAggregation] = useState(false)
  const [dismissedAggregationId, setDismissedAggregationId] = useState(null)
  const aggregationPending = useRef(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const visibleWorkflow = loadedGroupId === groupId || !hasStoredWorkflow
    ? workflow
    : storedWorkflow
  const aggregationId = visibleWorkflow.aggregation?.aggregation_id
  const aggregationProgressHidden = !startingAggregation && Boolean(aggregationId) && dismissedAggregationId === aggregationId
  const dismissAggregationProgress = () => {
    if (!startingAggregation && ['COMPLETED', 'PARTIAL_SUCCESS', 'FAILED'].includes(visibleWorkflow.aggregation?.status)) {
      setDismissedAggregationId(aggregationId)
    }
  }
  useEffect(() => {
    if (!groupId || !storageKey) return
    let cancelled = false
    setLoadError('')
    const cached = readScientistWorkflow(storageKey)
    const hasCachedWorkflow = Boolean(cached.aggregation)
    if (hasCachedWorkflow) {
      setWorkflow(cached)
      setLoadedGroupId(groupId)
    } else {
      setWorkflow({})
      setLoadedGroupId(null)
    }
    async function restoreWorkflow() {
      const aggregation = await dataScienceService.getLatestAggregation(groupId)
      const features = aggregation?.status === 'COMPLETED'
        ? await dataScienceService.getLatestFeatures(aggregation.aggregation_id) : null
      let split = features?.status === 'COMPLETED'
        ? await dataScienceService.getLatestSplit(features.feature_generation_id) : null
      if (cancelled) return
      if (split?.train_ratio_requested === 0.7) {
        split = await dataScienceService.createSplit(features.feature_generation_id)
        if (cancelled) return
      }
      const experiment = split?.split_id === cached.split?.split_id ? cached.experiment : null
      const next = { aggregation, features, split, experiment }
      setWorkflow(next)
      writeScientistWorkflow(storageKey, next)
    }
    restoreWorkflow()
      .catch((err) => { if (!cancelled) { setWorkflow({}); writeScientistWorkflow(storageKey, {}); setLoadError(extractErrorMessage(err, 'Không tải được kết quả huấn luyện đã lưu.')) } })
      .finally(() => { if (!cancelled) setLoadedGroupId(groupId) })
    return () => { cancelled = true }
  }, [groupId, storageKey, workflowRefreshKey])
  const save = useCallback((changes) => {
    setWorkflow((current) => {
      const next = { ...current, ...changes }
      writeScientistWorkflow(storageKey, next)
      return next
    })
  }, [storageKey])
  const run = useCallback(async (operation) => {
    setBusy(true); setError('')
    try { await operation() }
    catch (err) { setError(extractErrorMessage(err, 'Thao tác không thành công.')) }
    finally { setBusy(false) }
  }, [])
  const startAggregation = async () => {
    if (aggregationPending.current) return
    aggregationPending.current = true
    setDismissedAggregationId(null)
    setStartingAggregation(true)
    try {
      await run(async () => {
        const result = await dataScienceService.startAggregation(groupId)
        save({ aggregation: result, features: null, split: null, experiment: null })
      })
    } finally {
      aggregationPending.current = false
      setStartingAggregation(false)
    }
  }
  const refreshAggregation = useCallback(async () => {
    if (!aggregationId) return
    try { save({ aggregation: await dataScienceService.getAggregation(aggregationId) }) }
    catch (err) { setError(extractErrorMessage(err, 'Không kiểm tra được tổng hợp.')) }
  }, [aggregationId, save])
  useEffect(() => {
    if (!aggregationId || !['PROCESSING', 'PENDING', 'QUEUED', 'RUNNING'].includes(visibleWorkflow.aggregation?.status)) return
    const timer = setInterval(refreshAggregation, 3000)
    return () => clearInterval(timer)
  }, [aggregationId, visibleWorkflow.aggregation?.status, refreshAggregation])
  const generateFeatures = () => run(async () => {
    const result = await dataScienceService.generateFeatures(workflow.aggregation.aggregation_id)
    save({ features: result, split: null, experiment: null })
  })
  const refreshFeatures = () => run(async () => save({ features: await dataScienceService.getFeatures(workflow.features.feature_generation_id) }))
  const createSplit = () => run(async () => {
    const result = await dataScienceService.createSplit(workflow.features.feature_generation_id)
    save({ split: result, experiment: null })
  })
  return {
    workflow: visibleWorkflow, busy, startingAggregation, aggregationProgressHidden, dismissAggregationProgress, error, loadError,
    isLoadingWorkflow: Boolean(groupId) && loadedGroupId !== groupId && !hasStoredWorkflow,
    reloadWorkflow: () => setWorkflowRefreshKey((value) => value + 1),
    startAggregation, refreshAggregation, generateFeatures, refreshFeatures, createSplit,
  }
}

export function useExperimentSetup(splitId, groupId, initialPreset = null) {
  const session = getScientistSession()
  const storageKey = scientistWorkflowKey(groupId)
  const [split, setSplit] = useState(null)
  const [configuration, setConfiguration] = useState(() => experimentConfiguration(initialPreset?.hyperparameters))
  const [validationPreset, setValidationPreset] = useState(null)
  const pending = useRef(false)
  const presetKey = JSON.stringify(initialPreset)
  const [loading, setLoading] = useState(Boolean(splitId))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!splitId) return
    let cancelled = false
    setLoading(true)
    setSplit(null)
    setValidationPreset(null)
    setError('')
    dataScienceService.getSplit(splitId)
      .then(async (data) => {
        if (cancelled) return
        const corrected = data.split_strategy === 'DAY_BASED' && data.train_ratio_requested === 0.75
          ? data : await dataScienceService.createSplit(data.feature_generation_id)
        if (cancelled) return
        const incoming = JSON.parse(presetKey)
        const preset = resolveExperimentPreset(incoming, corrected.feature_generation_id)
        setConfiguration(experimentConfiguration(preset?.hyperparameters))
        setValidationPreset(preset)
        setSplit(corrected)
      })
      .catch((err) => { if (!cancelled) setError(extractErrorMessage(err, 'Không tải được cấu hình Train/Test.')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [splitId, groupId, presetKey])

  const updateConfiguration = (name, value) => {
    setConfiguration((current) => ({ ...current, [name]: value }))
  }

  const createExperiment = async () => {
    if (pending.current || loading || !split) return null
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const hyperparameters = {
        n_estimators: Number(configuration.n_estimators),
        max_depth: configuration.max_depth === '' ? null : Number(configuration.max_depth),
        min_samples_split: Number(configuration.min_samples_split),
        min_samples_leaf: Number(configuration.min_samples_leaf),
        bootstrap: configuration.bootstrap,
        random_state: Number(configuration.random_state),
      }
      if (configuration.max_features !== 'all') {
        hyperparameters.max_features = ['sqrt', 'log2'].includes(configuration.max_features)
          ? configuration.max_features : Number(configuration.max_features)
      }
      if (!split || split.split_strategy !== 'DAY_BASED' || split.train_ratio_requested !== 0.75) {
        throw new Error('Chưa có tập Train/Test 75/25 theo ngày. Hãy tải lại trang.')
      }
      const result = await dataScienceService.createExperiment(split.split_id, hyperparameters)
      session.experiments = null
      if (groupId) {
        try {
          const saved = readScientistWorkflow(storageKey)
          if (saved.split?.split_id === splitId) {
            const experiment = {
              experiment_id: result.experiment_id,
              experiment_name: result.experiment_name,
              status: result.status,
            }
            writeScientistWorkflow(storageKey, { ...saved, experiment })
          }
        } catch { /* A stale browser cache must not hide the completed experiment. */ }
      }
      return result
    } catch (err) {
      setError(extractErrorMessage(err, 'Không tạo được thí nghiệm.'))
      return null
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return { split, configuration, validationPreset, updateConfiguration, loading, busy, error, createExperiment }
}

export function useAggregationResults(aggregationId, enabled, initialSessionId = '') {
  const [sessionId, setSessionId] = useState(initialSessionId)
  const [refreshKey, setRefreshKey] = useState(0)
  const [result, setResult] = useState(null)
  const [loadedKey, setLoadedKey] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const requestKey = enabled && aggregationId && sessionId ? `${aggregationId}:${sessionId}:${refreshKey}` : null

  useEffect(() => {
    if (!requestKey) return
    let cancelled = false
    setIsLoading(true)
    setError('')

    async function loadSession() {
      const rows = []
      let firstPage = null
      let page = 1

      while (!cancelled) {
        const response = await dataScienceService.getAggregation(aggregationId, page, 100, sessionId)
        if (cancelled) return
        firstPage ??= response
        rows.push(...(response.data || []))
        if (page >= Math.max(1, response.total_pages || 1) || !response.data?.length) break
        page += 1
      }

      if (!cancelled) {
        setResult({ ...firstPage, data: rows })
        setLoadedKey(requestKey)
      }
    }

    loadSession()
      .catch((err) => { if (!cancelled) { setError(extractErrorMessage(err, 'Không tải được bảng dữ liệu theo phút.')); setLoadedKey(requestKey) } })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [aggregationId, requestKey, sessionId])

  return {
    result: loadedKey === requestKey ? result : null,
    sessionId, setSessionId,
    isLoading: Boolean(requestKey) && (isLoading || loadedKey !== requestKey),
    error: loadedKey === requestKey ? error : '',
    reload: () => setRefreshKey((value) => value + 1),
  }
}

export function useAggregationChartResults(aggregationId, sessionId) {
  const [result, setResult] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!aggregationId || !sessionId) return
    let cancelled = false
    setIsLoading(true)
    setError('')
    setResult(null)

    async function loadCharts() {
      const rows = []
      let firstPage = null
      let page = 1
      while (!cancelled) {
        const response = await dataScienceService.getAggregation(aggregationId, page, 100, sessionId)
        if (cancelled) return
        firstPage ??= response
        rows.push(...(response.data || []))
        if (page >= Math.max(1, response.total_pages || 1) || !response.data?.length) break
        page += 1
      }
      if (!cancelled) setResult({ ...firstPage, data: rows })
    }

    loadCharts()
      .catch((err) => { if (!cancelled) setError(extractErrorMessage(err, 'Không tải được dữ liệu biểu đồ.')) })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [aggregationId, sessionId, refreshKey])

  return { result, isLoading, error, reload: () => setRefreshKey((value) => value + 1) }
}

export function useFeaturePreview(featureGenerationId, enabled) {
  const [page, setPage] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)
  const [result, setResult] = useState(null)
  const [loadedKey, setLoadedKey] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const pageCacheRef = useRef(new Map())
  const requestKey = enabled && featureGenerationId ? `${featureGenerationId}:${page}:${refreshKey}` : null

  useEffect(() => { setPage(1) }, [featureGenerationId])
  useEffect(() => {
    if (!requestKey) return
    let cancelled = false

    const cachedResult = pageCacheRef.current.get(requestKey)
    if (cachedResult) {
      setResult(cachedResult)
      setLoadedKey(requestKey)
      setIsLoading(false)
      setError('')
      return () => { cancelled = true }
    }

    setIsLoading(true)
    setError('')
    dataScienceService.getFeaturePreview(featureGenerationId, page, { daysPerPage: 2 })
      .then((data) => {
        if (cancelled) return
        pageCacheRef.current.set(requestKey, data)
        setResult(data)
        setLoadedKey(requestKey)

        const totalPages = Math.max(1, data?.total_pages || 1)
        const nearbyPages = [page - 1, page + 1].filter((nearbyPage) => nearbyPage >= 1 && nearbyPage <= totalPages)
        nearbyPages.forEach((nearbyPage) => {
          const nearbyKey = `${featureGenerationId}:${nearbyPage}:${refreshKey}`
          if (pageCacheRef.current.has(nearbyKey)) return
          dataScienceService.getFeaturePreview(featureGenerationId, nearbyPage, { daysPerPage: 2 })
            .then((nearbyData) => pageCacheRef.current.set(nearbyKey, nearbyData))
            .catch(() => {})
        })
      })
      .catch((err) => { if (!cancelled) { setError(extractErrorMessage(err, 'Không tải được bảng lag features.')); setLoadedKey(requestKey) } })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [featureGenerationId, page, requestKey])

  const cachedResult = requestKey ? pageCacheRef.current.get(requestKey) : null

  return {
    result: cachedResult || (loadedKey === requestKey ? result : null),
    page, setPage,
    isLoading: Boolean(requestKey) && !cachedResult && (isLoading || loadedKey !== requestKey),
    error: loadedKey === requestKey ? error : '',
    reload: () => setRefreshKey((value) => value + 1),
  }
}

async function loadAllPredictionSessions(params) {
  const sessions = []
  let page = 1
  while (true) {
    const result = await dataScienceService.listPredictionSessions({ ...params, page })
    sessions.push(...result.sessions)
    if (sessions.length >= result.total_records || result.sessions.length === 0) return sessions
    page += 1
  }
}

async function loadAllForecastResults(forecastId) {
  const rows = []
  let page = 1
  while (true) {
    const result = await dataScienceService.getForecastResults(forecastId, page)
    rows.push(...result.results)
    if (rows.length >= result.total_records || result.results.length === 0) return rows
    page += 1
  }
}

async function loadForecastDetail(forecastId) {
  const [detail, rows] = await Promise.all([
    dataScienceService.getForecastDetail(forecastId),
    loadAllForecastResults(forecastId),
  ])
  const rowsBySession = new Map()
  for (const row of rows) {
    const sessionRows = rowsBySession.get(row.session_id) || []
    sessionRows.push(row)
    rowsBySession.set(row.session_id, sessionRows)
  }
  const filenamesBySession = Object.fromEntries(
    (detail.session_snapshots || []).map((snapshot) => [snapshot.session_id, snapshot.original_filename]),
  )
  return {
    forecast_id: detail.forecast_id,
    experiment_id: detail.experiment_id,
    experiment_name: detail.experiment_name,
    status: detail.status,
    created_at: detail.created_at,
    results_by_session: detail.session_ids.map((sessionId) => ({
      session_id: sessionId,
      original_filename: filenamesBySession[sessionId] || null,
      predictions: (rowsBySession.get(sessionId) || []).sort((a, b) => a.horizon - b.horizon),
    })),
    session_errors: [],
  }
}

export function useScienceForecastDetail(forecastId) {
  const [result, setResult] = useState({ forecastId: '', forecast: null, error: '' })
  useEffect(() => {
    if (!forecastId) return

    let cancelled = false
    loadForecastDetail(forecastId)
      .then((forecast) => {
        if (!cancelled) setResult({ forecastId, forecast, error: '' })
      })
      .catch((err) => {
        if (!cancelled) setResult({
          forecastId, forecast: null,
          error: extractErrorMessage(err, 'Không tải được kết quả dự báo đã lưu.'),
        })
      })
    return () => { cancelled = true }
  }, [forecastId])

  if (!forecastId) return { forecast: null, loading: false, error: '' }
  if (result.forecastId !== forecastId) {
    return { forecast: null, loading: true, error: '' }
  }
  return { forecast: result.forecast, loading: false, error: result.error }
}

export function useSciencePrediction(fileId, preferredExperimentId) {
  const [experiments, setExperiments] = useState([])
  const [selectedExperimentId, setSelectedExperimentId] = useState(preferredExperimentId || '')
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [compatibleSessionIds, setCompatibleSessionIds] = useState(null)
  const [compatibilityLoading, setCompatibilityLoading] = useState(false)
  const [sessionIds, setSessionIds] = useState([])
  const [forecast, setForecast] = useState(null)
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const availableExperiments = experiments.filter((item) =>
    !fileId || !Array.isArray(item.dataset_file_ids) || item.dataset_file_ids.includes(fileId))
  const experimentId = availableExperiments.some((item) => item.experiment_id === selectedExperimentId)
    ? selectedExperimentId : ''
  const selectExperiment = (id) => {
    setSelectedExperimentId(id)
    setCompatibleSessionIds(null)
    setCompatibilityLoading(Boolean(id))
    setForecast(null)
    setError('')
  }
  const load = useCallback(async () => {
    setBusy(true); setError('')
    try {
      const experimentRows = await dataScienceService.listPredictionExperiments()
      setExperiments(experimentRows.filter((item) => item.prediction_eligible))
    } catch (err) { setError(extractErrorMessage(err, 'Không tải được dữ liệu dự báo.')) }
    finally { setBusy(false) }
  }, [])
  useEffect(() => { load() }, [load])

  // Load history filtered by the currently selected session
  const selectedSessionId = sessionIds[0] || ''
  useEffect(() => {
    if (!selectedSessionId) { setHistory([]); return }
    let cancelled = false
    dataScienceService.listForecasts({ sessionId: selectedSessionId })
      .then((page) => { if (!cancelled) setHistory(page.forecasts) })
      .catch(() => { if (!cancelled) setHistory([]) })
    return () => { cancelled = true }
  }, [selectedSessionId])

  useEffect(() => {
    if (!fileId) { setSessions([]); setSessionsLoading(false); return }
    let cancelled = false
    setSessionIds([])
    setSessions([])
    setSessionsLoading(true)
    loadAllPredictionSessions({ fileId })
      .then((rows) => { if (!cancelled) setSessions(rows) })
      .catch((err) => { if (!cancelled) setError(extractErrorMessage(err, 'Không tải được phiên dự báo.')) })
      .finally(() => { if (!cancelled) setSessionsLoading(false) })
    return () => { cancelled = true }
  }, [fileId])
  useEffect(() => {
    if (!experimentId || !fileId) { setCompatibleSessionIds(null); setCompatibilityLoading(false); return }
    let cancelled = false
    setCompatibleSessionIds(null)
    setCompatibilityLoading(true)
    loadAllPredictionSessions({ experimentId, fileId })
      .then((rows) => { if (!cancelled) setCompatibleSessionIds(rows.map((row) => row.session_id)) })
      .catch((err) => { if (!cancelled) setError(extractErrorMessage(err, 'Không kiểm tra được session của thí nghiệm.')) })
      .finally(() => { if (!cancelled) setCompatibilityLoading(false) })
    return () => { cancelled = true }
  }, [experimentId, fileId])
  const predict = async () => {
    setBusy(true); setError('')
    try {
      const result = await dataScienceService.createForecast(experimentId, sessionIds)
      setForecast(result)
      const currentSessionId = sessionIds[0] || ''
      if (currentSessionId) {
        const historyPage = await dataScienceService.listForecasts({ sessionId: currentSessionId })
        setHistory(historyPage.forecasts)
      }
    } catch (err) { setError(extractErrorMessage(err, 'Dự báo không thành công.')) }
    finally { setBusy(false) }
  }
  return { experiments: availableExperiments, experimentId, setExperimentId: selectExperiment, sessions, sessionsLoading, compatibleSessionIds, compatibilityLoading, sessionIds, setSessionIds, forecast, history, busy, error, predict }
}

export function useScienceExperiments(experimentId) {
  const session = getScientistSession()
  const experimentDetailCache = session.experimentDetails
  const cachedDetail = experimentId ? experimentDetailCache.get(experimentId) : null
  const [experiments, setExperiments] = useState(() => session.experiments || [])
  const [detail, setDetail] = useState(() => cachedDetail || null)
  const [loading, setLoading] = useState(() => !session.experiments)
  const [detailLoading, setDetailLoading] = useState(() => Boolean(experimentId) && !cachedDetail)
  const [error, setError] = useState('')
  const requestId = useRef(0)
  const reload = useCallback(async () => {
    const currentRequest = ++requestId.current
    setLoading(true); setError('')
    try {
      const rows = []
      let page = 1
      while (true) {
        const result = await dataScienceService.listExperiments({ page })
        if (currentRequest !== requestId.current) return
        rows.push(...result.data)
        if (page >= result.total_pages) break
        page += 1
      }
      session.experiments = rows
      setExperiments(rows)
    } catch (err) {
      if (currentRequest !== requestId.current) return
      session.experiments = null
      setExperiments([])
      setError(extractErrorMessage(err, 'Không tải được thí nghiệm.'))
    } finally { if (currentRequest === requestId.current) setLoading(false) }
  }, [])
  useEffect(() => {
    if (!session.experiments) reload()
    return () => { requestId.current++ }
  }, [reload])
  useEffect(() => {
    if (!experimentId) { setDetail(null); return }
    const cached = experimentDetailCache.get(experimentId)
    if (cached) {
      setDetail(cached)
      setDetailLoading(false)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    dataScienceService.getExperiment(experimentId)
      .then((result) => { if (!cancelled) { experimentDetailCache.set(experimentId, result); setDetail(result) } })
      .catch((err) => { if (!cancelled) setError(extractErrorMessage(err, 'Không tải được chi tiết thí nghiệm.')) })
      .finally(() => { if (!cancelled) setDetailLoading(false) })
    return () => { cancelled = true }
  }, [experimentId])
  return { experiments, detail, loading, detailLoading, error, reload }
}

export function useScienceExperimentComparison(groupKey) {
  const scopeKey = `${getScientistSession().scope || ''}:${groupKey || ''}`
  const [comparisonData, setComparisonData] = useState(null)
  const [isComparing, setIsComparing] = useState(false)
  const [compareError, setCompareError] = useState('')
  const [resultMode, setResultMode] = useState('compare')
  const [operationScope, setOperationScope] = useState(scopeKey)
  const request = useRef({ sequence: 0, busy: false })
  const clearComparison = useCallback(() => {
    request.current.sequence++
    request.current.busy = false
    setOperationScope(scopeKey)
    setComparisonData(null); setCompareError(''); setIsComparing(false)
  }, [scopeKey])
  useEffect(() => {
    const current = request.current
    current.sequence++; current.busy = false
    return () => { current.sequence++; current.busy = false }
  }, [scopeKey])

  const runComparison = async (action, mode = 'compare') => {
    if (request.current.busy) return null
    request.current.busy = true
    const sequence = ++request.current.sequence
    setOperationScope(scopeKey)
    setResultMode(mode)
    setIsComparing(true); setCompareError(''); setComparisonData(null)
    try {
      const result = await action()
      if (sequence !== request.current.sequence) return null
      setComparisonData(result)
      return result
    } catch (err) {
      if (sequence === request.current.sequence) {
        setCompareError(extractErrorMessage(err, 'Không thể xếp hạng. Hãy kiểm tra Split ID, dữ liệu Test và đủ 3 horizon.'))
      }
      return null
    } finally {
      if (sequence === request.current.sequence) { request.current.busy = false; setIsComparing(false) }
    }
  }

  const compareExperiments = async (experimentIds, mode = 'compare', historyGroupId = null) => {
    if (!Array.isArray(experimentIds) || experimentIds.length < 2) {
      setCompareError('Vui lòng chọn ít nhất 2 thí nghiệm hoàn thành để so sánh.')
      return null
    }
    return runComparison(async () => historyGroupId
      ? (await dataScienceService.createComparisonHistory(historyGroupId, experimentIds, mode)).result
      : dataScienceService.compareExperiments(experimentIds), mode)
  }

  const restoreComparison = (result, mode) => {
    clearComparison()
    setResultMode(mode)
    setComparisonData(result)
  }

  const selectBestOverall = (experimentIds, splitId) => {
    if (!Array.isArray(experimentIds) || experimentIds.length < 2 || !splitId) {
      setCompareError('Vui lòng chọn ít nhất 2 thí nghiệm hoàn thành cùng Split để tìm Best Overall.')
      return Promise.resolve(null)
    }
    return runComparison(() => dataScienceService.selectBestOverall(experimentIds, splitId), 'overall')
  }
  return { comparisonData: operationScope === scopeKey ? comparisonData : null,
    isComparing: operationScope === scopeKey && isComparing,
    compareError: operationScope === scopeKey ? compareError : '',
    resultMode: operationScope === scopeKey ? resultMode : 'compare',
    compareExperiments, selectBestOverall, clearComparison, restoreComparison }
}
