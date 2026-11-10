export function formatBytes(bytes) {
  if (bytes == null) return '-'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatNumber(value) {
  return value == null ? '-' : Number(value).toLocaleString('en-US')
}

// The API sends recording buckets with their source offset (for example, 09:30+03:00).
// Keep that wall-clock time instead of converting it to the browser's timezone.
function recordingDateParts(value) {
  if (typeof value !== 'string') return null
  return /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/.exec(value)
}

export function formatRecordingTime(value) {
  if (!value) return '—'
  const parts = recordingDateParts(value)
  if (parts) return `${parts[4]}:${parts[5]}`
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

// Use the recording's explicit offset for experiment timestamps stored in UTC.
// A recent feature or aggregation timestamp supplies that offset; without it,
// keep the API clock unchanged rather than guessing a timezone from the browser.
export function formatRecordingTimeAtSource(value, recordingReference) {
  if (!value || !recordingReference) return formatRecordingTime(value)
  const offset = /(Z|([+-])(\d{2}):(\d{2}))$/.exec(recordingReference)
  if (!offset || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) return formatRecordingTime(value)
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return formatRecordingTime(value)
  const offsetMinutes = offset[1] === 'Z'
    ? 0
    : (offset[2] === '-' ? -1 : 1) * (Number(offset[3]) * 60 + Number(offset[4]))
  const dayMinute = ((Math.floor(timestamp / 60000) + offsetMinutes) % 1440 + 1440) % 1440
  return `${String(Math.floor(dayMinute / 60)).padStart(2, '0')}:${String(dayMinute % 60).padStart(2, '0')}`
}

export function formatRecordingDateTime(value) {
  if (!value) return '—'
  const parts = recordingDateParts(value)
  if (parts) return `${parts[3]}/${parts[2]}/${parts[1]}, ${parts[4]}:${parts[5]}`
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString('en-GB', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
}

export function formatDate(iso) {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function extractErrorMessage(err, fallback) {
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((d) => d.msg || JSON.stringify(d)).join('; ')
  if (detail && typeof detail === 'object') {
    if (typeof detail.message === 'string') return detail.message
    if (typeof detail.detail === 'string') return detail.detail
  }
  return fallback
}
