import { invalidateAdminResourceCache } from './adminResourceCache.js'
import { sessionUser } from './authSession.js'

const TOKEN_KEY = 'access_token'
const USER_KEY = 'user_info'

export const authStorage = {
  read() {
    for (const storage of [sessionStorage, localStorage]) {
      try {
        const token = storage.getItem(TOKEN_KEY)
        const user = JSON.parse(storage.getItem(USER_KEY) || 'null')
        if (token && user && typeof user === 'object' && !Array.isArray(user)) {
          return { token, user: sessionUser(user, token) }
        }
      } catch {
        // Ignore malformed saved sessions instead of breaking the login page.
      }
    }
    return { token: null, user: null }
  },

  save({ access_token: token, user, must_change_password: mustChangePassword }, rememberMe) {
    this.clear()
    const storage = rememberMe ? localStorage : sessionStorage
    try {
      storage.setItem(TOKEN_KEY, token)
      storage.setItem(USER_KEY, JSON.stringify(sessionUser(user, token, mustChangePassword)))
    } catch (error) {
      this.clear()
      throw error
    }
  },

  replace(data) {
    const current = this.read()
    const rememberMe = Boolean(current.token && localStorage.getItem(TOKEN_KEY) === current.token)
    this.save(data, rememberMe)
  },

  clear() {
    invalidateAdminResourceCache()
    for (const storage of [sessionStorage, localStorage]) {
      storage.removeItem(TOKEN_KEY)
      storage.removeItem(USER_KEY)
    }
  },
}
