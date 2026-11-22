import { useCallback } from 'react'
import { adminService } from '../services/adminService'
import { authStorage } from '../services/authStorage'
import { loadAdminResource } from '../services/adminResourceCache'

const ROUTE_RESOURCES = {
  '/admin': [adminService.getOverviewData, {}],
  '/admin/users': [adminService.getUserManagementData, {}],
  '/admin/datasets': [adminService.getDatasets, { limit: 100 }],
  '/admin/datasets-available': [adminService.getDatasetGroups, { approval_status: 'APPROVED', page: 1, page_size: 20 }],
  '/admin/audit-logs': [adminService.getAuditLogs, {}],
}

export function useAdminNavigation() {
  return useCallback((path) => {
    const scope = authStorage.read().token
    const resource = ROUTE_RESOURCES[path]
    if (!scope || !resource) return
    const [load, params] = resource
    loadAdminResource(scope, load, JSON.stringify(params), (signal) => load(params, signal)).catch(() => {
      // The destination page handles its own errors and retry controls.
    })
  }, [])
}
