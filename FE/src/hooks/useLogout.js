import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth'

export function useLogout() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const request = useRef(null)
  useEffect(() => {
    const guard = { active: true, busy: false }
    request.current = guard
    return () => { guard.active = false }
  }, [])

  const handleLogout = async () => {
    const guard = request.current
    if (!guard?.active || guard.busy) return
    guard.busy = true
    setIsLoggingOut(true)
    try {
      // The server revokes the cookie session before the UI redirects.
      await logout()
      if (guard.active) navigate('/login', { replace: true })
    } catch {
      // AuthProvider displays the failure; keep the user on the current page.
    } finally {
      guard.busy = false
      if (guard.active) setIsLoggingOut(false)
    }
  }
  return { handleLogout, isLoggingOut }
}
