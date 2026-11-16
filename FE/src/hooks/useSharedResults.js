import { useCallback, useEffect, useState } from 'react'
import { sharingService } from '../services/sharingService'
import { extractErrorMessage } from '../features/scientist/utils/formatters'

export function useSharedResults({ search = '', resourceType = '', page = 1 } = {}) {
  const [result, setResult] = useState({ data: [], total_records: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setResult(await sharingService.listPublished({ search: search || undefined, resource_type: resourceType || undefined, page, page_size: 20 }))
    } catch (err) {
      setError(extractErrorMessage(err, 'Không tải được kết quả chia sẻ.'))
    } finally { setLoading(false) }
  }, [search, resourceType, page])
  useEffect(() => { reload() }, [reload])
  return { ...result, loading, error, reload }
}

export function useMyShares() {
  const [shares, setShares] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const rows = []
      let page = 1
      while (true) {
        const result = await sharingService.listMine({ page, page_size: 100 })
        rows.push(...result.data)
        if (rows.length >= result.total_records) break
        page += 1
      }
      setShares(rows)
    } catch (err) { setError(extractErrorMessage(err, 'Không tải được danh sách chia sẻ.')) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { reload() }, [reload])
  return { shares, loading, error, reload }
}

export function useSharedResultDetail(shareId) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!shareId) { setDetail(null); return }
    let cancelled = false
    setLoading(true)
    setError('')
    sharingService.getPublished(shareId)
      .then((data) => { if (!cancelled) setDetail(data) })
      .catch((err) => { if (!cancelled) setError(extractErrorMessage(err, 'Không tải được chi tiết.')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [shareId])
  return { detail, loading, error }
}

export function useSharedItemRows(shareId, itemId, section, page) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!shareId || !itemId || !section) return
    let cancelled = false
    setLoading(true)
    setError('')
    sharingService.getRows(shareId, itemId, section, page)
      .then((data) => { if (!cancelled) setResult(data) })
      .catch((err) => { if (!cancelled) setError(extractErrorMessage(err, 'Không tải được dữ liệu.')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [shareId, itemId, section, page])
  return { result, loading, error }
}
