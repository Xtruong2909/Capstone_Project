import { useMemo, useState } from 'react'
import { adminService } from '../services/adminService'
import { useAdminResource } from './useAdminData'

const EMPTY_LOGS = []

export function useAdminAuditLogs(t) {
  const resource = useAdminResource(adminService.getAuditLogs)
  const logs = Array.isArray(resource.data) ? resource.data : resource.data?.items || EMPTY_LOGS
  const totalCount = resource.data?.total ?? logs.length
  const [searchQuery, setSearchQuery] = useState('')
  const [actionFilter, setActionFilter] = useState('ALL')
  const [paging, setPaging] = useState({ page: 1, pageSize: 20, filtersKey: '' })
  const summary = useMemo(() => {
    let createCount = 0, securityCount = 0
    logs.forEach((log) => {
      const action = (log.action || '').toUpperCase()
      if (/CREATE|GRANT|APPROVE/.test(action)) createCount++
      if (/DELETE|REJECT|REVOKE/.test(action) || log.status === 'FAILED') securityCount++
    })
    return { total: totalCount, createCount, securityCount }
  }, [logs, totalCount])
  const filteredLogs = useMemo(() => logs.filter((log) => {
    const action = (log.action || '').toUpperCase()
    if (actionFilter === 'CREATE' && !/CREATE|GRANT|APPROVE/.test(action)) return false
    if (actionFilter === 'UPDATE' && !/UPDATE|STATUS/.test(action)) return false
    if (actionFilter === 'SECURITY' && !/DELETE|REJECT|REVOKE/.test(action) && log.status !== 'FAILED') return false
    const query = searchQuery.trim().toLowerCase()
    if (!query) return true
    return [log.username, log.user_email, log.action, t(log.action), log.module, t(log.module),
      log.resource_type, t(log.resource_type), log.description, log.ip_address,
    ].some((value) => typeof value === 'string' && value.toLowerCase().includes(query))
  }), [logs, searchQuery, actionFilter, t])
  const filtersKey = JSON.stringify([searchQuery, actionFilter])
  const pageSize = paging.pageSize
  const lastPage = Math.max(1, Math.ceil(filteredLogs.length / pageSize))
  const page = paging.filtersKey === filtersKey ? Math.min(paging.page, lastPage) : 1
  const visibleLogs = filteredLogs.slice((page - 1) * pageSize, page * pageSize)
  const pagination = {
    page, pageSize, total: filteredLogs.length,
    setPage: (value) => setPaging({ page: Math.max(1, Math.min(value, lastPage)), pageSize, filtersKey }),
    setPageSize: (value) => setPaging({ page: 1, pageSize: value, filtersKey }),
    loading: resource.loading || resource.refreshing,
  }
  return { resource, summary, filteredLogs, visibleLogs, pagination, searchQuery, setSearchQuery, actionFilter, setActionFilter }
}
