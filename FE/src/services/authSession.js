export const PASSWORD_CHANGE_PATH = '/change-password'

const ROLE_PATHS = {
  admin: '/admin', data_engineer: '/engineer', data_scientist: '/scientist', business_user: '/business',
}

function hasLimitedToken(token) {
  try {
    const part = token?.split('.')[1]
    if (!part) return false
    const base64 = part.replaceAll('-', '+').replaceAll('_', '/')
    return JSON.parse(atob(base64)).pwd_change_only === true
  } catch {
    return false
  }
}

// Token claims only control navigation here. The API validates authorization.
export function requiresPasswordChange(user, token) {
  return user?.must_change_password === true || hasLimitedToken(token)
}

export function sessionUser(user, token, mustChangePassword) {
  if (!user || typeof user !== 'object' || Array.isArray(user)) return null
  const required = mustChangePassword === true || requiresPasswordChange(user, token)
  return {
    ...user,
    ...(user.role || user.role_id ? { role: user.role || user.role_id } : {}),
    ...(required || typeof mustChangePassword === 'boolean' ? { must_change_password: required } : {}),
  }
}

export function authenticatedPath(user, token) {
  if (requiresPasswordChange(user, token)) return PASSWORD_CHANGE_PATH
  return ROLE_PATHS[user?.role || user?.role_id] || '/'
}
