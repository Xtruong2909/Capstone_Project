import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { authStorage } from '../services/authStorage'
import { adminCacheFile, loadAdminResource, peekAdminResource, subscribeAdminCache } from '../services/adminResourceCache'

export function adminError(error) {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((item) => item.msg).join('; ')
  return detail?.message || error?.message || 'Không kết nối được máy chủ. Vui lòng thử lại.'
}

export function useAdminResource(load, params = {}, enabled = true, cacheIdentity = load) {
  const session = authStorage.read()
  const scope = session.user?.role === 'admin' ? session.token || '' : ''
  const cacheFile = useSyncExternalStore(subscribeAdminCache, adminCacheFile, adminCacheFile)
  const paramsKey = JSON.stringify(params)
  const stableParams = useMemo(() => JSON.parse(paramsKey), [paramsKey])
  const [revision, setRevision] = useState(0)
  const key = `${paramsKey}:${revision}:${cacheFile}`
  const [state, setState] = useState({ key: null, data: null, loading: true, error: '' })
  const cached = enabled ? peekAdminResource(scope, cacheIdentity, paramsKey) : null
  const sameResource = state.scope === scope && state.identity === cacheIdentity && state.paramsKey === paramsKey
  const previousData = cached?.data ?? (sameResource ? state.data : null)
  useEffect(() => {
    if (!enabled) return
    let active = true
    const metadata = { key, scope, identity: cacheIdentity, paramsKey, loading: false }
    loadAdminResource(scope, cacheIdentity, paramsKey, (signal) => load(stableParams, signal), revision > 0)
      .then((data) => { if (active) setState({ ...metadata, data, error: '' }) })
      .catch((error) => {
        if (active && error?.name !== 'CanceledError' && error?.name !== 'AbortError') {
          const denied = [401, 403].includes(error?.response?.status)
          const saved = denied ? null : peekAdminResource(scope, cacheIdentity, paramsKey)?.data
          setState({ ...metadata, data: saved ?? null, error: adminError(error) })
        }
      })
    return () => { active = false }
  }, [load, stableParams, enabled, key, scope, cacheIdentity, paramsKey, revision])
  const current = sameResource && state.key === key ? state : { data: previousData, loading: enabled && previousData == null, error: '' }
  return { data: current.data, error: current.error, loading: enabled && current.loading,
    refreshing: enabled && current.data != null && state.key !== key,
    reload: () => setRevision((value) => value + 1) }
}

export function useAdminPage(load, filters = {}, enabled = true) {
  const filtersKey = JSON.stringify(filters)
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, filtersKey })
  const requestedPage = pagination.filtersKey === filtersKey ? pagination.page : 1
  const pageSize = pagination.pageSize
  const loadPage = useMemo(() => async (params, signal) => {
    const data = await load(params, signal)
    const lastPage = Math.max(1, Math.ceil(data.total / params.page_size))
    return params.page > lastPage ? load({ ...params, page: lastPage }, signal) : data
  }, [load])
  const result = useAdminResource(loadPage, { ...filters, page: requestedPage, page_size: pageSize }, enabled, load)
  const page = result.data?.page || requestedPage
  const total = result.data?.total || 0
  const setPage = (value) => setPagination({ page: value, pageSize, filtersKey })
  return { ...result, items: result.data?.items || [], total, page, pageSize, setPage,
    setPageSize: (value) => setPagination({ page: 1, pageSize: value, filtersKey }) }
}

export function useAdminMutation() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const run = async (action, onSuccess, message = 'Đã cập nhật thành công.') => {
    setBusy(true); setError(''); setSuccess('')
    try {
      await action(); onSuccess?.(); setSuccess(message); return true
    } catch (err) { setError(adminError(err)); return false }
    finally { setBusy(false) }
  }
  return { busy, error, success, run, clear: () => { setError(''); setSuccess('') } }
}
