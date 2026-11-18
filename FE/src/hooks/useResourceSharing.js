import { useCallback, useEffect, useState } from 'react'
import { sharingService } from '../services/sharingService'
import { extractErrorMessage } from '../features/scientist/utils/formatters'

const EMPTY_MANAGED = {
  data: [], total_records: 0, active_count: 0, revoked_count: 0, unshared_count: 0,
}

export function useManagedResourceShares(filters) {
  const [result, setResult] = useState(EMPTY_MANAGED)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision((value) => value + 1), [])
  const { search, resourceType, status, page } = filters

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    sharingService.listManagedResources({
      search: search || undefined, resource_type: resourceType || undefined,
      status: status || undefined, page, page_size: 20,
    }).then((data) => { if (!cancelled) setResult(data) })
      .catch((err) => { if (!cancelled) setError(extractErrorMessage(err, 'Không tải được danh sách chia sẻ.')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [search, resourceType, status, page, revision])

  return { ...result, loading, error, reload }
}

export function useAvailableShareResources({ resourceType, search, page, enabled, revision }) {
  const [result, setResult] = useState({ data: [], total_records: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setLoading(true)
    setError('')
    sharingService.listAvailableResources({
      resource_type: resourceType, search: search || undefined, page, page_size: 12,
    }).then((data) => { if (!cancelled) setResult(data) })
      .catch((err) => { if (!cancelled) setError(extractErrorMessage(err, 'Không tải được tài nguyên.')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [resourceType, search, page, enabled, revision])

  return { ...result, loading, error }
}

export function useManagedShareDetail(shareId) {
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    sharingService.getManaged(shareId)
      .then((value) => { if (!cancelled) setDetail(value) })
      .catch((err) => {
        if (!cancelled) setError(extractErrorMessage(err, 'Không tải được chi tiết chia sẻ.'))
      })
    return () => { cancelled = true }
  }, [shareId])

  return { detail, error, loading: !detail && !error }
}
