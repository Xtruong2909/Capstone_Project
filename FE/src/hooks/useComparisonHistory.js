import { useCallback, useEffect, useRef, useState } from 'react'
import { dataScienceService } from '../services/dataScienceService'
import { extractErrorMessage } from '../features/scientist/utils/formatters'

export function useComparisonHistory(groupId) {
  const [state, setState] = useState({ groupId: null, rows: [], loading: true, error: '' })
  const [opening, setOpening] = useState(false)
  const sequence = useRef(0)
  const reload = useCallback(async () => {
    const current = ++sequence.current
    setState(previous => ({ ...previous, groupId, loading: true, error: '' }))
    try {
      const rows = await dataScienceService.listComparisonHistory(groupId)
      if (current === sequence.current) setState({ groupId, rows, loading: false, error: '' })
    } catch (error) {
      if (current === sequence.current) setState({ groupId, rows: [], loading: false,
        error: extractErrorMessage(error, 'Không tải được lịch sử so sánh.') })
    }
  }, [groupId])
  useEffect(() => {
    let cancelled = false
    const counter = sequence
    Promise.resolve().then(() => { if (!cancelled) reload() })
    return () => { cancelled = true; counter.current++ }
  }, [reload])

  const open = async (historyId) => {
    setOpening(true)
    const current = sequence.current
    try {
      const saved = await dataScienceService.getComparisonHistory(historyId)
      return current === sequence.current && String(saved.group_id) === String(groupId) ? saved : null
    } catch (error) {
      if (current === sequence.current) setState(previous => ({ ...previous,
        error: extractErrorMessage(error, 'Không mở được kết quả đã lưu.') }))
      return null
    } finally { setOpening(false) }
  }
  return { rows: state.groupId === groupId ? state.rows : [],
    loading: state.groupId !== groupId || state.loading,
    error: state.groupId === groupId ? state.error : '', opening, reload, open }
}
