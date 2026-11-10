import { useEffect, useState } from 'react'
import {
  Users,
  UserPlus,
  Search,
  AlertCircle,
  RefreshCw,
  X,
  ShieldCheck,
  CheckCircle2,
  Ban,
} from 'lucide-react'
import { adminService } from '../../../services/adminService'
import { useLanguage } from '../../../hooks/useLanguage'

const ROLE_DESCRIPTIONS = {
  data_engineer:
    'Ingests raw pNEUMA UAV trajectories, executes 3-step pipeline QA, and submits canonical versions.',
  data_scientist:
    'Aggregates 1-min & 5-min intervals, trains Random Forest traffic flow models, and benchmarks accuracy.',
  business_user:
    'Monitors interactive Goong GIS corridors, investigates congestion hotspots, and exports KPI reports.',
  admin:
    'Manages platform RBAC, reviews dataset quality gate, issues research grants, and audits system trails.',
}

export default function AdminUsersPage() {
  const { t, language } = useLanguage()
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRole, setSelectedRole] = useState('ALL')

  // Modal create user
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    role_id: 'data_engineer',
    password: '',
  })
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)

  const fetchUsersAndRoles = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [usersData, rolesData] = await Promise.all([
        adminService.getUsers(),
        adminService.getRoles(),
      ])
      setUsers(usersData)
      setRoles(rolesData)
    } catch (err) {
      setError(t('Failed to load user list from the server.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchUsersAndRoles()
  }, [])

  const handleToggleStatus = async (user) => {
    try {
      const updated = await adminService.updateUserStatus(user.id, !user.is_active)
      setUsers((prev) => prev.map((u) => (u.id === user.id ? updated : u)))
    } catch (err) {
      alert(err.response?.data?.detail || t('Failed to update user status.'))
    }
  }

  const handleCreateSubmit = async (e) => {
    e.preventDefault()
    setFormSubmitting(true)
    setFormError(null)
    try {
      const newUser = await adminService.createUser(formData)
      setUsers((prev) => [newUser, ...prev])
      setIsModalOpen(false)
      setFormData({
        email: '',
        full_name: '',
        role_id: 'data_engineer',
        password: '',
      })
    } catch (err) {
      setFormError(err.response?.data?.detail || t('Failed to create new user.'))
    } finally {
      setFormSubmitting(false)
    }
  }

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesRole = selectedRole === 'ALL' || u.role_id === selectedRole
    return matchesSearch && matchesRole
  })

  const getRoleBadgeClass = (roleId) => {
    switch (roleId) {
      case 'admin':
        return 'adm-badge--rose'
      case 'data_engineer':
        return 'adm-badge--blue'
      case 'data_scientist':
        return 'adm-badge--purple'
      case 'business_user':
        return 'adm-badge--emerald'
      default:
        return 'adm-badge--slate'
    }
  }

  const getAvatarBg = (roleId) => {
    switch (roleId) {
      case 'admin':
        return '#e11d48'
      case 'data_engineer':
        return '#2563eb'
      case 'data_scientist':
        return '#7c3aed'
      case 'business_user':
        return '#059669'
      default:
        return '#475569'
    }
  }

  const counts = {
    all: users.length,
    engineer: users.filter((u) => u.role_id === 'data_engineer').length,
    scientist: users.filter((u) => u.role_id === 'data_scientist').length,
    business: users.filter((u) => u.role_id === 'business_user').length,
  }

  return (
    <div>
      {/* 1. Interactive 4-Column Role Summary Strip */}
      <div className="adm-bento-grid">
        <div
          className="adm-panel adm-col-3"
          style={{
            cursor: 'pointer',
            borderColor: selectedRole === 'ALL' ? '#2563eb' : '#e2e8f0',
          }}
          onClick={() => setSelectedRole('ALL')}
        >
          <div className="adm-panel__body" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="adm-panel__icon adm-tone--slate">
              <Users size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
                {counts.all}
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginTop: '0.2rem' }}>
                Total Accounts
              </div>
            </div>
          </div>
        </div>

        <div
          className="adm-panel adm-col-3"
          style={{
            cursor: 'pointer',
            borderColor: selectedRole === 'data_engineer' ? '#2563eb' : '#e2e8f0',
          }}
          onClick={() => setSelectedRole('data_engineer')}
        >
          <div className="adm-panel__body" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="adm-panel__icon adm-tone--blue">
              <ShieldCheck size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
                {counts.engineer}
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginTop: '0.2rem' }}>
                Data Engineers
              </div>
            </div>
          </div>
        </div>

        <div
          className="adm-panel adm-col-3"
          style={{
            cursor: 'pointer',
            borderColor: selectedRole === 'data_scientist' ? '#7c3aed' : '#e2e8f0',
          }}
          onClick={() => setSelectedRole('data_scientist')}
        >
          <div className="adm-panel__body" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="adm-panel__icon adm-tone--purple">
              <Users size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
                {counts.scientist}
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginTop: '0.2rem' }}>
                Data Scientists
              </div>
            </div>
          </div>
        </div>

        <div
          className="adm-panel adm-col-3"
          style={{
            cursor: 'pointer',
            borderColor: selectedRole === 'business_user' ? '#059669' : '#e2e8f0',
          }}
          onClick={() => setSelectedRole('business_user')}
        >
          <div className="adm-panel__body" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="adm-panel__icon adm-tone--emerald">
              <Users size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
                {counts.business}
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginTop: '0.2rem' }}>
                Business Users
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Search, Role Filter & Action Bar */}
      <div className="adm-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flex: 1, flexWrap: 'wrap' }}>
          <div className="adm-search-box">
            <Search size={16} className="adm-search-box__icon" />
            <input
              type="text"
              placeholder={t('Search by name or email...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="adm-input adm-input--search"
            />
          </div>

          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="adm-select"
            style={{ width: 'auto', minWidth: '180px' }}
          >
            <option value="ALL">{t('All Roles')}</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="btn-action btn-action--primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem' }}
          onClick={() => setIsModalOpen(true)}
        >
          <UserPlus size={16} />
          <span>{t('Add User')}</span>
        </button>
      </div>

      {/* Users Table */}
      <div className="admin-card">
        <div className="admin-card__header">
          <h3 className="admin-card__title">
            {t('User Accounts')} ({filteredUsers.length})
          </h3>
          <button
            type="button"
            className="adm-btn adm-btn--primary"
            onClick={() => setIsModalOpen(true)}
          >
            <RefreshCw size={14} />
            <span>{t('Refresh')}</span>
          </button>
        </div>
      </div>

        {isLoading ? (
          <div className="empty-state">
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.75rem', color: '#2563eb' }} />
            <p>{t('Loading user accounts...')}</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <AlertCircle size={24} style={{ margin: '0 auto 0.75rem', color: '#dc2626' }} />
            <p>{t(error)}</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="empty-state">
            <Users size={28} style={{ margin: '0 auto 0.75rem', color: '#94a3b8' }} />
            <p>{t('No matching user accounts found.')}</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('Full Name')}</th>
                  <th>{t('Email')}</th>
                  <th>{t('Role')}</th>
                  <th>{t('Status')}</th>
                  <th>{t('Created Date')}</th>
                  <th>{t('Action')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong style={{ color: '#0f172a' }}>{user.full_name}</strong>
                    </td>
                    <td style={{ color: '#475569' }}>{user.email}</td>
                    <td>
                      <span className={`badge ${getRoleBadgeClass(user.role_id)}`}>
                        {t(roles.find((r) => r.id === user.role_id)?.name || user.role_id)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${user.is_active ? 'badge--active' : 'badge--inactive'}`}>
                        {t(user.is_active ? 'Active' : 'Suspended')}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {user.created_at ? new Date(user.created_at).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US') : '—'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`btn-action ${user.is_active ? 'btn-action--danger' : 'btn-action--success'}`}
                        onClick={() => handleToggleStatus(user)}
                      >
                        {t(user.is_active ? 'Deactivate' : 'Activate')}
                      </button>
                    </td>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '10px',
                              background: getAvatarBg(u.role_id),
                              color: '#ffffff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 800,
                              fontSize: '0.85rem',
                              flexShrink: 0,
                            }}
                          >
                            {u.full_name ? u.full_name.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{u.full_name}</div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>ID: #{u.id}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontWeight: 600, color: '#334155' }}>{u.email}</td>
                      <td>
                        <span className={`adm-badge ${getRoleBadgeClass(u.role_id)}`}>
                          {u.role?.name || u.role_id}
                        </span>
                      </td>
                      <td>
                        {u.is_active ? (
                          <span className="adm-badge adm-badge--emerald">
                            <CheckCircle2 size={12} />
                            <span>Active</span>
                          </span>
                        ) : (
                          <span className="adm-badge adm-badge--slate">
                            <Ban size={12} />
                            <span>Disabled</span>
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        {new Date(u.created_at).toLocaleDateString('en-US')}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {u.role_id !== 'admin' ? (
                          <button
                            type="button"
                            className={`adm-btn adm-btn--sm ${
                              u.is_active ? 'adm-btn--danger' : 'adm-btn--emerald'
                            }`}
                            onClick={() => handleToggleStatus(u)}
                          >
                            {u.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        ) : (
                          <span className="adm-code-tag">Protected Root</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create User Modal */}
      {isModalOpen && (
        <div
          className="adm-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false)
          }}
        >
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>{t('Create New User')}</h3>
              <button
                type="button"
                className="adm-modal__close"
                onClick={() => setIsModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="modal-body">
              {formError && (
                <div style={{
                  padding: '0.75rem',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '6px',
                  color: '#dc2626',
                  fontSize: '0.85rem',
                  marginBottom: '1rem',
                }}>
                  {t(formError)}
                </div>
              )}

              <div className="form-field">
                <label className="form-label">{t('Full Name')}</label>
                <input
                  type="text"
                  required
                  placeholder={t('e.g. Alex Morgan')}
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="admin-input"
                  style={{ width: '100%' }}
                />
              </div>

              <div className="form-field">
                <label className="form-label">{t('Email Address')}</label>
                <input
                  type="email"
                  required
                  placeholder="user@metroflow.ai"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="admin-input"
                  style={{ width: '100%' }}
                />
              </div>

              <div className="form-field">
                <label className="form-label">{t('Role')}</label>
                <select
                  value={formData.role_id}
                  onChange={(e) => setFormData({ ...formData, role_id: e.target.value })}
                  className="admin-select"
                  style={{ width: '100%' }}
                >
                  {roles
                    .filter((r) => r.id !== 'admin')
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {t(r.name)}
                      </option>
                    ))}
                </select>
              </div>

              <div className="form-field" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label">{t('Initial Password')}</label>
                <input
                  type="password"
                  required
                  placeholder={t('Enter initial password...')}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="admin-input"
                  style={{ width: '100%' }}
                />
              </div>

              <div className="adm-modal__footer">
                <button
                  type="button"
                  className="adm-btn adm-btn--ghost"
                  onClick={() => setIsModalOpen(false)}
                >
                  {t('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="adm-btn adm-btn--primary"
                >
                  {t(formSubmitting ? 'Creating...' : 'Create Account')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
