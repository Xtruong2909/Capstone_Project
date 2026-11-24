import { useEffect, useState } from 'react'
import { sharingService } from '../services/sharingService'
import { extractErrorMessage } from '../features/scientist/utils/formatters'

export function useShareSelection() {
  const [batches, setBatches] = useState([])
  const [recipients, setRecipients] = useState([])
  const [recipientIds, setRecipientIds] = useState([])
  const [recipientsLoading, setRecipientsLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    sharingService.getRecipients()
      .then((users) => {
        if (cancelled) return
        setRecipients(users)
        if (users.length === 1) {
          setLoading(true)
          setRecipientIds([users[0].user_id])
        }
      })
      .catch((err) => { if (!cancelled) setError(extractErrorMessage(err, 'Không tải được người nhận.')) })
      .finally(() => { if (!cancelled) setRecipientsLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!recipientIds.length) {
      return () => { cancelled = true }
    }
    sharingService.getCatalog(recipientIds)
      .then((result) => { if (!cancelled) setBatches(result.batches) })
      .catch((err) => { if (!cancelled) setError(extractErrorMessage(err, 'Không tải được danh sách batch.')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [recipientIds])

  const toggleRecipient = (userId) => {
    setBatches([])
    setError('')
    setLoading(!recipientIds.includes(userId) || recipientIds.length > 1)
    setRecipientIds((current) => current.includes(userId)
      ? current.filter((id) => id !== userId) : [...current, userId])
  }

  const share = async (payload) => {
    setBusy(true)
    setError('')
    try {
      await sharingService.shareSelection({ ...payload, recipient_ids: recipientIds })
      return true
    } catch (err) {
      setError(extractErrorMessage(err, 'Không thể chia sẻ batch. Vui lòng thử lại.'))
      return false
    } finally {
      setBusy(false)
    }
  }

  return { batches, recipients, recipientIds, recipientsLoading, toggleRecipient, loading, busy, error, share }
}
