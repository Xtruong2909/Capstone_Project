import { authStorage } from './authStorage.js'

let current = null

export function getScientistSession() {
  const { user, sessionScope } = authStorage.read()
  const scope = user?.id && sessionScope ? `${user.id}:${sessionScope}` : null
  if (!current || current.scope !== scope) {
    current = {
      scope,
      datasets: { approvedGroups: null, groupDatasets: new Map(), approvedDatasets: new Map(),
        datasetSessions: new Map(), datasetPreviews: new Map() },
      previewRequests: new Set(), experiments: null, experimentDetails: new Map(),
    }
  }
  return current
}

export function scientistWorkflowKey(groupId) {
  const { user } = authStorage.read()
  return groupId && user?.id ? `science-workflow:${user.id}:${groupId}` : null
}

export function readScientistWorkflow(key) {
  if (!key) return {}
  try { return JSON.parse(sessionStorage.getItem(key) || '{}') || {} }
  catch { return {} }
}

export function writeScientistWorkflow(key, value) {
  if (!key) return
  try { sessionStorage.setItem(key, JSON.stringify(value)) }
  catch { /* Server results remain available if browser storage is full. */ }
}
