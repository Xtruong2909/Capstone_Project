const TOKEN_KEY = 'access_token'
const USER_KEY = 'user_info'

export const authStorage = {
  read() {
    for (const storage of [sessionStorage, localStorage]) {
      try {
        const token = storage.getItem(TOKEN_KEY)
        const user = JSON.parse(storage.getItem(USER_KEY) || 'null')
        if (token && user && typeof user === 'object' && !Array.isArray(user)) {
          return { token, user }
        }
      } catch {
        // Ignore malformed saved sessions instead of breaking the login page.
      }
    }
    return { token: null, user: null }
  },

  save({ access_token: token, user }, rememberMe) {
    this.clear()
    const storage = rememberMe ? localStorage : sessionStorage
    try {
      storage.setItem(TOKEN_KEY, token)
      storage.setItem(USER_KEY, JSON.stringify(user))
    } catch (error) {
      this.clear()
      throw error
    }
  },

  clear() {
    for (const storage of [sessionStorage, localStorage]) {
      storage.removeItem(TOKEN_KEY)
      storage.removeItem(USER_KEY)
    }
  },
}
