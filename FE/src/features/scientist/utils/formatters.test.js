import assert from 'node:assert/strict'
import test from 'node:test'
import { formatRecordingDateTime, formatRecordingTime, formatRecordingTimeAtSource } from './formatters.js'

test('recording timestamps retain the clock and date sent by the API', () => {
  assert.equal(formatRecordingTime('2018-10-24T09:30:00+03:00'), '09:30')
  assert.equal(formatRecordingTime('2018-10-24T09:48:00+03:00'), '09:48')
  assert.equal(formatRecordingDateTime('2018-10-24T09:30:00+03:00'), '24/10/2018, 09:30')
  assert.equal(formatRecordingTime('2018-10-29T09:30:00+02:00'), '09:30')
})

test('experiment UTC timestamps use the recording offset', () => {
  const reference = '2018-10-24T09:30:00+03:00'
  assert.equal(formatRecordingTimeAtSource('2018-10-24T06:44:00Z', reference), '09:44')
  assert.equal(formatRecordingTimeAtSource('2018-10-24T09:44:00+03:00', reference), '09:44')
  assert.equal(formatRecordingTimeAtSource('2018-10-29T07:44:00Z', '2018-10-29T09:30:00+02:00'), '09:44')
  assert.equal(formatRecordingTimeAtSource('2018-10-24T06:44:00Z', null), '06:44')
})
