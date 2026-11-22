export function readWizardStep(storageKey) {
  if (!storageKey) return null
  try { return JSON.parse(localStorage.getItem(storageKey) || 'null') }
  catch { return null }
}

export function saveWizardStep(storageKey, value) {
  if (!storageKey) return
  try { localStorage.setItem(storageKey, JSON.stringify(value)) }
  catch { /* The server state still restores the workflow if storage is unavailable. */ }
}

export function resolveWizardStep(pipeline, saved, available, job) {
  if (!pipeline) return 1
  if (job && ['PENDING', 'RUNNING'].includes(job.status)) return job.operation === 'EXPORT' ? 3 : 2
  if (saved?.sourceKey === pipeline.source_key && Number.isInteger(saved.step)
    && saved.step >= 1 && saved.step <= 4 && available[saved.step - 1]) return saved.step
  return pipeline.step || 1
}

export function getProcessingAvailability({ busy, normalized, exported, schemaReady }) {
  return {
    canNormalize: !busy && Boolean(schemaReady) && !normalized && !exported,
    canExport: !busy && Boolean(normalized) && !exported,
  }
}
