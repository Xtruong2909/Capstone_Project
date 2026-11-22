import { useEffect, useRef, useState } from 'react'
import { pipelineService } from '../services/pipelineService'

export function useEngineerDatasetReview(item, onResubmitted) {
  const [showForm, setShowForm] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const request = useRef(null)

  useEffect(() => {
    const guard = { active: true, busy: false }
    request.current = guard
    return () => { guard.active = false }
  }, [])

  const resubmit = async (event) => {
    event.preventDefault()
    const current = request.current
    if (!current?.active || current.busy || !item?.dataset_id || !item?.file_id) return
    current.busy = true
    setBusy(true)
    setError(null)
    try {
      await pipelineService.resubmitFileForReview(item.dataset_id, item.file_id, note.trim())
      if (!current.active) return
      setSuccess(true)
      setShowForm(false)
      onResubmitted?.()
    } catch (error) {
      if (current.active) {
        setError(error.response?.data?.detail || 'Resubmission failed. Please check dataset_file status.')
      }
    } finally {
      current.busy = false
      if (current.active) setBusy(false)
    }
  }
  return { showForm, setShowForm, note, setNote, busy, error, success, resubmit }
}
