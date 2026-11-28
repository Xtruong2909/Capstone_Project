const HORIZONS = [1, 3, 5]

const mean = values => values.length && values.every(Number.isFinite)
  ? values.reduce((sum, value) => sum + value, 0) / values.length : null

export function validationSessionMetrics(predictions) {
  const sessions = new Map()
  for (const row of predictions) {
    if (row.model !== 'RANDOM_FOREST' || !row.session_id
      || row.actual_traffic_flow == null || row.predicted_traffic_flow == null) continue
    const actual = Number(row.actual_traffic_flow)
    const predicted = Number(row.predicted_traffic_flow)
    const horizon = Number(row.horizon_minutes ?? row.forecast_horizon)
    if (!Number.isFinite(actual) || !Number.isFinite(predicted) || !HORIZONS.includes(horizon)) continue
    if (!sessions.has(row.session_id)) sessions.set(row.session_id, new Map())
    const totals = sessions.get(row.session_id)
    const total = totals.get(horizon) || { count: 0, absolute: 0, squared: 0 }
    total.count++
    total.absolute += Math.abs(actual - predicted)
    total.squared += (actual - predicted) ** 2
    totals.set(horizon, total)
  }
  const rows = [...sessions].map(([sessionId, totals]) => {
    const horizons = Object.fromEntries(HORIZONS.map(horizon => {
      const total = totals.get(horizon)
      return [horizon, total ? { count: total.count, mae: total.absolute / total.count,
        rmse: Math.sqrt(total.squared / total.count) } : null]
    }))
    return { sessionId, horizons, meanMae: mean(HORIZONS.map(h => horizons[h]?.mae)),
      meanRmse: mean(HORIZONS.map(h => horizons[h]?.rmse)) }
  })
  const averages = Object.fromEntries(HORIZONS.map(horizon => {
    const metrics = rows.map(row => row.horizons[horizon]).filter(Boolean)
    return [horizon, { mae: mean(metrics.map(metric => metric.mae)),
      rmse: mean(metrics.map(metric => metric.rmse)) }]
  }))
  return { rows, averages, meanMae: mean(rows.map(row => row.meanMae)),
    meanRmse: mean(rows.map(row => row.meanRmse)) }
}
