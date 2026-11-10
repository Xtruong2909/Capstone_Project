import test from 'node:test'
import assert from 'node:assert/strict'
import { formatRecordingDateTime } from './formatters.js'
import {
  getLagValue, getTargetValue, getValidSampleTimeRange,
  LAG_FEATURE_ORDER, LAG_TARGET_ORDER,
} from './lagFeatureView.js'

test('Lag and Target columns use the API order without mixing future values into X', () => {
  const sample = {
    features: { lag_1: 50, lag_2: 40, lag_3: 30, lag_4: 20, lag_5: 10 },
    targets: { target_h1: 60, target_h3: 80, target_h5: 100 },
  }
  assert.deepEqual(LAG_FEATURE_ORDER.map((key, index) => getLagValue(sample, key, index)), [50, 40, 30, 20, 10])
  assert.deepEqual(LAG_TARGET_ORDER.map((key, index) => getTargetValue(sample, key, index)), [60, 80, 100])
})

test('sample range covers actual history and target timestamps across source offsets', () => {
  const samples = [{
    history_start_time: '2018-10-24T09:30:00+03:00',
    time_bucket: '2018-10-24T09:34:00+03:00',
    target_times: {
      target_h1: '2018-10-24T09:35:00+03:00',
      target_h3: '2018-10-24T09:37:00+03:00',
      target_h5: '2018-10-24T09:39:00+03:00',
    },
  }, {
    history_start_time: '2018-10-24T06:40:00Z',
    time_bucket: '2018-10-24T06:44:00Z',
    target_times: {
      target_h1: '2018-10-24T06:45:00Z',
      target_h3: '2018-10-24T06:47:00Z',
      target_h5: '2018-10-24T06:49:00Z',
    },
  }]
  assert.deepEqual(getValidSampleTimeRange(samples), {
    start: samples[0].history_start_time,
    end: samples[1].target_times.target_h5,
  })
  assert.equal(getValidSampleTimeRange([]), null)
  assert.equal(formatRecordingDateTime(samples[0].target_times.target_h1), '24/10/2018, 09:35')
})
