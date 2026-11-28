import { useState } from 'react'
import { useAdminResource } from '../../../hooks/useAdminData'
import {
  Users,
  UserPlus,
  Search,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  Ban,
} from 'lucide-react'
import { adminService } from '../../../services/adminService'
import { useLanguage } from '../../../hooks/useLanguage'
import AdminCreateUserDialog from '../components/AdminCreateUserDialog'
import { AdminPagination } from '../components/AdminUi'

const ROLE_DESCRIPTIONS = {
  data_engineer:
    'Ingests raw pNEUMA UAV trajectories, executes 3-step pipeline QA, and submits canonical dataset_files.',
  data_scientist:
    'Aggregates 1-min & 5-min intervals, trains Random Forest traffic flow models, and benchmarks accuracy.',
  business_user:
    'Monitors interactive Goong GIS corridors, investigates congestion hotspots, and exports KPI reports.',
  admin:
    'Manages platform RBAC, reviews dataset quality gate, issues research grants, and audits system trails.',
}

export default function AdminUsersPage() {
  const { t, language } = useLanguage()
  const resource = useAdminResource(adminService.getUserManagementData)
  const users = resource.data?.users || []
  const roles = resource.data?.roles || []
  const isLoading = resource.loading
  const error = resource.error
  const fetchUsersAndRoles = resource.reload

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRole, setSelectedRole] = useState('ALL')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // Modal create user
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [createdEmail, setCreatedEmail] = useState('')

  const handleToggleStatus = async (user) => {
    try {
      await adminService.updateUserStatus(user.id, !user.is_active)
      fetchUsersAndRoles()
    } catch (err) {
      alert(err.response?.data?.detail || t('Failed to update user status.'))
    }
  }

  const safeUsers = (Array.isArray(users) ? users : []).filter((user) => user.role_id !== 'admin')

  const filteredUsers = safeUsers.filter((u) => {
    const matchesSearch =
      u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesRole = selectedRole === 'ALL' || u.role_id === selectedRole
    return matchesSearch && matchesRole
  })

  const lastPage = Math.max(1, Math.ceil(filteredUsers.length / pageSize))
  const currentPage = Math.min(page, lastPage)
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize)

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
    all: safeUsers.length,
    engineer: safeUsers.filter((u) => u.role_id === 'data_engineer').length,
    scientist: safeUsers.filter((u) => u.role_id === 'data_scientist').length,
    business: safeUsers.filter((u) => u.role_id === 'business_user').length,
  }

  return (
    <div>
      {createdEmail && <p className="admin-notice admin-notice--success" role="status">
        {t('Account created. Login details have been emailed to:')} <strong>{createdEmail}</strong>
      </p>}
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
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setPage(1)
              }}
              className="adm-input adm-input--search"
            />
          </div>

          <select
            value={selectedRole}
            onChange={(e) => {
              setSelectedRole(e.target.value)
              setPage(1)
            }}
            className="adm-select"
            style={{ width: 'auto', minWidth: '180px' }}
          >
            <option value="ALL">{t('All Roles')}</option>
            {roles.filter((role) => role.id !== 'admin').map((r) => (
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
            className="adm-btn adm-btn--primary"
            onClick={() => { setCreatedEmail(''); setIsModalOpen(true) }}
            disabled={isLoading || !roles.length}
          >
            <UserPlus size={16} />
            <span>{t('Add User')}</span>
          </button>
        </div>
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
          ) : error && !resource.data ? (
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
                </thead>
                <tbody>
                  {paginatedUsers.map((u) => (
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
                            <span>{t('Active')}</span>
                          </span>
                        ) : (
                          <span className="adm-badge adm-badge--slate">
                            <Ban size={12} />
                            <span>{t('Disabled')}</span>
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        {u.created_at ? new Date(u.created_at).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US') : '—'}
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
                            {t(u.is_active ? 'Deactivate' : 'Activate')}
                          </button>
                        ) : (
                          <span className="adm-code-tag">{t('Protected Root')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filteredUsers.length > 0 && (
            <AdminPagination
              page={currentPage}
              pageSize={pageSize}
              total={filteredUsers.length}
              setPage={setPage}
              setPageSize={setPageSize}
              loading={isLoading}
            />
          )}
        </div>
      </div>

      {isModalOpen && <AdminCreateUserDialog
        roles={roles}
        onClose={() => setIsModalOpen(false)}
        onCreated={(newUser) => {
          fetchUsersAndRoles()
          setSearchQuery('')
          setSelectedRole('ALL')
          setCreatedEmail(newUser.email)
          setIsModalOpen(false)
        }}
      />}
    </div>
  )
}
