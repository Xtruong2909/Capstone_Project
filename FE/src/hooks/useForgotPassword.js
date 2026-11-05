import { useEffect, useRef, useState } from 'react'
import { authService } from '../services/authService'

function errorMessage(error) {
  const detail = error.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((item) => item.msg).join('. ')
  return error.response ? 'Unable to complete this request. Please try again.' : 'Cannot connect to the server. Please check your connection and try again.'
}

export function useForgotPassword() {
  const [step, setStep] = useState('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [resetToken, setResetToken] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [resendAt, setResendAt] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const busy = useRef(false)
  const generation = useRef(0)

  useEffect(() => () => { generation.current += 1 }, [])
  useEffect(() => {
    if (!resendAt) return undefined
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)))
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [resendAt])

  const run = async (operation) => {
    if (busy.current) return
    busy.current = true
    const current = generation.current
    setIsLoading(true)
    setError('')
    setNotice('')
    const isCurrent = () => current === generation.current
    try {
      await operation(isCurrent)
    } catch (err) {
      if (isCurrent()) setError(errorMessage(err))
    } finally {
      if (isCurrent()) {
        busy.current = false
        setIsLoading(false)
      }
    }
  }

  const sendCode = () => {
    if (secondsLeft > 0) return
    const normalizedEmail = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address.')
      return
    }
    return run(async (isCurrent) => {
      await authService.forgotPassword(normalizedEmail)
      if (!isCurrent()) return
      setEmail(normalizedEmail)
      setOtp('')
      setResetToken('')
      setStep('otp')
      setSecondsLeft(60)
      setResendAt(Date.now() + 60000)
      setNotice('A new 6-digit code has been sent. Check your inbox and spam folder.')
    })
  }

  const verifyCode = () => {
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the 6-digit code from your email.')
      return
    }
    return run(async (isCurrent) => {
      const data = await authService.verifyOtp(email, otp)
      if (!isCurrent()) return
      if (!data.reset_token) {
        setError('Verification could not be completed. Please request a new code.')
        return
      }
      setResetToken(data.reset_token)
      setOtp('')
      setStep('password')
    })
  }

  const savePassword = () => {
    if (password.length < 6 || password.length > 128) {
      setError('Use between 6 and 128 characters for your password.')
      return
    }
    if (password !== confirmation) {
      setError('Passwords do not match.')
      return
    }
    if (!resetToken) {
      setStep('otp')
      setError('Please verify your email code again.')
      return
    }
    return run(async (isCurrent) => {
      try {
        await authService.resetPassword(email, resetToken, password)
      } catch (err) {
        if (isCurrent() && err.response?.status === 400) {
          setResetToken('')
          setPassword('')
          setConfirmation('')
          setStep('otp')
        }
        throw err
      }
      if (!isCurrent()) return
      setPassword('')
      setConfirmation('')
      setResetToken('')
      setShowPassword(false)
      setStep('success')
    })
  }

  const changeEmail = () => {
    if (busy.current) return
    setStep('email')
    setOtp('')
    setResetToken('')
    setPassword('')
    setConfirmation('')
    setError('')
    setNotice('')
    setResendAt(0)
    setSecondsLeft(0)
  }

  return {
    step, email, setEmail, otp, setOtp, password, setPassword, confirmation, setConfirmation,
    showPassword, setShowPassword, isLoading, error, notice, secondsLeft,
    sendCode, verifyCode, savePassword, changeEmail,
  }
}
