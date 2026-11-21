import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPredictionLagWindows, matchesPredictionFeature } from './predictionLagWindows.js'

test('19 consecutive minute buckets produce 15 five-lag windows', () => {
  const chart = {
    time_labels: Array.from({ length: 19 }, (_, index) =>
      new Date(Date.parse('2018-10-24T09:30:00+03:00') + index * 60_000).toISOString()
    ),
    traffic_flow: Array.from({ length: 19 }, (_, index) => index + 1),
  }
  const windows = buildPredictionLagWindows(chart)
  assert.equal(windows.length, 15)
  assert.deepEqual(windows.at(-1).x, [19, 18, 17, 16, 15])
  assert.equal(matchesPredictionFeature(windows.at(-1), {
    latest_time_bucket: '2018-10-24T09:48:00+03:00',
    x: [19, 18, 17, 16, 15],
  }), true)
})

test('missing or invalid flow breaks a consecutive window', () => {
  const chart = {
    time_labels: Array.from({ length: 11 }, (_, index) =>
      new Date(Date.parse('2018-10-24T09:30:00+03:00') + index * 60_000).toISOString()
    ),
    traffic_flow: [1, 2, 3, 4, 5, null, 7, 8, 9, 10, 11],
  }
  const windows = buildPredictionLagWindows(chart)
  assert.equal(windows.length, 2)
  assert.deepEqual(windows.map((window) => window.x), [[5, 4, 3, 2, 1], [11, 10, 9, 8, 7]])
})
