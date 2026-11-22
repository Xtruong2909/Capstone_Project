import { useState } from 'react'
import { useAuth } from './useAuth'
import { useEngineerResource } from './useEngineerData'
import { engineerService } from '../services/engineerService'

export function buildNormalizationOverview(files = [], mapping, job, report) {
  const results = new Map((job?.results || []).map((row) => [row.dataset_id, row]))
  const reports = new Map((report?.reports || []).map((row) => [row.dataset_id, row]))
  const sources = files.length ? files : (job?.results || [])
  const exported = job?.operation === 'EXPORT'
  const rows = sources.map((file) => {
    const result = results.get(file.dataset_id)
    const saved = reports.get(file.dataset_id)
    const finishedExport = exported && result?.status === 'COMPLETED'
    return {
      datasetId: file.dataset_id, name: file.dataset_name,
      sessions: file.source_session_count ?? result?.session_count ?? null,
      status: exported ? 'COMPLETED' : result?.status || 'PENDING',
      before: exported ? (finishedExport ? saved?.records_before ?? result?.records_before ?? null : null)
        : result?.records_before ?? null,
      after: exported ? (finishedExport ? result?.records_after ?? saved?.records_after ?? null : null)
        : result?.records_after ?? null,
      error: exported ? null : result?.error_message,
      canPreview: result?.status === 'COMPLETED',
    }
  })
  const completed = rows.filter((row) => row.status === 'COMPLETED').length
  const failed = rows.filter((row) => row.status === 'FAILED').length
  return { rows, completed, failed, total: rows.length || mapping?.dataset_count || 0,
    sessionCount: mapping?.session_count ?? (rows.every((row) => row.sessions != null)
      ? rows.reduce((sum, row) => sum + row.sessions, 0) : null),
    groupName: files[0]?.group_name,
    running: job?.operation === 'NORMALIZE' && ['PENDING', 'RUNNING'].includes(job.status),
  }
}

export function useEngineerNormalization(groupId, workflow) {
  const { user } = useAuth()
  const [selected, setSelected] = useState(null)
  const job = workflow.job.data
  const overview = buildNormalizationOverview(workflow.dataset_files.data?.dataset_files,
    workflow.mapping.resource.data, job, workflow.report.data)
  const ready = overview.rows.filter((row) => row.canPreview)
  const datasetId = ready.some((row) => row.datasetId === selected) ? selected : ready[0]?.datasetId
  const preview = useEngineerResource(engineerService.getNormalizationPreview,
    { group_id: groupId, job_id: job?.job_id, dataset_id: datasetId, account_id: user?.id }, Boolean(datasetId && job?.job_id))
  return { ...overview, ready, datasetId, setSelected, preview }
}
