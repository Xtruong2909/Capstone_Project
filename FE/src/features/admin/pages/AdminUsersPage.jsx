import { useEffect, useState } from 'react'
import {
  Users,
  UserPlus,
  Search,
  AlertCircle,
  RefreshCw,
  X,
} from 'lucide-react'
import { adminService } from '../../../services/adminService'
import { useLanguage } from '../../../hooks/useLanguage'

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
      case 'admin': return 'badge--admin'
      case 'data_engineer': return 'badge--engineer'
      case 'data_scientist': return 'badge--scientist'
      case 'business_user': return 'badge--business'
      default: return 'badge--inactive'
    }
  }

  return (
    <div>
      {/* Top action bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '280px', maxWidth: '500px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
            <input
              type="text"
              placeholder={t('Search by name or email...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="admin-input"
              style={{ width: '100%', paddingLeft: '2.25rem' }}
            />
          </div>

          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="admin-select"
          >
            <option value="ALL">{t('All Roles')}</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <button
            type="button"
            className="adm-btn adm-btn--ghost"
            onClick={fetchUsersAndRoles}
            disabled={isLoading}
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            <span>{t('Refresh')}</span>
          </button>
          <button
            type="button"
            className="btn-action btn-action--primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            onClick={fetchUsersAndRoles}
          >
            <UserPlus size={16} />
            <span>{t('Add User')}</span>
          </button>
        </div>

      {/* Users Table */}
      <div className="adm-panel">
        <div className="adm-panel__header">
          <div className="adm-panel__title-group">
            <div className="adm-panel__icon adm-tone--blue">
              <Users size={18} />
            </div>
            <div>
              <h3 className="adm-panel__title">
                {t('User Accounts')} ({filteredUsers.length})
              </h3>
            </div>
          </div>
        </div>

        <div className="adm-panel__body--flush">
          {isLoading ? (
            <div className="adm-empty">
              <div className="adm-empty__icon adm-tone--blue">
                <RefreshCw size={24} className="animate-spin" />
              </div>
              <h4 className="adm-empty__title">{t('Loading user accounts...')}</h4>
            </div>
          ) : error ? (
            <div className="adm-empty">
              <div className="adm-empty__icon adm-tone--rose">
                <AlertCircle size={24} />
              </div>
              <h4 className="adm-empty__title">{t(error)}</h4>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="adm-empty">
              <div className="adm-empty__icon adm-tone--slate">
                <Users size={24} />
              </div>
              <h4 className="adm-empty__title">{t('No matching user accounts found.')}</h4>
            </div>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>{t('User')}</th>
                    <th>{t('Email')}</th>
                    <th>{t('Role')}</th>
                    <th>{t('Status')}</th>
                    <th>{t('Created Date')}</th>
                    <th style={{ textAlign: 'right' }}>{t('Action')}</th>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create New User Modal */}
      {isModalOpen && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false)
          }}
        >
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>{t('Create New User')}</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsModalOpen(false)}
              >
                <X size={20} />
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

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  {t('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="btn-action btn-action--primary"
                  style={{ padding: '0.55rem 1.25rem' }}
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
