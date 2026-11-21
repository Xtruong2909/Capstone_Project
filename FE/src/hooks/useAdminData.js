import { useEffect, useMemo, useState } from 'react'

export function adminError(error) {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((item) => item.msg).join('; ')
  return detail?.message || error?.message || 'Không kết nối được máy chủ. Vui lòng thử lại.'
}

export function useAdminResource(load, params = {}, enabled = true) {
  const paramsKey = JSON.stringify(params)
  const stableParams = useMemo(() => JSON.parse(paramsKey), [paramsKey])
  const [revision, setRevision] = useState(0)
  const key = `${paramsKey}:${revision}`
  const [state, setState] = useState({ key: null, data: null, loading: true, error: '' })
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    Promise.resolve().then(() => load(stableParams, controller.signal))
      .then((data) => { if (!controller.signal.aborted) setState({ key, data, loading: false, error: '' }) })
      .catch((error) => { if (!controller.signal.aborted) setState({ key, data: null, loading: false, error: adminError(error) }) })
    return () => controller.abort()
  }, [load, stableParams, enabled, key])
  const current = state.key === key ? state : { data: null, loading: enabled, error: '' }
  return { data: current.data, error: current.error, loading: enabled && current.loading,
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
  const result = useAdminResource(loadPage, { ...filters, page: requestedPage, page_size: pageSize }, enabled)
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
