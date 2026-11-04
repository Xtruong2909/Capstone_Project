import { useState, useEffect } from 'react'
import {
  X,
  User,
  KeyRound,
  ShieldCheck,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Mail,
  Calendar,
  Lock,
} from 'lucide-react'
import { authService } from '../../../services/authService'
import { formatDate, extractErrorMessage } from '../utils/formatters'

export default function ScientistProfileModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('info') // 'info' | 'password'

  // Profile data state (GET /api/v1/auth/me)
  const [userProfile, setUserProfile] = useState(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(false)
  const [profileError, setProfileError] = useState(null)

  // Change password form state (POST /api/v1/auth/profile/change-password)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')

  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState(null)
  const [passwordError, setPasswordError] = useState(null)

  // Fetch live user info via GET /api/v1/auth/me
  const fetchProfile = async () => {
    setIsLoadingProfile(true)
    setProfileError(null)
    try {
      const data = await authService.getCurrentUser()
      setUserProfile(data)
    } catch (err) {
      setProfileError(extractErrorMessage(err, 'Unable to load account profile.'))
    } finally {
      setIsLoadingProfile(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchProfile()
      setPasswordSuccess(null)
      setPasswordError(null)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
    }
  }, [isOpen])

  if (!isOpen) return null

  // Handle password submit
  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPasswordSuccess(null)
    setPasswordError(null)

    // Validation
    if (!currentPassword.trim()) {
      setPasswordError('Please enter your current password.')
      return
    }
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters long.')
      return
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('New password and confirmation do not match.')
      return
    }
    if (newPassword === currentPassword) {
      setPasswordError('New password must be different from your current password.')
      return
    }

    setIsSubmittingPassword(true)
    try {
      const res = await authService.changePasswordInProfile({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_new_password: confirmNewPassword,
      })
      setPasswordSuccess(res.message || 'Password updated successfully! Your new password is now active.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
    } catch (err) {
      setPasswordError(extractErrorMessage(err, 'Failed to update password. Please verify your credentials.'))
    } finally {
      setIsSubmittingPassword(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="modal-dialog"
        style={{
          width: '100%',
          maxWidth: '560px',
          backgroundColor: '#fff',
          borderRadius: '16px',
          boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'fadeInModal 0.2s ease-out',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #1668e3 0%, #3b82f6 100%)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 10px rgba(22, 104, 227, 0.25)',
              }}
            >
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                Account Profile & Security
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                Manage your personal account details and update your password
              </p>
            </div>
          </div>

          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#64748b',
              padding: '0.4rem',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #e2e8f0',
            background: '#fff',
            padding: '0 1.5rem',
            gap: '1rem',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('info')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.9rem 0.2rem',
              border: 'none',
              background: 'transparent',
              fontSize: '0.85rem',
              fontWeight: 700,
              color: activeTab === 'info' ? '#1668e3' : '#64748b',
              borderBottom: activeTab === 'info' ? '2px solid #1668e3' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <User size={16} /> Personal Information
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('password')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.9rem 0.2rem',
              border: 'none',
              background: 'transparent',
              fontSize: '0.85rem',
              fontWeight: 700,
              color: activeTab === 'password' ? '#1668e3' : '#64748b',
              borderBottom: activeTab === 'password' ? '2px solid #1668e3' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <KeyRound size={16} /> Change Password
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', maxHeight: 'calc(80vh - 120px)' }}>
          {/* TAB 1: PERSONAL INFORMATION (GET /api/v1/auth/me) */}
          {activeTab === 'info' && (
            <div>
              {isLoadingProfile && (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#64748b' }}>
                  <div className="sci-spinner" />
                  <p style={{ margin: 0, fontSize: '0.85rem' }}>Loading account information...</p>
                </div>
              )}

              {profileError && (
                <div className="sci-state sci-state--error" style={{ marginBottom: '1rem', padding: '1rem' }}>
                  <AlertCircle size={18} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
                  {profileError}
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={fetchProfile}
                    style={{ display: 'block', margin: '0.6rem auto 0' }}
                  >
                    Retry
                  </button>
                </div>
              )}

              {!isLoadingProfile && userProfile && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* User Profile Header Card */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      padding: '1rem 1.2rem',
                      background: '#f8fafc',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #1668e3 0%, #2563eb 100%)',
                        color: '#fff',
                        fontSize: '1.3rem',
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 10px rgba(22, 104, 227, 0.25)',
                        flexShrink: 0,
                      }}
                    >
                      {userProfile.full_name ? userProfile.full_name.charAt(0).toUpperCase() : 'S'}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                          {userProfile.full_name || 'Data Scientist'}
                        </h4>
                        <span className="badge badge--scientist" style={{ fontSize: '0.68rem', padding: '0.12rem 0.5rem' }}>
                          {userProfile.role_id === 'data_scientist' ? 'Data Scientist' : userProfile.role_id}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '0.15rem' }}>
                        {userProfile.email}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={fetchProfile}
                      title="Refresh profile from server"
                      style={{ padding: '0.4rem 0.65rem' }}
                    >
                      <RefreshCw size={13} />
                    </button>
                  </div>

                  {/* Profile Details List */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '0.85rem',
                      fontSize: '0.82rem',
                    }}
                  >
                    <div
                      style={{
                        padding: '0.85rem',
                        background: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                      }}
                    >
                      <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.3rem' }}>
                        <Mail size={13} /> Email Address
                      </span>
                      <strong style={{ color: '#0f172a', wordBreak: 'break-all' }}>{userProfile.email}</strong>
                    </div>

                    <div
                      style={{
                        padding: '0.85rem',
                        background: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                      }}
                    >
                      <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.3rem' }}>
                        <ShieldCheck size={13} /> Account Status
                      </span>
                      <span
                        className="sci-pill sci-pill--approved"
                        style={{ display: 'inline-flex', marginTop: '0.1rem' }}
                      >
                        <CheckCircle2 size={12} /> {userProfile.is_active ? 'Active' : 'Suspended'}
                      </span>
                    </div>

                    <div
                      style={{
                        padding: '0.85rem',
                        background: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                      }}
                    >
                      <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.3rem' }}>
                        <Calendar size={13} /> Account Created
                      </span>
                      <strong style={{ color: '#0f172a' }}>{formatDate(userProfile.created_at)}</strong>
                    </div>

                    <div
                      style={{
                        padding: '0.85rem',
                        background: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                      }}
                    >
                      <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.3rem' }}>
                        <Lock size={13} /> Password Change Required
                      </span>
                      <strong style={{ color: userProfile.must_change_password ? '#b45309' : '#15803d' }}>
                        {userProfile.must_change_password ? 'Required' : 'No'}
                      </strong>
                    </div>
                  </div>

                  {/* System Note */}
                  <div
                    style={{
                      padding: '0.75rem 1rem',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      fontSize: '0.78rem',
                      color: '#64748b',
                      lineHeight: 1.45,
                    }}
                  >
                    💡 <strong>Note:</strong> Account details and Data Scientist permissions are centrally managed by the System Administrator. If you need to update your email or role permissions, please contact an Admin.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CHANGE PASSWORD (POST /api/v1/auth/profile/change-password) */}
          {activeTab === 'password' && (
            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              {passwordSuccess && (
                <div
                  style={{
                    padding: '0.85rem 1rem',
                    borderRadius: '10px',
                    background: '#dcfce7',
                    border: '1px solid #86efac',
                    color: '#15803d',
                    fontSize: '0.84rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                  <span>{passwordSuccess}</span>
                </div>
              )}

              {passwordError && (
                <div
                  style={{
                    padding: '0.85rem 1rem',
                    borderRadius: '10px',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#b91c1c',
                    fontSize: '0.84rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{passwordError}</span>
                </div>
              )}

              {/* Current Password */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                  Current Password <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    className="admin-input"
                    placeholder="Enter your current password..."
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    style={{ width: '100%', paddingRight: '2.5rem', boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword((prev) => !prev)}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                  New Password <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    className="admin-input"
                    placeholder="At least 6 characters, different from current password..."
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    style={{ width: '100%', paddingRight: '2.5rem', boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                  Confirm New Password <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    className="admin-input"
                    placeholder="Re-enter your new password..."
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    required
                    minLength={6}
                    style={{ width: '100%', paddingRight: '2.5rem', boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn-secondary" onClick={onClose} disabled={isSubmittingPassword}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-action btn-action--primary"
                  disabled={isSubmittingPassword}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  {isSubmittingPassword ? (
                    <>
                      <div className="sci-spinner" style={{ width: 14, height: 14, borderWidth: 2, margin: 0 }} />
                      Updating...
                    </>
                  ) : (
                    <>
                      <KeyRound size={15} /> Update Password
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
