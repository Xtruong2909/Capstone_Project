import { useCallback, useEffect, useRef, useState } from 'react'
import { dataScienceService } from '../services/dataScienceService'
import { extractErrorMessage } from '../features/scientist/utils/formatters'

let experimentsCache = null
const experimentDetailCache = new Map()

function readStoredWorkflow(storageKey) {
  if (!storageKey || typeof sessionStorage === 'undefined') return {}
  try { return JSON.parse(sessionStorage.getItem(storageKey) || '{}') || {} }
  catch { return {} }
}

export function useScienceTraining(groupId) {
  const storageKey = groupId ? `science-workflow:${groupId}` : null
  const storedWorkflow = readStoredWorkflow(storageKey)
  const hasStoredWorkflow = Boolean(storedWorkflow.aggregation)
  const [workflow, setWorkflow] = useState({})
  const [loadedGroupId, setLoadedGroupId] = useState(null)
  const [workflowRefreshKey, setWorkflowRefreshKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const visibleWorkflow = loadedGroupId === groupId || !hasStoredWorkflow
    ? workflow
    : storedWorkflow
  const aggregationId = visibleWorkflow.aggregation?.aggregation_id
  useEffect(() => {
    if (!groupId || !storageKey) return
    let cancelled = false
    setLoadError('')
    const cached = readStoredWorkflow(storageKey)
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
      const split = features?.status === 'COMPLETED'
        ? await dataScienceService.getLatestSplit(features.feature_generation_id) : null
      if (cancelled) return
      const experiment = split?.split_id === cached.split?.split_id ? cached.experiment : null
      const next = { aggregation, features, split, experiment }
      setWorkflow(next)
      try { sessionStorage.setItem(storageKey, JSON.stringify(next)) }
      catch { /* Browser storage is optional; server results remain available. */ }
    }
    restoreWorkflow()
      .catch((err) => { if (!cancelled) setLoadError(extractErrorMessage(err, 'Không tải được kết quả huấn luyện đã lưu.')) })
      .finally(() => { if (!cancelled) setLoadedGroupId(groupId) })
    return () => { cancelled = true }
  }, [groupId, storageKey, workflowRefreshKey])
  const save = useCallback((changes) => {
    setWorkflow((current) => {
      const next = { ...current, ...changes }
      if (storageKey) sessionStorage.setItem(storageKey, JSON.stringify(next))
      return next
    })
  }, [storageKey])
  const run = useCallback(async (operation) => {
    setBusy(true); setError('')
    try { await operation() }
    catch (err) { setError(extractErrorMessage(err, 'Thao tác không thành công.')) }
    finally { setBusy(false) }
  }, [])
  const startAggregation = () => run(async () => {
    const result = await dataScienceService.startAggregation(groupId)
    save({ aggregation: result, features: null, split: null, experiment: null })
  })
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
    workflow: visibleWorkflow, busy, error, loadError,
    isLoadingWorkflow: Boolean(groupId) && loadedGroupId !== groupId && !hasStoredWorkflow,
    reloadWorkflow: () => setWorkflowRefreshKey((value) => value + 1),
    startAggregation, refreshAggregation, generateFeatures, refreshFeatures, createSplit,
  }
}

const DEFAULT_EXPERIMENT_CONFIG = {
  n_estimators: '100', max_depth: '10', min_samples_split: '2',
  min_samples_leaf: '1', max_features: 'all', bootstrap: true, random_state: '42',
}

export function useExperimentSetup(splitId, groupId) {
  const [split, setSplit] = useState(null)
  const [configuration, setConfiguration] = useState(DEFAULT_EXPERIMENT_CONFIG)
  const [loading, setLoading] = useState(Boolean(splitId))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!splitId) return
    let cancelled = false
    setLoading(true)
    setSplit(null)
    setError('')
    dataScienceService.getSplit(splitId)
      .then((data) => { if (!cancelled) setSplit(data) })
      .catch((err) => { if (!cancelled) setError(extractErrorMessage(err, 'Không tải được cấu hình Train/Test.')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [splitId])

  const updateConfiguration = (name, value) => {
    setConfiguration((current) => ({ ...current, [name]: value }))
  }

  const createExperiment = async () => {
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
      const result = await dataScienceService.createExperiment(splitId, hyperparameters)
      experimentsCache = null
      if (groupId) {
        const storageKey = `science-workflow:${groupId}`
        try {
          const saved = JSON.parse(sessionStorage.getItem(storageKey) || '{}') || {}
          if (saved.split?.split_id === splitId) {
            const experiment = {
              experiment_id: result.experiment_id,
              experiment_name: result.experiment_name,
              status: result.status,
            }
            sessionStorage.setItem(storageKey, JSON.stringify({ ...saved, experiment }))
          }
        } catch { /* A stale browser cache must not hide the completed experiment. */ }
      }
      return result
    } catch (err) {
      setError(extractErrorMessage(err, 'Không tạo được thí nghiệm.'))
      return null
    } finally {
      setBusy(false)
    }
  }

  return { split, configuration, updateConfiguration, loading, busy, error, createExperiment }
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

export function useSciencePrediction(versionId, preferredExperimentId) {
  const [experiments, setExperiments] = useState([])
  const [experimentId, setExperimentId] = useState(preferredExperimentId || '')
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionIds, setSessionIds] = useState([])
  const [forecast, setForecast] = useState(null)
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const selectExperiment = (id) => { setExperimentId(id); setForecast(null) }
  const load = useCallback(async () => {
    setBusy(true); setError('')
    try {
      const [experimentRows, historyPage] = await Promise.all([
        dataScienceService.listPredictionExperiments(), dataScienceService.listForecasts(),
      ])
      setExperiments(experimentRows.filter((item) => item.prediction_eligible))
      setHistory(historyPage.forecasts)
    } catch (err) { setError(extractErrorMessage(err, 'Không tải được dữ liệu dự báo.')) }
    finally { setBusy(false) }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!experimentId) { setSessions([]); setSessionsLoading(false); return }
    let cancelled = false
    setSessionIds([])
    setSessions([])
    setSessionsLoading(true)
    const loadSessions = async () => {
      const sessions = []
      let page = 1
      while (true) {
        const result = await dataScienceService.listPredictionSessions(experimentId, page)
        sessions.push(...result.sessions)
        if (sessions.length >= result.total_records || result.sessions.length === 0) break
        page += 1
      }
      return sessions
    }
    loadSessions()
      .then((rows) => { if (!cancelled) setSessions(rows.filter((session) => session.dataset_version_id === versionId)) })
      .catch((err) => { if (!cancelled) setError(extractErrorMessage(err, 'Không tải được phiên dự báo.')) })
      .finally(() => { if (!cancelled) setSessionsLoading(false) })
    return () => { cancelled = true }
  }, [experimentId, versionId])
  const predict = async () => {
    setBusy(true); setError('')
    try {
      const result = await dataScienceService.createForecast(experimentId, sessionIds)
      setForecast(result)
      const historyPage = await dataScienceService.listForecasts()
      setHistory(historyPage.forecasts)
    } catch (err) { setError(extractErrorMessage(err, 'Dự báo không thành công.')) }
    finally { setBusy(false) }
  }
  return { experiments, experimentId, setExperimentId: selectExperiment, sessions, sessionsLoading, sessionIds, setSessionIds, forecast, history, busy, error, predict }
}

export function useScienceExperiments(experimentId) {
  const cachedDetail = experimentId ? experimentDetailCache.get(experimentId) : null
  const [experiments, setExperiments] = useState(() => experimentsCache || [])
  const [detail, setDetail] = useState(() => cachedDetail || null)
  const [loading, setLoading] = useState(() => !experimentsCache)
  const [detailLoading, setDetailLoading] = useState(() => Boolean(experimentId) && !cachedDetail)
  const [error, setError] = useState('')
  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const rows = []
      let page = 1
      while (true) {
        const result = await dataScienceService.listExperiments({ page })
        rows.push(...result.data)
        if (page >= result.total_pages) break
        page += 1
      }
      experimentsCache = rows
      setExperiments(rows)
    } catch (err) { setError(extractErrorMessage(err, 'Không tải được thí nghiệm.')) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { if (!experimentsCache) reload() }, [reload])
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

export function useScienceExperimentComparison() {
  const [comparisonData, setComparisonData] = useState(null)
  const [isComparing, setIsComparing] = useState(false)
  const [compareError, setCompareError] = useState('')

  const compareExperiments = async (experimentIds) => {
    if (!Array.isArray(experimentIds) || experimentIds.length < 2) {
      setCompareError('Vui lòng chọn ít nhất 2 thí nghiệm hoàn thành để so sánh.')
      return null
    }
    setIsComparing(true)
    setCompareError('')
    try {
      const result = await dataScienceService.compareExperiments(experimentIds)
      setComparisonData(result)
      return result
    } catch (err) {
      setCompareError(extractErrorMessage(err, 'Không thể so sánh. Hãy chọn các thí nghiệm dùng cùng dữ liệu Test và Split ID.'))
      return null
    } finally {
      setIsComparing(false)
    }
  }

  return { comparisonData, isComparing, compareError, compareExperiments }
}
