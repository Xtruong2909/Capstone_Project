import { useCallback, useEffect, useRef, useState } from 'react'
import { scientistService } from '../services/scientistService'
import { extractErrorMessage } from '../features/scientist/utils/formatters'

export function useApprovedGroups() {
  const [groups, setGroups] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const requestId = useRef(0)
  const reload = useCallback(async () => {
    const currentRequest = ++requestId.current
    setIsLoading(true)
    setError(null)
    try {
      const result = await scientistService.listApprovedGroups()
      if (currentRequest === requestId.current) setGroups(result)
    } catch (err) {
      if (currentRequest === requestId.current) setError(extractErrorMessage(err, 'Không tải được danh sách batch.'))
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false)
    }
  }, [])
  useEffect(() => { reload() }, [reload])
  return { groups, isLoading, error, reload }
}

export function useGroupDatasets(groupId) {
  const [datasets, setDatasets] = useState([])
  const [isLoading, setIsLoading] = useState(Boolean(groupId))
  const [error, setError] = useState(null)
  const [loadedGroupId, setLoadedGroupId] = useState(null)
  const requestId = useRef(0)
  const reload = useCallback(async () => {
    if (!groupId) return
    const currentRequest = ++requestId.current
    setIsLoading(true)
    setError(null)
    setDatasets([])
    try {
      const result = await scientistService.listGroupDatasets(groupId)
      if (currentRequest === requestId.current) setDatasets(result)
    } catch (err) {
      if (currentRequest === requestId.current) setError(extractErrorMessage(err, 'Không tải được dataset trong batch.'))
    } finally {
      if (currentRequest === requestId.current) { setLoadedGroupId(groupId); setIsLoading(false) }
    }
  }, [groupId])
  useEffect(() => { reload() }, [reload])
  return {
    datasets: loadedGroupId === groupId ? datasets : [],
    isLoading: Boolean(groupId) && (isLoading || loadedGroupId !== groupId),
    error: loadedGroupId === groupId ? error : null,
    reload,
  }
}

export function useGroupSessionMetadata(datasets) {
  const [sessionsById, setSessionsById] = useState({})
  const datasetKey = datasets.map((dataset) => `${dataset.dataset_id}:${dataset.version_id}`).join('|')

  useEffect(() => {
    if (!datasetKey) { setSessionsById({}); return }
    let cancelled = false
    setSessionsById({})
    Promise.allSettled(datasetKey.split('|').map((entry) => {
      const [datasetId, versionId] = entry.split(':')
      return scientistService.listDatasetSessions(datasetId, versionId)
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
  const [datasets, setDatasets] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setDatasets(await scientistService.listApprovedDatasets({ search }))
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load approved datasets.'))
    } finally {
      setIsLoading(false)
    }
  }, [search])

  useEffect(() => {
    reload()
  }, [reload])

  return { datasets, isLoading, error, reload }
}

export function useDatasetSessions(datasetId, versionId) {
  const [sessions, setSessions] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loadedKey, setLoadedKey] = useState(null)
  const requestKey = datasetId && versionId ? `${datasetId}:${versionId}:${refreshKey}` : null

  useEffect(() => {
    if (!datasetId || !versionId) return
    let cancelled = false
    setIsLoading(true)
    setError(null)
    setSessions([])
    scientistService.listDatasetSessions(datasetId, versionId)
      .then((data) => { if (!cancelled) setSessions(data) })
      .catch((err) => { if (!cancelled) setError(extractErrorMessage(err, 'Failed to load sessions.')) })
      .finally(() => { if (!cancelled) { setLoadedKey(requestKey); setIsLoading(false) } })
    return () => { cancelled = true }
  }, [datasetId, versionId, refreshKey, requestKey])

  return {
    sessions: loadedKey === requestKey ? sessions : [],
    isLoading: Boolean(requestKey) && (isLoading || loadedKey !== requestKey),
    error: loadedKey === requestKey ? error : null,
    reload: () => setRefreshKey((value) => value + 1),
  }
}

export function useDatasetPreview(datasetId, versionId, { sessionId, page, pageSize, representation }) {
  const [preview, setPreview] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!datasetId || !versionId || !sessionId) {
      setPreview(null)
      return
    }
    let cancelled = false
    setIsLoading(true)
    setError(null)
    setPreview(null)
    scientistService
      .getDatasetPreview(datasetId, versionId, { sessionId, page, pageSize, representation })
      .then((data) => !cancelled && setPreview(data))
      .catch(
        (err) =>
          !cancelled && setError(extractErrorMessage(err, 'Failed to load data preview.'))
      )
      .finally(() => !cancelled && setIsLoading(false))
    return () => {
      cancelled = true
    }
  }, [datasetId, versionId, sessionId, page, pageSize, representation, refreshKey])

  return { preview, isLoading, error, reload: () => setRefreshKey((value) => value + 1) }
}
