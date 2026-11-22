import { useRef, useState } from 'react'
import { useAuth } from './useAuth'

function passwordError(error) {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((item) => item.msg).join('; ')
  return error?.message || 'Password change could not be completed. Please try again.'
}

export function useInitialPasswordChange() {
  const { changeInitialPassword } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const submit = async (event) => {
    event.preventDefault()
    if (pending.current) return
    setError('')
    if (password.length < 12 || password.length > 128) {
      setError('Your new password must contain 12–128 characters.')
      return
    }
    if (password !== confirmation) {
      setError('The passwords do not match.')
      return
    }
    pending.current = true
    setIsSubmitting(true)
    try {
      await changeInitialPassword(password)
      setPassword('')
      setConfirmation('')
    } catch (err) {
      setError(passwordError(err))
    } finally {
      pending.current = false
      setIsSubmitting(false)
    }
  }
  return { password, confirmation, showPassword, isSubmitting, error, submit,
    setPassword: (value) => { if (!pending.current) setPassword(value) },
    setConfirmation: (value) => { if (!pending.current) setConfirmation(value) },
    togglePassword: () => setShowPassword((value) => !value),
  }
}
