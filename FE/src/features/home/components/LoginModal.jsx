import { useEffect, useState } from 'react'
import { X, Mail, Lock } from 'lucide-react'
import Logo from './Logo'

// UI-only login dialog (SCR-01). Wire to src/services/authService when the auth API is connected.
export default function LoginModal({ isOpen, onClose }) {
  const [mode, setMode] = useState('login') // 'login' | 'reset'

  useEffect(() => {
    if (!isOpen) return undefined
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const isLogin = mode === 'login'

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__box" role="dialog" aria-modal="true" aria-labelledby="auth-title" onClick={(e) => e.stopPropagation()}>
        <button className="modal__close" aria-label="Close" onClick={onClose}><X size={18} /></button>
        <Logo />
        <h2 id="auth-title">{isLogin ? 'Welcome back' : 'Reset password'}</h2>
        <p>{isLogin ? 'Sign in to access your role-based dashboard.' : 'Enter your email and we will send you a reset link.'}</p>

        <form onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="auth-email">Email</label>
          <div className="field"><Mail size={16} /><input id="auth-email" type="email" placeholder="you@example.com" required /></div>
          {isLogin && (
            <>
              <label htmlFor="auth-password">Password</label>
              <div className="field"><Lock size={16} /><input id="auth-password" type="password" placeholder="••••••••" required /></div>
            </>
          )}
          <button id="auth-submit" type="submit" className="btn btn--primary btn--lg btn--block">
            {isLogin ? 'Sign in' : 'Send reset link'}
          </button>
        </form>

        <button className="modal__link" onClick={() => setMode(isLogin ? 'reset' : 'login')}>
          {isLogin ? 'Forgot password?' : 'Back to sign in'}
        </button>
      </div>
    </div>
  )
}
