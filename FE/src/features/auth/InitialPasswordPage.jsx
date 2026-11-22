import { Navigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useInitialPasswordChange } from '../../hooks/useInitialPasswordChange'
import { useLanguage } from '../../hooks/useLanguage'
import { authenticatedPath } from '../../services/authSession'
import './InitialPasswordPage.css'

export default function InitialPasswordPage() {
  const { user, token, isAuthenticated, mustChangePassword, logout } = useAuth()
  const { t } = useLanguage()
  const form = useInitialPasswordChange()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!mustChangePassword) return <Navigate to={authenticatedPath(user, token)} replace />
  return <main className="initial-password-page">
    <section className="initial-password-card" aria-labelledby="initial-password-title">
      <div className="initial-password-icon"><ShieldCheck size={28} /></div>
      <h1 id="initial-password-title">{t('Set your new password')}</h1>
      <p>{t('Your account was created by an administrator. Set a new password before continuing.')}</p>
      <div className="initial-password-account">{user?.email}</div>
      <form onSubmit={form.submit} aria-busy={form.isSubmitting} noValidate>
        <fieldset disabled={form.isSubmitting}>
          <label htmlFor="initial-new-password">{t('New password')}</label>
          <div className="initial-password-input">
            <LockKeyhole size={18} />
            <input id="initial-new-password" type={form.showPassword ? 'text' : 'password'} autoComplete="new-password"
              minLength={12} maxLength={128} value={form.password} onChange={(event) => form.setPassword(event.target.value)}
              aria-describedby="initial-password-hint" required />
            <button type="button" onClick={form.togglePassword} aria-pressed={form.showPassword} aria-label={t(form.showPassword ? 'Hide passwords' : 'Show passwords')}>
              {form.showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <small id="initial-password-hint">{t('Use 12–128 characters and choose a different password from the temporary one in your email.')}</small>
          <label htmlFor="initial-confirm-password">{t('Confirm new password')}</label>
          <div className="initial-password-input">
            <LockKeyhole size={18} />
            <input id="initial-confirm-password" type={form.showPassword ? 'text' : 'password'} autoComplete="new-password"
              minLength={12} maxLength={128} value={form.confirmation} onChange={(event) => form.setConfirmation(event.target.value)} required />
          </div>
          {form.error && <p className="initial-password-error" role="alert">{t(form.error)}</p>}
          <button type="submit" className="initial-password-submit">
            {form.isSubmitting && <Loader2 size={18} className="initial-password-spinner" />}
            {t(form.isSubmitting ? 'Saving new password...' : 'Save password and continue')}
          </button>
        </fieldset>
      </form>
      <button type="button" className="initial-password-logout" disabled={form.isSubmitting} onClick={logout}>{t('Sign out')}</button>
    </section>
  </main>
}
