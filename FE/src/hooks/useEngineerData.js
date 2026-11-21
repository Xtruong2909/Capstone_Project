import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { adminError } from './useAdminData'
import { engineerService } from '../services/engineerService'
import { useAdminMutation, useAdminPage, useAdminResource } from './useAdminData'

// The resource and pagination hooks are shared by both administrative workspaces.
export { useAdminResource as useEngineerResource, useAdminPage as useEngineerPage, useAdminMutation as useEngineerMutation } from './useAdminData'

export function useEngineerBatchBrowser(groupId) {
  const [search, setSearch] = useState('')
  const filters = { search: search.trim() || undefined }
  const groups = useAdminPage(engineerService.listGroups, filters, !groupId)
  const datasets = useAdminPage(engineerService.listDatasets, { ...filters, group_id: groupId }, Boolean(groupId))
  return { search, setSearch, resource: groupId ? datasets : groups,
    groupName: datasets.data?.groups?.[0]?.group_name }
}

export function useEngineerJob(scope, upload = false) {
  const { user } = useAuth()
  const storageKey = 'de-job:' + user?.id + ':' + scope
  const [stored, setStored] = useState({ key: '', job: null })
  const [state, setState] = useState({ key: '', data: null, error: '', loading: false })
  const [revision, setRevision] = useState(0)
  let job = stored.key === storageKey ? stored.job : null
  if (stored.key !== storageKey) {
    try { job = JSON.parse(sessionStorage.getItem(storageKey) || 'null') } catch { /* Ignore invalid saved job IDs. */ }
  }
  const descriptor = JSON.stringify(job)
  const key = storageKey + ':' + descriptor
  useEffect(() => {
    const request = JSON.parse(descriptor)
    if (!request) return
    const controller = new AbortController()
    let timer
    const poll = async () => {
      try {
        const data = await (upload ? engineerService.getUploadJob : engineerService.getProcessingJob)(request, controller.signal)
        if (controller.signal.aborted) return
        setState({ key, data, error: '', loading: false })
        if (['PENDING', 'RUNNING', 'PROCESSING', 'QUEUED'].includes(data.status)) timer = setTimeout(poll, 1500)
      } catch (error) {
        if (!controller.signal.aborted) setState({ key, data: null, error: adminError(error), loading: false })
      }
    }
    poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [descriptor, key, revision, upload])
  const current = state.key === key ? state : { data: null, error: '', loading: Boolean(job) }
  const running = Boolean(job) && (current.loading || ['PENDING', 'RUNNING', 'PROCESSING', 'QUEUED'].includes(current.data?.status))
  return { ...current, running, reload: () => setRevision((value) => value + 1),
    track: (value) => {
      const next = value ? { job_id: value.job_id, ...(value.group_id ? { group_id: value.group_id } : {}) } : null
      try { if (next) sessionStorage.setItem(storageKey, JSON.stringify(next)); else sessionStorage.removeItem(storageKey) } catch { /* Tracking still works in memory. */ }
      setStored({ key: storageKey, job: next }); setRevision((value) => value + 1)
    },
  }
}

export function useEngineerPipeline(groupId) {
  const job = useEngineerJob('processing:' + groupId)
  const mutation = useAdminMutation()
  const params = { group_id: groupId, job_state: job.data?.job_id + ':' + job.data?.status }
  const status = useAdminResource(engineerService.getStatus, params, Boolean(groupId))
  const versions = useAdminResource(engineerService.getVersions, params, Boolean(groupId))
  const report = useAdminResource(engineerService.getReport, params, Boolean(groupId))
  const refresh = () => { status.reload(); versions.reload(); report.reload() }
  const process = (operation) => mutation.run(async () => {
    const next = await (operation === 'NORMALIZE' ? engineerService.normalize : engineerService.exportGroup)(groupId)
    job.track(next)
  })
  const submit = (comment) => mutation.run(() => engineerService.submit(groupId, comment), refresh)
  const resubmit = () => mutation.run(() => engineerService.resubmit(groupId), refresh)
  return { job, mutation, status, versions, report, refresh, process, submit, resubmit,
    busy: mutation.busy || job.running }
}

export function useEngineerMapping(groupId, onSaved) {
  const resource = useAdminResource(engineerService.getMapping, { group_id: groupId }, Boolean(groupId))
  const mutation = useAdminMutation()
  return { resource, mutation, save: (mappings) => mutation.run(() => engineerService.saveMapping(groupId, mappings), () => { resource.reload(); onSaved?.() }) }
}

export function useEngineerWizard(groupId) {
  const workflow = useEngineerPipeline(groupId)
  const [step, setStep] = useState(1)
  const [dirty, setDirty] = useState(false)
  const [mappingConfirmed, setMappingConfirmed] = useState(false)
  const [needsExport, setNeedsExport] = useState(false)
  const mapping = useEngineerMapping(groupId, () => {
    setDirty(false)
    setMappingConfirmed(true)
    setNeedsExport(true)
    workflow.job.track(null)
    workflow.mutation.clear()
    setStep(2)
  })
  const schemaReady = Boolean(mapping.resource.data) && !mapping.resource.loading && !mapping.resource.error && !dirty
  const savedMapping = mappingConfirmed || Boolean(mapping.resource.data?.mappings.length)
  const busy = workflow.busy || mapping.mutation.busy
  const job = workflow.job.data
  // An accepted export job also proves that the backend validated a completed normalization.
  const normalized = schemaReady && (job?.operation === 'EXPORT' || (job?.operation === 'NORMALIZE' && job.status === 'COMPLETED'))
  const exported = !dirty && !workflow.status.loading && !workflow.status.error && Boolean(workflow.status.data)
    && ((!needsExport && job?.operation !== 'NORMALIZE' && !workflow.job.running) || (job?.operation === 'EXPORT' && job.status === 'COMPLETED'))
  const available = [true, schemaReady && savedMapping, normalized, exported]
  return { ...workflow, mapping, step, busy, normalized, exported, available,
    goTo: (next) => { if (!busy && available[next - 1]) setStep(next) },
    markDirty: () => { setDirty(true); setNeedsExport(true) },
    process: async (operation) => {
      if (busy || (operation === 'NORMALIZE' ? !available[1] : !normalized)) return
      const success = await workflow.process(operation)
      if (success) setNeedsExport(true)
    },
    refresh: () => { workflow.refresh(); mapping.resource.reload(); workflow.job.reload() },
  }
}
