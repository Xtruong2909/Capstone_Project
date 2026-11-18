import assert from 'node:assert/strict'
import test from 'node:test'
import { sortRecordingSessions } from './sortRecordingSessions.js'

test('sessions follow recording date and start time, including 08:30 first', () => {
  const sessions = ['09:00', 'next day', '09:30', '08:30', '10:00'].map((session_id) => ({ session_id }))
  const sessionsById = {
    '09:00': { original_filename: '20181024_d1_0900_0930.csv' },
    'next day': { original_filename: '20181029_d1_0830_0900.csv' },
    '09:30': { original_filename: '20181024_d1_0930_1000.csv' },
    '08:30': { original_filename: '20181024_d1_0830_0900.csv' },
    '10:00': { original_filename: '20181024_d1_1000_1030.csv' },
  }

  assert.deepEqual(sortRecordingSessions(sessions, sessionsById).map((session) => session.session_id), [
    '08:30', '09:00', '09:30', '10:00', 'next day',
  ])
  assert.equal(sessions[0].session_id, '09:00')
})
