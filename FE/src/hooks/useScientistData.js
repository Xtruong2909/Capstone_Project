import { useCallback, useEffect, useRef, useState } from 'react'
import { getScientistSession } from '../services/scientistSession'
import { scientistService } from '../services/scientistService'
import { extractErrorMessage } from '../features/scientist/utils/formatters'

function prefetchDatasetPreview(session, datasetId, fileId, sessionId, page, pageSize, representation) {
  const scientistDataCache = session.datasets
  const datasetPreviewRequests = session.previewRequests
  if (page < 1) return
  const key = `${datasetId}:${fileId}:${sessionId}:${page}:${pageSize}:${representation}`
  if (scientistDataCache.datasetPreviews.has(key) || datasetPreviewRequests.has(key)) return
  datasetPreviewRequests.add(key)
  scientistService.getDatasetPreview(datasetId, fileId, { sessionId, page, pageSize, representation })
    .then((data) => scientistDataCache.datasetPreviews.set(key, data))
    .catch(() => {})
    .finally(() => datasetPreviewRequests.delete(key))
}

export function useApprovedGroups() {
  const session = getScientistSession()
  const scientistDataCache = session.datasets
  const [groups, setGroups] = useState(() => scientistDataCache.approvedGroups || [])
  const [isLoading, setIsLoading] = useState(() => !scientistDataCache.approvedGroups)
  const [error, setError] = useState(null)
  const requestId = useRef(0)
  const reload = useCallback(async () => {
    const currentRequest = ++requestId.current
    setIsLoading(true)
    setError(null)
    try {
      const result = await scientistService.listApprovedGroups()
      if (currentRequest === requestId.current) {
        scientistDataCache.approvedGroups = result
        setGroups(result)
      }
    } catch (err) {
      if (currentRequest === requestId.current) setError(extractErrorMessage(err, 'Không tải được danh sách batch.'))
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false)
    }
  }, [])
  useEffect(() => {
    if (!scientistDataCache.approvedGroups) reload()
    return () => { requestId.current++ }
  }, [reload])
  return { groups, isLoading, error, reload }
}

export function useGroupDatasets(groupId) {
  const session = getScientistSession()
  const scientistDataCache = session.datasets
  const cachedDatasets = groupId ? scientistDataCache.groupDatasets.get(groupId) : null
  const [datasets, setDatasets] = useState(() => cachedDatasets || [])
  const [isLoading, setIsLoading] = useState(() => Boolean(groupId) && !cachedDatasets)
  const [error, setError] = useState(null)
  const [loadedGroupId, setLoadedGroupId] = useState(() => cachedDatasets ? groupId : null)
  const requestId = useRef(0)
  const reload = useCallback(async () => {
    if (!groupId) return
    const currentRequest = ++requestId.current
    setIsLoading(true)
    setError(null)
    setDatasets([])
    try {
      const result = await scientistService.listGroupDatasets(groupId)
      if (currentRequest === requestId.current) {
        scientistDataCache.groupDatasets.set(groupId, result)
        setDatasets(result)
      }
    } catch (err) {
      if (currentRequest === requestId.current) setError(extractErrorMessage(err, 'Không tải được dataset trong batch.'))
    } finally {
      if (currentRequest === requestId.current) { setLoadedGroupId(groupId); setIsLoading(false) }
    }
  }, [groupId])
  useEffect(() => {
    const cached = groupId ? scientistDataCache.groupDatasets.get(groupId) : null
    if (cached) {
      setDatasets(cached)
      setLoadedGroupId(groupId)
      setIsLoading(false)
      return
    }
    reload()
  }, [groupId, reload])
  return {
    datasets: loadedGroupId === groupId ? datasets : [],
    isLoading: Boolean(groupId) && (isLoading || loadedGroupId !== groupId),
    error: loadedGroupId === groupId ? error : null,
    reload,
  }
}

export function useGroupSessionMetadata(datasets) {
  const session = getScientistSession()
  const scientistDataCache = session.datasets
  const [sessionsById, setSessionsById] = useState({})
  const datasetKey = datasets.map((dataset) => `${dataset.dataset_id}:${dataset.file_id}`).join('|')

  useEffect(() => {
    if (!datasetKey) { setSessionsById({}); return }
    let cancelled = false
    setSessionsById({})
    Promise.allSettled(datasetKey.split('|').map((entry) => {
      const [datasetId, fileId] = entry.split(':')
      const cached = scientistDataCache.datasetSessions.get(`${datasetId}:${fileId}`)
      if (cached) return Promise.resolve(cached)
      return scientistService.listDatasetSessions(datasetId, fileId).then((sessions) => {
        scientistDataCache.datasetSessions.set(`${datasetId}:${fileId}`, sessions)
        return sessions
      })
    })).then((results) => {
      if (cancelled) return
      const sessions = {}
      results.forEach((result) => {
        if (result.status === 'fulfilled') result.value.forEach((session) => { sessions[session.session_id] = session })
      })
      setSessionsById(sessions)
    })
    return () => { cancelled = true }
  }, [datasetKey])

  return sessionsById
}

export function useApprovedDatasets(search = '') {
  const session = getScientistSession()
  const scientistDataCache = session.datasets
  const cacheKey = search.trim()
  const cachedDatasets = scientistDataCache.approvedDatasets.get(cacheKey)
  const [datasets, setDatasets] = useState(() => cachedDatasets || [])
  const [isLoading, setIsLoading] = useState(() => !cachedDatasets)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await scientistService.listApprovedDatasets({ search })
      scientistDataCache.approvedDatasets.set(cacheKey, result)
      setDatasets(result)
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load approved datasets.'))
    } finally {
      setIsLoading(false)
    }
  }, [cacheKey, search])

  useEffect(() => {
    const cached = scientistDataCache.approvedDatasets.get(cacheKey)
    if (cached) {
      setDatasets(cached)
      setIsLoading(false)
    } else reload()
  }, [cacheKey, reload])

  return { datasets, isLoading, error, reload }
}

export function useDatasetSessions(datasetId, fileId) {
  const session = getScientistSession()
  const scientistDataCache = session.datasets
  const baseKey = datasetId && fileId ? `${datasetId}:${fileId}` : null
  const cachedSessions = baseKey ? scientistDataCache.datasetSessions.get(baseKey) : null
  const [sessions, setSessions] = useState(() => cachedSessions || [])
  const [isLoading, setIsLoading] = useState(() => Boolean(baseKey) && !cachedSessions)
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loadedKey, setLoadedKey] = useState(() => cachedSessions ? `${baseKey}:0` : null)
  const requestKey = datasetId && fileId ? `${datasetId}:${fileId}:${refreshKey}` : null

  useEffect(() => {
    if (!datasetId || !fileId) return
    let cancelled = false
    const cached = refreshKey === 0 ? scientistDataCache.datasetSessions.get(baseKey) : null
    if (cached) {
      setSessions(cached)
      setLoadedKey(requestKey)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    setSessions([])
    scientistService.listDatasetSessions(datasetId, fileId)
      .then((data) => { if (!cancelled) { scientistDataCache.datasetSessions.set(baseKey, data); setSessions(data) } })
      .catch((err) => { if (!cancelled) setError(extractErrorMessage(err, 'Failed to load sessions.')) })
      .finally(() => { if (!cancelled) { setLoadedKey(requestKey); setIsLoading(false) } })
    return () => { cancelled = true }
  }, [baseKey, datasetId, fileId, refreshKey, requestKey])

  return {
    sessions: loadedKey === requestKey ? sessions : [],
    isLoading: Boolean(requestKey) && (isLoading || loadedKey !== requestKey),
    error: loadedKey === requestKey ? error : null,
    reload: () => setRefreshKey((value) => value + 1),
  }
}

export function useDatasetPreview(datasetId, fileId, { sessionId, page, pageSize, representation }) {
  const session = getScientistSession()
  const scientistDataCache = session.datasets
  const previewKey = datasetId && fileId && sessionId
    ? `${datasetId}:${fileId}:${sessionId}:${page}:${pageSize}:${representation}` : null
  const cachedPreview = previewKey ? scientistDataCache.datasetPreviews.get(previewKey) : null
  const [preview, setPreview] = useState(() => cachedPreview || null)
  const [isLoading, setIsLoading] = useState(() => Boolean(previewKey) && !cachedPreview)
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!datasetId || !fileId || !sessionId) {
      setPreview(null)
      return
    }
    const cached = refreshKey === 0 ? scientistDataCache.datasetPreviews.get(previewKey) : null
    if (cached) {
      setPreview(cached)
      setIsLoading(false)
      prefetchDatasetPreview(session, datasetId, fileId, sessionId, page - 1, pageSize, representation)
      if (cached?.pagination?.has_more) {
        prefetchDatasetPreview(session, datasetId, fileId, sessionId, page + 1, pageSize, representation)
      }
      return
    }
    let cancelled = false
    setIsLoading(true)
    setError(null)
    setPreview(null)
    scientistService
      .getDatasetPreview(datasetId, fileId, { sessionId, page, pageSize, representation })
      .then((data) => {
        if (cancelled) return
        scientistDataCache.datasetPreviews.set(previewKey, data)
        setPreview(data)
        prefetchDatasetPreview(session, datasetId, fileId, sessionId, page - 1, pageSize, representation)
        if (data?.pagination?.has_more) {
          prefetchDatasetPreview(session, datasetId, fileId, sessionId, page + 1, pageSize, representation)
        }
      })
      .catch(
        (err) =>
          !cancelled && setError(extractErrorMessage(err, 'Failed to load data preview.'))
      )
      .finally(() => !cancelled && setIsLoading(false))
    return () => {
      cancelled = true
    }
  }, [datasetId, fileId, sessionId, page, pageSize, representation, refreshKey, previewKey])

  return { preview, isLoading, error, reload: () => setRefreshKey((value) => value + 1) }
}
