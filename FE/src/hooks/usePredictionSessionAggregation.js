import { useEffect, useState } from 'react'
import { dataScienceService } from '../services/dataScienceService'
import { extractErrorMessage } from '../features/scientist/utils/formatters'

const PAGE_SIZE = 20

export function usePredictionSessionAggregation(aggregationId, sessionId) {
  const [pagination, setPagination] = useState({ selectionKey: '', page: 1 })
  const [response, setResponse] = useState({ key: '', result: null, error: '' })
  const selectionKey = aggregationId && sessionId ? `${aggregationId}:${sessionId}` : ''
  const page = pagination.selectionKey === selectionKey ? pagination.page : 1
  const requestKey = aggregationId && sessionId ? `${aggregationId}:${sessionId}:${page}` : ''
  const setPage = (nextPage) => setPagination((current) => {
    const currentPage = current.selectionKey === selectionKey ? current.page : 1
    return {
      selectionKey,
      page: typeof nextPage === 'function' ? nextPage(currentPage) : nextPage,
    }
  })

  useEffect(() => {
    if (!requestKey) return
    let cancelled = false
    dataScienceService.getAggregation(aggregationId, page, PAGE_SIZE, sessionId)
      .then((value) => {
        if (!cancelled) setResponse({ key: requestKey, result: value, error: '' })
      })
      .catch((error) => {
        if (!cancelled) setResponse({
          key: requestKey, result: null,
          error: extractErrorMessage(error, 'Không tải được bảng tổng hợp của session.'),
        })
      })
    return () => { cancelled = true }
  }, [aggregationId, page, requestKey, sessionId])

  return {
    result: response.key === requestKey ? response.result : null,
    page,
    setPage,
    isLoading: Boolean(requestKey) && response.key !== requestKey,
    error: sessionId && !aggregationId
      ? 'Dữ liệu session chưa có mã tổng hợp. Hãy tải lại trang để cập nhật danh sách session.'
      : response.key === requestKey ? response.error : '',
  }
}
