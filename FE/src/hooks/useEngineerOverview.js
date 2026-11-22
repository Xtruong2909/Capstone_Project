import { useMemo, useState } from 'react'

export function buildEngineerOverview(dataset_files = []) {
  const ordered = [...dataset_files].sort((a, b) =>
    (Date.parse(b.updated_at || b.created_at) || 0) - (Date.parse(a.updated_at || a.created_at) || 0) ||
    String(b.file_id || '').localeCompare(String(a.file_id || ''))
  )
  const latest = new Map()
  for (const dataset_file of ordered) {
    if (dataset_file.dataset_id && !latest.has(dataset_file.dataset_id)) {
      latest.set(dataset_file.dataset_id, dataset_file)
    }
  }
  const datasets = [...latest.values()]
  const batches = new Map()
  for (const dataset of datasets) {
    const key = dataset.group_id || 'ungrouped'
    if (!batches.has(key)) {
      batches.set(key, {
        key, group_id: dataset.group_id || null, group_name: dataset.group_name || null,
        datasets: [],
      })
    }
    batches.get(key).datasets.push(dataset)
  }
  const recentBatches = [...batches.values()].map((batch) => {
    const statuses = new Set(batch.datasets.map((dataset) => dataset.approval_status))
    return {
      ...batch,
      datasetCount: batch.datasets.length,
      totalRecords: batch.datasets.every((dataset) => dataset.total_records != null)
        ? batch.datasets.reduce((sum, dataset) => sum + Number(dataset.total_records), 0)
        : null,
      approval_status: statuses.size === 1 ? [...statuses][0] : 'MIXED',
    }
  }).slice(0, 6)
  const count = (status) => datasets.filter((item) => item.approval_status === status).length
  const approvedCount = count('APPROVED')
  return {
    datasets,
    recentDatasets: datasets.slice(0, 6),
    recentBatches,
    totalDatasetsCount: datasets.length,
    approvedCount,
    pendingCount: count('SUBMITTED'),
    draftCount: count('PENDING'),
    rejectedCount: count('REJECTED'),
    // All stored dataset_files consume space, including older dataset_files.
    totalStorageBytes: dataset_files.reduce((sum, item) => sum + (Number(item.file_size_bytes) || 0), 0),
    approvalRatePct: datasets.length ? Math.round(100 * approvedCount / datasets.length) : 0,
  }
}

export function useEngineerOverview(dataset_files) {
  const overview = useMemo(() => buildEngineerOverview(dataset_files), [dataset_files])
  const [expandedBatchKey, setExpandedBatchKey] = useState(null)
  const toggleBatch = (key) => setExpandedBatchKey((current) => current === key ? null : key)
  return { ...overview, expandedBatchKey, toggleBatch }
}
