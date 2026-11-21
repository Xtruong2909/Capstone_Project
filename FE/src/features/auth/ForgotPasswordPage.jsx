import { Link } from 'react-router-dom'
import { Mail, ArrowLeft, ArrowRight, Check, CheckCircle2, ShieldCheck, LockKeyhole, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useForgotPassword } from '../../hooks/useForgotPassword'
import { useLanguage } from '../../hooks/useLanguage'
import './LoginPage.css'
import './ForgotPasswordPage.css'

const STEPS = ['Email address', 'Verify code', 'New password']

export default function ForgotPasswordPage() {
  const { t } = useLanguage()
  const recovery = useForgotPassword()
  const { step, isLoading, email, secondsLeft } = recovery
  const stepIndex = { email: 0, otp: 1, password: 2, success: 3 }[step]
  const titles = { email: 'Forgot your password?', otp: 'Check your inbox', password: 'Create a new password', success: 'You’re all set!' }
  const descriptions = {
    email: 'Enter the email linked to your account. We’ll send you a code to verify it’s you.',
    otp: `Enter the 6-digit code sent to ${email}. The code expires in 5 minutes.`,
    password: 'Choose a new password for your account. Use at least 6 characters.',
    success: 'Your password has been updated. You can now sign in with your new password.',
  }
  const submit = (event) => {
    event.preventDefault()
    if (step === 'email') recovery.sendCode()
    else if (step === 'otp') recovery.verifyCode()
    else if (step === 'password') recovery.savePassword()
  }

  return (
    <div className="login-page recovery-page">
      <div className="login-card">
        <section className="login-brand-panel">
          <div className="brand-overlay">
            <div className="brand-logo">
              <div className="brand-logo-mark">A</div>
              <div><h1>Urban Traffic</h1><h2>Analytics</h2><span>{t('Traffic Dataset Management & Forecasting')}</span></div>
            </div>
            <div className="brand-content">
              <div className="recovery-brand-icon"><ShieldCheck size={30} /></div>
              <h3>{t('Let’s get you')}<br />{t('back on track.')}</h3>
              <p>{t('Recover access to your workspace in three simple steps. Your datasets and insights will be ready when you return.')}</p>
            </div>
            <div className="recovery-brand-note"><LockKeyhole size={16} /> {t('Email verification keeps your account protected.')}</div>
          </div>
        </section>

        <section className="login-form-panel">
          <Link className="login-back-home recovery-back" to="/login"><ArrowLeft size={15} /> {t('Back to Sign In')}</Link>
          <div className="login-form-content recovery-content">
            <ol className="recovery-steps" aria-label={t('Password recovery progress')}>
              {STEPS.map((label, index) => (
                <li key={label} className={index <= stepIndex ? 'is-active' : ''} aria-current={index === stepIndex ? 'step' : undefined}>
                  <span>{index < stepIndex ? <Check size={14} /> : index + 1}</span>{t(label)}
                </li>
              ))}
            </ol>
            <div className={`recovery-icon ${step === 'success' ? 'recovery-icon--success' : ''}`}>
              {step === 'success' ? <CheckCircle2 size={30} /> : step === 'password' ? <LockKeyhole size={28} /> : <Mail size={28} />}
            </div>
            <h2>{t(titles[step])}</h2>
            <p className="login-description">{t(descriptions[step])}</p>

            {recovery.error && <p className="login-error" role="alert">{recovery.error}</p>}
            {recovery.notice && <p className="recovery-notice" role="status">{recovery.notice}</p>}

            {step === 'success' ? (
              <Link className="login-submit recovery-submit" to="/login">{t('Back to Sign In')} <ArrowRight size={18} /></Link>
            ) : (
              <form onSubmit={submit} aria-busy={isLoading}>
                {step === 'email' && (
                  <div className="form-group">
                    <label htmlFor="recovery-email">{t('Email address')}</label>
                    <div className="input-wrapper"><Mail size={18} />
                      <input id="recovery-email" type="email" autoComplete="email" value={email} onChange={(event) => recovery.setEmail(event.target.value)} placeholder="you@example.com" required disabled={isLoading} />
                    </div>
                  </div>
                )}
                {step === 'otp' && (
                  <div className="form-group">
                    <label htmlFor="recovery-otp">{t('Verification code')}</label>
                    <input key="otp" autoFocus id="recovery-otp" className="recovery-otp" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={recovery.otp} onChange={(event) => recovery.setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" aria-describedby="otp-hint" required disabled={isLoading} />
                    <p id="otp-hint" className="recovery-hint">{t('You can paste the full code from your email.')}</p>
                  </div>
                )}
                {step === 'password' && (
                  <>
                    <div className="form-group">
                      <label htmlFor="recovery-password">{t('New password')}</label>
                      <div className="input-wrapper"><LockKeyhole size={18} />
                        <input key="password" autoFocus id="recovery-password" type={recovery.showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={6} maxLength={128} value={recovery.password} onChange={(event) => recovery.setPassword(event.target.value)} required disabled={isLoading} aria-describedby="password-hint" />
                        <button type="button" className="password-toggle" aria-label={t(recovery.showPassword ? 'Hide passwords' : 'Show passwords')} aria-pressed={recovery.showPassword} onClick={() => recovery.setShowPassword(!recovery.showPassword)}>{recovery.showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                      </div>
                      <p id="password-hint" className="recovery-hint">{t('6–128 characters. A longer, unique password is best.')}</p>
                    </div>
                    <div className="form-group">
                      <label htmlFor="recovery-confirmation">{t('Confirm new password')}</label>
                      <div className="input-wrapper"><LockKeyhole size={18} />
                        <input id="recovery-confirmation" type={recovery.showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={6} maxLength={128} value={recovery.confirmation} onChange={(event) => recovery.setConfirmation(event.target.value)} required disabled={isLoading} />
                      </div>
                    </div>
                  </>
                )}
                <button type="submit" className="login-submit recovery-submit" disabled={isLoading}>
                  {isLoading ? <><Loader2 className="recovery-spinner" size={18} /> {t('Please wait...')}</> : <>{t(step === 'email' ? 'Send verification code' : step === 'otp' ? 'Verify code' : 'Reset password')}<ArrowRight size={18} /></>}
                </button>
                {step === 'otp' && (
                  <div className="recovery-resend">
                    <span>{t('Didn’t receive a code?')}</span>
                    <button type="button" disabled={isLoading || secondsLeft > 0} onClick={recovery.sendCode}>{secondsLeft > 0 ? t(`Resend in ${secondsLeft}s`) : t('Resend code')}</button>
                  </div>
                )}
                {step !== 'email' && <button type="button" className="recovery-change" disabled={isLoading} onClick={recovery.changeEmail}>{t('Use a different email')}</button>}
              </form>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
