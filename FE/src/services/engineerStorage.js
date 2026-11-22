import { authStorage } from './authStorage.js'

export function engineerStorageKey(key) {
  const userId = authStorage.read().user?.id
  return userId ? `${key}:${userId}` : null
}

export function readEngineerStorage(key, fallback = {}) {
  try {
    const scopedKey = engineerStorageKey(key)
    return scopedKey ? JSON.parse(localStorage.getItem(scopedKey) || 'null') ?? fallback : fallback
  } catch { return fallback }
}

export function writeEngineerStorage(key, value) {
  try {
    const scopedKey = engineerStorageKey(key)
    if (scopedKey) localStorage.setItem(scopedKey, JSON.stringify(value))
  } catch { /* A full or unavailable cache must not prevent the workflow. */ }
}
