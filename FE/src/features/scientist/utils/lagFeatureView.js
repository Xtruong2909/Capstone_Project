export const LAG_FEATURE_ORDER = ['lag_1', 'lag_2', 'lag_3', 'lag_4', 'lag_5']
export const LAG_TARGET_ORDER = ['target_h1', 'target_h3', 'target_h5']
export const LAG_HORIZONS = [1, 3, 5]

export function getLagValue(sample, key, index) {
  return sample?.features?.[key] ?? sample?.x?.[index]
}

export function getTargetValue(sample, key, index) {
  return sample?.targets?.[key] ?? sample?.y?.[index]
}

export function formatLagFlow(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  const number = Number(value)
  return Number.isInteger(number) ? String(number) : number.toFixed(2)
}

// This is the time covered by the returned valid samples, not the full source dataset.
export function getValidSampleTimeRange(samples, targetOrder = LAG_TARGET_ORDER) {
  let first = null
  let last = null

  for (const sample of samples) {
    const timestamps = [sample.history_start_time, sample.time_bucket,
      ...targetOrder.map((key) => sample.target_times?.[key])]
    for (const value of timestamps) {
      if (!value) continue
      const milliseconds = Date.parse(value)
      if (!Number.isFinite(milliseconds)) continue
      if (!first || milliseconds < first.milliseconds) first = { value, milliseconds }
      if (!last || milliseconds > last.milliseconds) last = { value, milliseconds }
    }
  }

  return first && last ? { start: first.value, end: last.value } : null
}
