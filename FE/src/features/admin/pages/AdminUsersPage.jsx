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
    } catch {
      setError('Failed to load user list from the server.')
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
      alert(err.response?.data?.detail || 'Failed to update user status.')
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
      setFormError(err.response?.data?.detail || 'Failed to create new user.')
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
              placeholder="Search user by name or email..."
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
            <option value="ALL">All Platform Roles</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <button type="button" className="adm-btn adm-btn--ghost" onClick={fetchUsersAndRoles}>
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            className="adm-btn adm-btn--primary"
            onClick={() => setIsModalOpen(true)}
          >
            <UserPlus size={16} />
            <span>Provision Account</span>
          </button>
        </div>
      </div>

      {/* 3. Identity Directory Table */}
      <div className="adm-panel">
        <div className="adm-panel__header">
          <div className="adm-panel__title-group">
            <div className="adm-panel__icon adm-tone--blue">
              <Users size={18} />
            </div>
            <div>
              <h3 className="adm-panel__title">Identity & RBAC Directory ({filteredUsers.length})</h3>
              <p className="adm-panel__subtitle">
                Manage account lifecycle, role assignments, and platform access privileges
              </p>
            </div>
          </div>
        </div>

        <div className="adm-panel__body--flush">
          {isLoading ? (
            <div className="adm-empty">
              <div className="adm-empty__icon adm-tone--blue">
                <RefreshCw size={24} className="animate-spin" />
              </div>
              <h4 className="adm-empty__title">Loading Identity Directory...</h4>
            </div>
          ) : error ? (
            <div className="adm-empty">
              <div className="adm-empty__icon adm-tone--rose">
                <AlertCircle size={24} />
              </div>
              <h4 className="adm-empty__title">Failed to Load Users</h4>
              <p className="adm-empty__desc">{error}</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="adm-empty">
              <div className="adm-empty__icon adm-tone--slate">
                <Users size={24} />
              </div>
              <h4 className="adm-empty__title">No Matching Accounts Found</h4>
              <p className="adm-empty__desc">Try adjusting your search query or role filter.</p>
            </div>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Identity</th>
                    <th>Email Address</th>
                    <th>Assigned Role</th>
                    <th>Status</th>
                    <th>Provisioned Date</th>
                    <th style={{ textAlign: 'right' }}>Access Control</th>
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
          <div className="adm-modal">
            <div className="adm-modal__header">
              <h3 className="adm-modal__title">Provision New Platform Account</h3>
              <button
                type="button"
                className="adm-modal__close"
                onClick={() => setIsModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div className="adm-modal__body">
                {formError && (
                  <div
                    style={{
                      padding: '0.75rem 1rem',
                      background: '#fff1f2',
                      border: '1px solid #fecdd3',
                      borderRadius: '10px',
                      color: '#be123c',
                      fontSize: '0.84rem',
                      marginBottom: '1rem',
                      fontWeight: 600,
                    }}
                  >
                    {formError}
                  </div>
                )}

                <div className="adm-field">
                  <label className="adm-label">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Nguyen Van A"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="adm-input"
                  />
                </div>

                <div className="adm-field">
                  <label className="adm-label">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="user@capstone.vn"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="adm-input"
                  />
                </div>

                <div className="adm-field">
                  <label className="adm-label">Assigned Platform Role</label>
                  <select
                    value={formData.role_id}
                    onChange={(e) => setFormData({ ...formData, role_id: e.target.value })}
                    className="adm-select"
                  >
                    {roles
                      .filter((r) => r.id !== 'admin')
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                  </select>
                  <p
                    style={{
                      margin: '0.45rem 0 0',
                      fontSize: '0.78rem',
                      color: '#475569',
                      lineHeight: 1.45,
                    }}
                  >
                    {ROLE_DESCRIPTIONS[formData.role_id] || ''}
                  </p>
                </div>

                <div className="adm-field" style={{ marginBottom: 0 }}>
                  <label className="adm-label">Initial Password</label>
                  <input
                    type="password"
                    required
                    placeholder="Enter initial password..."
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="adm-input"
                  />
                </div>
              </div>

              <div className="adm-modal__footer">
                <button
                  type="button"
                  className="adm-btn adm-btn--ghost"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="adm-btn adm-btn--primary"
                >
                  <UserPlus size={15} />
                  <span>{formSubmitting ? 'Provisioning...' : 'Create Account'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
