import { useState } from 'react'
import { adminService } from '../services/adminService'
import { useAdminMutation, useAdminPage } from './useAdminData'

export const accessGrantKey = (item) => `${item.group_id || item.dataset_id}:${item.user_id}`

export function useAdminBatchGrantPicker() {
  const batches = useAdminPage(adminService.getDatasetGroups, { approval_status: 'APPROVED' })
  const [selected, setSelected] = useState(null)
  return { batches, selected, setSelected }
}

export function useAdminAccessGrants(onChanged) {
  const grants = useAdminPage(adminService.getBatchAccessGrants)
  const mutation = useAdminMutation()
  const [confirmKey, setConfirmKey] = useState(null)
  const revoke = async (item) => {
    if (mutation.busy) return
    const key = accessGrantKey(item)
    if (confirmKey !== key) { setConfirmKey(key); return }
    const succeeded = await mutation.run(
      () => item.group_id
        ? adminService.revokeBatchAccess({ group_id: item.group_id, user_id: item.user_id })
        : adminService.revokeAccess({ dataset_id: item.dataset_id, user_id: item.user_id }),
      () => { grants.reload(); onChanged?.() },
    )
    if (succeeded) setConfirmKey(null)
  }
  return { grants, mutation, confirmKey, cancel: () => setConfirmKey(null), revoke }
}
