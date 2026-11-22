import { useEffect, useState } from 'react'
import { getEngineerPreviewCache } from '../services/engineerPreviewCache'
import { adminError } from './useAdminData'
import { useAuth } from './useAuth'

export function useEngineerPreview({ groupId, datasetId, sessionId }) {
  const { user } = useAuth()
  const [previewRepresentation, setPreviewRepresentation] = useState('normalized')
  const [previewPage, setPreviewPage] = useState(1)
  const [previewPageSize, setPreviewPageSize] = useState(20)
  const [columnOffsets, setColumnOffsets] = useState([0])
  const columnOffset = columnOffsets[columnOffsets.length - 1]
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState({ key: '', data: null, error: '', loading: false })
  const cache = getEngineerPreviewCache()
  const params = { group_id: groupId, dataset_id: datasetId, session_id: sessionId,
    page: previewPage, page_size: previewPageSize, representation: previewRepresentation, column_offset: columnOffset }
  const paramsKey = JSON.stringify(params)
  const resourceKey = JSON.stringify([user?.id, groupId, datasetId, sessionId, previewRepresentation, previewPageSize, columnOffset])
  const key = paramsKey + ':' + revision

  useEffect(() => {
    if (!groupId || !datasetId || !sessionId) return
    const request = JSON.parse(paramsKey)
    let active = true
    cache.request(request).then((data) => {
      if (active) setState({ key, resourceKey, cache, data, error: '', loading: false })
      if (active && data.pagination?.has_more && request.page < 10000) {
        cache.request({ ...request, page: request.page + 1 }).catch(() => {})
      }
    }).catch((error) => {
      if (!active || error.name === 'AbortError' || error.name === 'CanceledError') return
      const denied = [401, 403].includes(error.response?.status)
      setState((previous) => ({ key, resourceKey, cache,
        data: !denied && previous.resourceKey === resourceKey && previous.cache === cache ? previous.data : null,
        error: adminError(error), loading: false }))
    })
    return () => { active = false }
  }, [key, paramsKey, resourceKey, cache, groupId, datasetId, sessionId])

  useEffect(() => {
    const [, group_id, dataset_id, session_id, representation, page_size, column_offset] = JSON.parse(resourceKey)
    return () => cache.cancelResource({ group_id, dataset_id, session_id, representation, page_size, column_offset })
    // Page changes share in-flight prefetches; cancel when leaving this session or changing its options.
  }, [cache, resourceKey])

  const cached = cache.peek(params)
  const sameResource = state.resourceKey === resourceKey && state.cache === cache
  const finished = sameResource && state.key === key
  const data = cached || (sameResource ? state.data : null)
  const loading = Boolean(sessionId) && !cached && !finished
  const current = { data, error: finished ? state.error : '', loading }

  return {
    previewData: current.data, previewError: current.error, isPreviewLoading: current.loading && !current.data,
    isPreviewRefreshing: current.loading && Boolean(current.data),
    previewRepresentation, previewPageSize, columnOffset,
    setPreviewPage: (value) => {
      const next = typeof value === 'function' ? value(previewPage) : value
      if (current.error && next === previewPage) setRevision((previous) => previous + 1)
      setPreviewPage(next)
    },
    previousColumns: () => setColumnOffsets((offsets) => offsets.length > 1 ? offsets.slice(0, -1) : offsets),
    nextColumns: () => {
      if (current.data?.has_more_columns && current.data.columns?.length) {
        setColumnOffsets((offsets) => [...offsets, columnOffset + current.data.columns.length])
      }
    },
    setPreviewRepresentation: (value) => { setPreviewRepresentation(value); setPreviewPage(1); setColumnOffsets([0]) },
    setPreviewPageSize: (value) => { setPreviewPageSize(value); setPreviewPage(1) },
    reload: () => { cache.clearSession(params); setRevision((value) => value + 1) },
  }
}
