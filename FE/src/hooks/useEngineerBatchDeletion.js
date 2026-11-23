import { useEffect, useRef, useState } from 'react'
import { useAuth } from './useAuth'
import { useLanguage } from './useLanguage'
import { adminError } from './useAdminData'
import { engineerService } from '../services/engineerService'
import { invalidateEngineerPreviews } from '../services/engineerPreviewCache'
import { engineerStorageKey } from '../services/engineerStorage'
import { invalidateAdminResourceCache } from '../services/adminResourceCache'

export function useEngineerBatchDeletion(onDeleted) {
  const { user } = useAuth()
  const { t } = useLanguage()
  const [target, setTarget] = useState(null)
  const [state, setState] = useState({ busy: false, error: '', success: '' })
  const pending = useRef(false)

  useEffect(() => {
    if (!state.success) return
    const timer = setTimeout(() => {
      setState((current) => ({ ...current, success: '' }))
    }, 3000)
    return () => clearTimeout(timer)
  }, [state.success])

  const confirm = async () => {
    if (!target || target.can_delete !== true || pending.current) return
    pending.current = true
    setState({ busy: true, error: '', success: '' })
    try {
      const receipt = await engineerService.deleteBatch(target.group_id)
      invalidateEngineerPreviews(target.group_id)
      invalidateAdminResourceCache()
      try {
        localStorage.removeItem(engineerStorageKey('de-wizard:' + target.group_id))
        sessionStorage.removeItem('de-job:' + user?.id + ':processing:' + target.group_id)
        sessionStorage.removeItem('de-job:' + user?.id + ':upload')
      } catch { /* Deletion still succeeds when browser storage is unavailable. */ }
      setTarget(null)
      setState({ busy: false, error: '', success: receipt.cleanup_pending
        ? t('Batch deleted. Some files are awaiting storage cleanup.') : t('Batch deleted successfully.') })
      onDeleted?.()
    } catch (error) {
      setState({ busy: false, error: adminError(error), success: '' })
      if ([404, 409].includes(error.response?.status)) {
        setTarget(null)
        onDeleted?.()
      }
    } finally { pending.current = false }
  }

  return { ...state, target, confirm,
    open: (batch) => {
      if (!pending.current && batch.can_delete === true) {
        setTarget(batch)
        setState({ busy: false, error: '', success: '' })
      }
    },
    close: () => { if (!pending.current) setTarget(null) },
  }
}
