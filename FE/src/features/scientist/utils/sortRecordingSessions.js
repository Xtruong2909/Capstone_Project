function recordingStartKey(session, sessionsById) {
  const filename = sessionsById[session.session_id]?.original_filename || ''
  const match = /(?:^|[\\/])(\d{8})_d(?:\d+|[xX])_(\d{4})_(\d{4})(?=$|[_.])/.exec(filename)
  return match ? `${match[1]}${match[2]}${match[3]}` : null
}

export function sortRecordingSessions(sessions, sessionsById) {
  return [...sessions].sort((left, right) => {
    const leftKey = recordingStartKey(left, sessionsById)
    const rightKey = recordingStartKey(right, sessionsById)
    if (leftKey && rightKey) return leftKey.localeCompare(rightKey)
    if (leftKey) return -1
    if (rightKey) return 1
    return 0
  })
}
