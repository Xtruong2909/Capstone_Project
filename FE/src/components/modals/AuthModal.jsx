import React, { useState } from 'react';
import { 
  X, 
  Mail, 
  Lock, 
  User, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle,
  Eye, 
  EyeOff 
} from 'lucide-react';
import { useLanguage } from '../../context';

export default function AuthModal({ isOpen, onClose, initialMode = 'login', onAuthSuccess, onOpenLegal }) {
  const { t } = useLanguage();
  const [mode, setMode] = useState(initialMode); // 'login' or 'register'
  const [forgotStep, setForgotStep] = useState('email');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errors, setErrors] = useState({});

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [otp, setOtp] = useState('');
  const [demoOtp, setDemoOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  if (!isOpen) return null;

  const validate = () => {
    const newErrors = {};

    if (mode === 'register') {
      if (!fullName.trim()) {
        newErrors.fullName = t('auth.errFullName');
      }
    }

    if (!email.trim()) {
      newErrors.email = t('auth.errEmailEmpty');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = t('auth.errEmailInvalid');
    } else if (forgotStep === 'email' && !email.toLowerCase().endsWith('@gmail.com')) {
      newErrors.email = t('auth.errGmailOnly');
    }

    if (!password) {
      newErrors.password = t('auth.errPassEmpty');
    } else if (password.length < 6) {
      newErrors.password = t('auth.errPassLength');
    }

    if (mode === 'register') {
      if (!confirmPassword) {
        newErrors.confirmPassword = t('auth.errConfirmPassEmpty');
      } else if (password !== confirmPassword) {
        newErrors.confirmPassword = t('auth.errPassMismatch');
      }
    }

    if (mode === 'register' && !agreeTerms) {
      newErrors.terms = t('auth.errTerms');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleModeChange = (newMode) => {
    setMode(newMode);
    setForgotStep('email');
    setErrors({});
    setSuccessMsg('');
    setConfirmPassword('');
    setOtp('');
    setDemoOtp('');
    setNewPassword('');
    setConfirmNewPassword('');
  };

  const handleForgotSubmit = (e) => {
    e.preventDefault();
    const newErrors = {};

    if (!email.trim()) {
      newErrors.email = t('auth.errEmailEmpty');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = t('auth.errEmailInvalid');
    }

    if (forgotStep === 'otp') {
      if (!otp.trim()) {
        newErrors.otp = t('auth.errOtpEmpty');
      } else if (otp !== demoOtp) {
        newErrors.otp = t('auth.errOtpInvalid');
      }
    }

    if (forgotStep === 'password') {
      if (!newPassword) {
        newErrors.newPassword = t('auth.errPassEmpty');
      } else if (newPassword.length < 6) {
        newErrors.newPassword = t('auth.errPassLength');
      }

      if (!confirmNewPassword) {
        newErrors.confirmNewPassword = t('auth.errConfirmPassEmpty');
      } else if (newPassword !== confirmNewPassword) {
        newErrors.confirmNewPassword = t('auth.errPassMismatch');
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      if (forgotStep === 'email') {
        setDemoOtp('123456');
        setForgotStep('otp');
        setSuccessMsg(t('auth.otpSentDemo'));
      } else if (forgotStep === 'otp') {
        setErrors({});
        setSuccessMsg('');
        setForgotStep('password');
      } else {
        setSuccessMsg(t('auth.resetSuccess'));
        setTimeout(() => handleModeChange('login'), 1500);
      }
    }, 700);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);

    setTimeout(() => {
      setLoading(false);
      if (mode === 'login') {
        setSuccessMsg(t('auth.loginSuccess'));
        setTimeout(() => {
          onAuthSuccess?.({ email, name: email.split('@')[0] });
          onClose();
        }, 1000);
      } else {
        setSuccessMsg(t('auth.registerSuccess'));
        setTimeout(() => {
          setMode('login');
          setSuccessMsg('');
          setErrors({});
        }, 1500);
      }
    }, 700);
  };

  const handleSocialAuth = (provider) => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSuccessMsg(`${t('auth.loginSuccess')} (${provider})`);
      setTimeout(() => {
        onAuthSuccess?.({ email: `user@${provider.toLowerCase()}.com`, name: `${provider} User` });
        onClose();
      }, 1000);
    }, 800);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
        {/* Header with Close */}
        <div style={{
          padding: '18px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-subtle)'
        }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
              {mode === 'login' ? t('auth.loginTitle') : mode === 'register' ? t('auth.registerTitle') : t('auth.forgotTitle')}
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {mode === 'login' ? t('auth.loginSub') : mode === 'register' ? t('auth.registerSub') : t('auth.forgotSub')}
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher */}
        {mode !== 'forgot' && <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab-btn ${mode === 'login' ? 'active' : ''}`}
            onClick={() => handleModeChange('login')}
          >
            {t('auth.tabLogin')}
          </button>
          <button
            type="button"
            className={`auth-tab-btn ${mode === 'register' ? 'active' : ''}`}
            onClick={() => handleModeChange('register')}
          >
            {t('auth.tabRegister')}
          </button>
        </div>}

        {/* Success Alert */}
        {successMsg && (
          <div style={{
            margin: '16px 24px 0 24px',
            padding: '10px 14px',
            borderRadius: '8px',
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <CheckCircle2 size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form Body */}
        <div style={{ padding: '24px' }}>
          {mode === 'forgot' ? (
            <form noValidate onSubmit={handleForgotSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label style={{ color: errors.email ? '#e11d48' : 'var(--text-primary)' }}>{t('auth.email')}</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="email"
                    className={`form-input ${errors.email ? 'is-error' : ''}`}
                    placeholder={t('auth.emailPlaceholder')}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errors.email) setErrors(prev => ({ ...prev, email: null }));
                    }}
                    style={{ paddingLeft: '36px' }}
                  />
                  <Mail size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: errors.email ? '#f43f5e' : 'var(--text-muted)' }} />
                </div>
                {errors.email && <div className="form-error-msg"><AlertCircle size={13} /><span>{errors.email}</span></div>}
              </div>

              {forgotStep === 'otp' && (
                <>
                  <div className="form-group">
                    <label style={{ color: errors.otp ? '#e11d48' : 'var(--text-primary)' }}>{t('auth.otp')}</label>
                    <input
                      inputMode="numeric"
                      maxLength={6}
                      className={`form-input ${errors.otp ? 'is-error' : ''}`}
                      placeholder={t('auth.otpPlaceholder')}
                      value={otp}
                      onChange={(e) => {
                        setOtp(e.target.value.replace(/\D/g, ''));
                        if (errors.otp) setErrors(prev => ({ ...prev, otp: null }));
                      }}
                    />
                    {errors.otp && <div className="form-error-msg"><AlertCircle size={13} /><span>{errors.otp}</span></div>}
                  </div>
                </>
              )}

              {forgotStep === 'password' && (
                <>
                  <div className="form-group">
                    <label style={{ color: errors.newPassword ? '#e11d48' : 'var(--text-primary)' }}>{t('auth.newPassword')}</label>
                    <input
                      type="password"
                      className={`form-input ${errors.newPassword ? 'is-error' : ''}`}
                      placeholder={t('auth.newPasswordPlaceholder')}
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        if (errors.newPassword) setErrors(prev => ({ ...prev, newPassword: null }));
                      }}
                    />
                    {errors.newPassword && <div className="form-error-msg"><AlertCircle size={13} /><span>{errors.newPassword}</span></div>}
                  </div>
                  <div className="form-group">
                    <label style={{ color: errors.confirmNewPassword ? '#e11d48' : 'var(--text-primary)' }}>{t('auth.confirmPassword')}</label>
                    <input
                      type="password"
                      className={`form-input ${errors.confirmNewPassword ? 'is-error' : ''}`}
                      placeholder={t('auth.confirmPasswordPlaceholder')}
                      value={confirmNewPassword}
                      onChange={(e) => {
                        setConfirmNewPassword(e.target.value);
                        if (errors.confirmNewPassword) setErrors(prev => ({ ...prev, confirmNewPassword: null }));
                      }}
                    />
                    {errors.confirmNewPassword && <div className="form-error-msg"><AlertCircle size={13} /><span>{errors.confirmNewPassword}</span></div>}
                  </div>
                </>
              )}

              <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', fontSize: '15px' }} disabled={loading}>
                {loading ? t('common.processing') : forgotStep === 'email' ? t('auth.sendOtp') : forgotStep === 'otp' ? t('auth.verifyOtp') : t('auth.resetPassword')}
                {!loading && <ArrowRight size={16} />}
              </button>
              <button type="button" onClick={() => handleModeChange('login')} style={{ background: 'none', border: 'none', color: 'var(--brand-primary)', fontWeight: 700, cursor: 'pointer' }}>
                {t('auth.backToLogin')}
              </button>
            </form>
          ) : (
          <>
          {/* Social Auth Buttons (Google/Gmail & Facebook) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
            {/* Google / Gmail */}
            <button
              type="button"
              onClick={() => handleSocialAuth('Google')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '10px 16px',
                borderRadius: '10px',
                border: '1px solid var(--border-medium)',
                background: '#ffffff',
                color: 'var(--text-primary)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: 'var(--shadow-sm)'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.borderColor = 'var(--border-medium)'; }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>{mode === 'login' ? t('auth.googleLogin') : t('auth.googleRegister')}</span>
            </button>

            {/* Facebook */}
            <button
              type="button"
              onClick={() => handleSocialAuth('Facebook')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '10px 16px',
                borderRadius: '10px',
                border: '1px solid #1877F2',
                background: '#1877F2',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: '0 2px 6px rgba(24, 119, 242, 0.25)'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#166fe5'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#1877F2'; }}
            >
              <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              <span>{mode === 'login' ? t('auth.facebookLogin') : t('auth.facebookRegister')}</span>
            </button>
          </div>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '16px 0' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }}></div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
              {t('auth.orEmail')}
            </span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }}></div>
          </div>

          {/* Email / Password Form */}
          <form noValidate onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {mode === 'register' && (
              <div className="form-group">
                <label style={{ color: errors.fullName ? '#e11d48' : 'var(--text-primary)' }}>{t('auth.fullName')}</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className={`form-input ${errors.fullName ? 'is-error' : ''}`}
                    placeholder={t('auth.fullNamePlaceholder')}
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      if (errors.fullName) setErrors(prev => ({ ...prev, fullName: null }));
                    }}
                    style={{ paddingLeft: '36px' }}
                  />
                  <User size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: errors.fullName ? '#f43f5e' : 'var(--text-muted)' }} />
                </div>
                {errors.fullName && (
                  <div className="form-error-msg">
                    <AlertCircle size={13} />
                    <span>{errors.fullName}</span>
                  </div>
                )}
              </div>
            )}

            <div className="form-group">
              <label style={{ color: errors.email ? '#e11d48' : 'var(--text-primary)' }}>{t('auth.email')}</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  className={`form-input ${errors.email ? 'is-error' : ''}`}
                  placeholder={t('auth.emailPlaceholder')}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors(prev => ({ ...prev, email: null }));
                  }}
                  style={{ paddingLeft: '36px' }}
                />
                <Mail size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: errors.email ? '#f43f5e' : 'var(--text-muted)' }} />
              </div>
              {errors.email && (
                <div className="form-error-msg">
                  <AlertCircle size={13} />
                  <span>{errors.email}</span>
                </div>
              )}
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ color: errors.password ? '#e11d48' : 'var(--text-primary)' }}>{t('auth.password')}</label>
                {mode === 'login' && (
                  <button type="button" onClick={() => handleModeChange('forgot')} style={{ background: 'none', border: 'none', padding: 0, fontSize: '12px', color: 'var(--brand-primary)', cursor: 'pointer' }}>
                    {t('auth.forgotPassword')}
                  </button>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className={`form-input ${errors.password ? 'is-error' : ''}`}
                  placeholder={t('auth.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors(prev => ({ ...prev, password: null }));
                  }}
                  style={{ paddingLeft: '36px', paddingRight: '36px' }}
                />
                <Lock size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: errors.password ? '#f43f5e' : 'var(--text-muted)' }} />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: '12px', top: '10px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && (
                <div className="form-error-msg">
                  <AlertCircle size={13} />
                  <span>{errors.password}</span>
                </div>
              )}
            </div>

            {mode === 'register' && (
              <div className="form-group">
                <label style={{ color: errors.confirmPassword ? '#e11d48' : 'var(--text-primary)' }}>
                  {t('auth.confirmPassword')}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="password"
                    className={`form-input ${errors.confirmPassword ? 'is-error' : ''}`}
                    placeholder={t('auth.confirmPasswordPlaceholder')}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (errors.confirmPassword) setErrors(prev => ({ ...prev, confirmPassword: null }));
                    }}
                    style={{ paddingLeft: '36px' }}
                  />
                  <Lock size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: errors.confirmPassword ? '#f43f5e' : 'var(--text-muted)' }} />
                </div>
                {errors.confirmPassword && (
                  <div className="form-error-msg">
                    <AlertCircle size={13} />
                    <span>{errors.confirmPassword}</span>
                  </div>
                )}
              </div>
            )}

            {/* Terms and Conditions Checkbox (for Register) */}
            {mode === 'register' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="terms"
                    checked={agreeTerms}
                    onChange={(e) => {
                      setAgreeTerms(e.target.checked);
                      if (errors.terms) setErrors(prev => ({ ...prev, terms: null }));
                    }}
                    style={{ marginTop: '3px', cursor: 'pointer', accentColor: 'var(--brand-primary)' }}
                  />
                  <label htmlFor="terms" style={{ fontSize: '12px', color: errors.terms ? '#e11d48' : 'var(--text-secondary)', lineHeight: 1.4, cursor: 'pointer' }}>
                    {t('auth.termsAgreeText')}{' '}
                    <button 
                      type="button" 
                      onClick={(e) => { e.preventDefault(); onOpenLegal?.('terms'); }}
                      style={{ background: 'none', border: 'none', padding: 0, color: 'var(--brand-primary)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit', fontWeight: 600 }}
                    >
                      {t('auth.termsOfService')}
                    </button>{' '}
                    và{' '}
                    <button 
                      type="button" 
                      onClick={(e) => { e.preventDefault(); onOpenLegal?.('privacy'); }}
                      style={{ background: 'none', border: 'none', padding: 0, color: 'var(--brand-primary)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit', fontWeight: 600 }}
                    >
                      {t('auth.privacyPolicy')}
                    </button>{' '}
                    {t('auth.ofPlatform')}
                  </label>
                </div>
                {errors.terms && (
                  <div className="form-error-msg" style={{ marginLeft: '22px' }}>
                    <AlertCircle size={13} />
                    <span>{errors.terms}</span>
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: '15px', marginTop: '4px' }}
              disabled={loading}
            >
              {loading ? t('common.processing') : (mode === 'login' ? t('auth.submitLogin') : t('auth.submitRegister'))}
              {!loading && <ArrowRight size={16} />}
            </button>

            <div style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {mode === 'login' ? (
                <span>
                  {t('auth.noAccount')}{' '}
                  <button
                    type="button"
                    onClick={() => handleModeChange('register')}
                    style={{ background: 'none', border: 'none', color: 'var(--brand-primary)', fontWeight: 700, cursor: 'pointer' }}
                  >
                    {t('auth.registerNow')}
                  </button>
                </span>
              ) : (
                <span>
                  {t('auth.haveAccount')}{' '}
                  <button
                    type="button"
                    onClick={() => handleModeChange('login')}
                    style={{ background: 'none', border: 'none', color: 'var(--brand-primary)', fontWeight: 700, cursor: 'pointer' }}
                  >
                    {t('auth.loginNow')}
                  </button>
                </span>
              )}
            </div>
          </form>
          </>
          )}
        </div>
      </div>
    </div>
  );
}

