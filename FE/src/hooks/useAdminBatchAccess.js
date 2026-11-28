import { useState } from 'react'
import { adminService } from '../services/adminService'
import { useAdminMutation, useAdminResource } from './useAdminData'

export function useAdminBatchAccess(groupId, onGranted, revokeMode = false) {
  const [search, setSearch] = useState('')
  const [paging, setPaging] = useState({ search: '', page: 1 })
  const page = paging.search === search ? paging.page : 1
  const users = useAdminResource(revokeMode ? adminService.getBatchAccessUsers : adminService.getBatchEligibleUsers, {
    group_id: groupId, search: revokeMode ? undefined : search || undefined, skip: (page - 1) * 10, limit: 10,
  })
  const mutation = useAdminMutation()
  const grant = (user) => mutation.run(
    () => adminService.grantBatchAccess({ group_id: groupId, user_id: user.user_id }),
    () => { users.reload(); onGranted?.() },
  )
  const revoke = (user) => mutation.run(
    () => adminService.revokeBatchAccess({ group_id: groupId, user_id: user.user_id }),
    () => { setPaging({ search, page: 1 }); users.reload(); onGranted?.() },
  )
  return {
    users, mutation, search, setSearch, page,
    setPage: (value) => setPaging({ search, page: value }), grant, revoke,
    hasNextPage: (users.data || []).length === 10,
  }
}
