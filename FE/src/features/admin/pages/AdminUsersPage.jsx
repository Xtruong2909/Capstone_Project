import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { adminService } from '../../../services/adminService'
import { useAdminMutation, useAdminPage, useAdminResource } from '../../../hooks/useAdminData'
import { useLanguage } from '../../../hooks/useLanguage'
import { useAuth } from '../../../hooks/useAuth'
import { AdminBadge, AdminFeedback, AdminModal, AdminPagination, AdminState, AdminToolbar } from '../components/AdminUi'

export default function AdminUsersPage() {
  const { t, language } = useLanguage()
  const { user: currentUser } = useAuth()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [statusUser, setStatusUser] = useState(null)
  const [form, setForm] = useState({ email: '', full_name: '', role_id: 'data_engineer' })
  const users = useAdminPage(adminService.getUsers, { search: search || undefined, role: role || undefined, is_active: status || undefined })
  const roles = useAdminResource(adminService.getRoles)
  const mutation = useAdminMutation()
  const reload = () => { users.reload(); roles.reload() }

  return <section className="admin-card">
    <AdminToolbar title={`${t('User Management')} (${users.total})`} onRefresh={reload}
      action={<button type="button" className="btn-action btn-action--primary" onClick={() => { mutation.clear(); setCreateOpen(true) }}><UserPlus size={16} /> {t('Add User')}</button>}>
      <input type="search" className="admin-input" value={search} onChange={(event) => setSearch(event.target.value)} aria-label={t('Search by name or email...')} placeholder={t('Search by name or email...')} />
      <select className="admin-select" aria-label={t('Role')} value={role} onChange={(event) => setRole(event.target.value)}><option value="">{t('All Roles')}</option>{(roles.data || []).map((item) => <option key={item.id} value={item.id}>{t(item.name)}</option>)}</select>
      <select className="admin-select" aria-label={t('Status')} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">{t('All Statuses')}</option><option value="true">{t('Active')}</option><option value="false">{t('Suspended')}</option></select>
    </AdminToolbar>
    {!createOpen && !statusUser && <AdminFeedback mutation={mutation} />}
    {roles.error && <p role="alert" className="admin-notice admin-notice--error">{roles.error}</p>}
    <AdminState resource={users}><div className="admin-table-scroll"><table className="admin-table"><thead><tr>
      {['Full Name', 'Email', 'Role', 'Status', 'Created Date', 'Action'].map((label) => <th key={label}>{t(label)}</th>)}
    </tr></thead><tbody>{users.items.map((user) => <tr key={user.id}>
      <td><strong>{user.full_name}</strong></td><td>{user.email}</td><td>{t(roles.data?.find((item) => item.id === user.role_id)?.name || user.role_id)}</td>
      <td><AdminBadge value={user.is_active ? 'ACTIVE' : 'INACTIVE'} /></td><td>{user.created_at ? new Date(user.created_at).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US') : '—'}</td>
      <td><button type="button" disabled={mutation.busy || user.id === currentUser?.id} className={`btn-action ${user.is_active ? 'btn-action--danger' : 'btn-action--success'}`} onClick={() => { mutation.clear(); setStatusUser(user) }}>{t(user.is_active ? 'Deactivate' : 'Activate')}</button></td>
    </tr>)}</tbody></table></div></AdminState>
    <AdminPagination {...users} />
    {createOpen && <AdminModal title={t('Create New User')} busy={mutation.busy} onClose={() => setCreateOpen(false)}>
      <form onSubmit={(event) => { event.preventDefault(); mutation.run(() => adminService.createUser(form), () => { setCreateOpen(false); setForm({ email: '', full_name: '', role_id: 'data_engineer' }); users.reload() }, 'Đã tạo tài khoản và gửi mật khẩu tạm qua email.') }}>
        <AdminFeedback mutation={mutation} />
        <label className="form-field">{t('Full Name')}<input className="admin-input" required value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></label>
        <label className="form-field">{t('Email')}<input className="admin-input" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label className="form-field">{t('Role')}<select className="admin-select" value={form.role_id} onChange={(event) => setForm({ ...form, role_id: event.target.value })}>{(roles.data || []).filter((item) => item.id !== 'admin').map((item) => <option key={item.id} value={item.id}>{t(item.name)}</option>)}</select></label>
        <p className="admin-help">Mật khẩu tạm được máy chủ tạo và gửi qua email. Người dùng đổi mật khẩu khi đăng nhập lần đầu.</p>
        <div className="modal-actions"><button type="button" className="btn-secondary" disabled={mutation.busy} onClick={() => setCreateOpen(false)}>{t('Cancel')}</button><button className="btn-action btn-action--primary" disabled={mutation.busy || roles.loading || Boolean(roles.error)}>{t(mutation.busy ? 'Creating...' : 'Create Account')}</button></div>
      </form>
    </AdminModal>}
    {statusUser && <AdminModal title={t(statusUser.is_active ? 'Deactivate' : 'Activate')} busy={mutation.busy} onClose={() => setStatusUser(null)}>
      <p>{statusUser.full_name} · {statusUser.email}</p><AdminFeedback mutation={mutation} />
      <div className="modal-actions"><button className="btn-secondary" disabled={mutation.busy} onClick={() => setStatusUser(null)}>{t('Cancel')}</button><button className="btn-action btn-action--primary" disabled={mutation.busy} onClick={() => mutation.run(() => adminService.updateUserStatus(statusUser.id, !statusUser.is_active), () => { setStatusUser(null); users.reload() })}>{t('Confirm')}</button></div>
    </AdminModal>}
  </section>
}
