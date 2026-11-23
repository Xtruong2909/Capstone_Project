import { invalidateAdminResourceCache } from './adminResourceCache.js'
import { sessionUser } from './authSession.js'

let current = { user: null, csrfToken: null, sessionScope: null }
let generation = 0
const listeners = new Set()

function removeLegacyCredentials() {
  for (const name of ['localStorage', 'sessionStorage']) {
    try {
      globalThis[name]?.removeItem('access_token')
      globalThis[name]?.removeItem('user_info')
    } catch { /* Restricted browser storage must not prevent cookie authentication. */ }
  }
}

function notify() {
  for (const listener of listeners) listener(current)
}

// The session credential is an HttpOnly cookie; user data and CSRF nonce stay in memory.
export const authStorage = {
  read() {
    removeLegacyCredentials()
    return current
  },
  save({ user, csrf_token: csrfToken, must_change_password: mustChangePassword }) {
    removeLegacyCredentials()
    invalidateAdminResourceCache()
    current = {
      user: sessionUser(user, null, mustChangePassword), csrfToken,
      sessionScope: `session-${++generation}`,
    }
    notify()
  },
  replace(data) { this.save(data) },
  clear() {
    removeLegacyCredentials()
    invalidateAdminResourceCache()
    current = { user: null, csrfToken: null, sessionScope: null }
    notify()
  },
  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
