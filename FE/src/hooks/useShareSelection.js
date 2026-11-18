import { useEffect, useState } from 'react'
import { sharingService } from '../services/sharingService'
import { extractErrorMessage } from '../features/scientist/utils/formatters'

export function useShareSelection() {
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    sharingService.getCatalog()
      .then((result) => { if (!cancelled) setBatches(result.batches) })
      .catch((err) => { if (!cancelled) setError(extractErrorMessage(err, 'Không tải được danh sách batch.')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const share = async (payload) => {
    setBusy(true)
    setError('')
    try {
      await sharingService.shareSelection(payload)
      return true
    } catch (err) {
      setError(extractErrorMessage(err, 'Không thể chia sẻ batch. Vui lòng thử lại.'))
      return false
    } finally {
      setBusy(false)
    }
  }

  return { batches, loading, busy, error, share }
}
