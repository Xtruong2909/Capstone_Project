const MINUTE_MS = 60_000
const HORIZONS = [1, 3, 5]

// Chart data comes from the aggregation API. A window needs five actual,
// consecutive one-minute observations from the same dataset version and ROI.
export function buildPredictionLagWindows(chart) {
  const times = chart?.time_labels || []
  const flows = chart?.traffic_flow || []
  const windows = []
  let segment = []

  for (let index = 0; index < times.length; index += 1) {
    const timestamp = Date.parse(times[index])
    const flow = Number(flows[index])
    if (!Number.isFinite(timestamp) || flows[index] == null || !Number.isFinite(flow) || flow < 0) {
      segment = []
      continue
    }

    if (segment.length && timestamp - segment[segment.length - 1].timestamp !== MINUTE_MS) {
      segment = []
    }
    segment.push({ timestamp, time: times[index], flow })
    if (segment.length > 5) segment = segment.slice(-5)
    if (segment.length < 5) continue

    windows.push({
      historyStartTime: segment[0].time,
      originTime: segment[4].time,
      x: [...segment].reverse().map((point) => point.flow),
      targetTimes: HORIZONS.map((horizon) => new Date(timestamp + horizon * MINUTE_MS).toISOString()),
    })
  }

  return windows
}

export function matchesPredictionFeature(window, featureData) {
  if (!window || !featureData || Date.parse(window.originTime) !== Date.parse(featureData.latest_time_bucket)) {
    return false
  }
  const x = featureData.x || []
  return x.length === window.x.length && x.every((value, index) =>
    Math.abs(Number(value) - window.x[index]) < 1e-6
  )
}
