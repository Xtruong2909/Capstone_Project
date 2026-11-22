import { Briefcase, ChevronDown, Database, FlaskConical, Mail } from 'lucide-react'
import { useAdminCreateUser } from '../../../hooks/useAdminCreateUser'
import { useLanguage } from '../../../hooks/useLanguage'
import { AdminModal } from './AdminUi'

const ROLE_ICONS = { data_engineer: Database, data_scientist: FlaskConical, business_user: Briefcase }

export default function AdminCreateUserDialog({ roles, onClose, onCreated }) {
  const { t } = useLanguage()
  const { form, availableRoles, submitting, error, updateField, submit } = useAdminCreateUser(roles, onCreated)
  const RoleIcon = ROLE_ICONS[form.role_id] || Database
  return <AdminModal title={t('Create New User')} busy={submitting} onClose={onClose} className="admin-create-user-dialog">
    <form onSubmit={submit} aria-busy={submitting}>
      <p className="admin-create-user-dialog__intro">{t('Enter user details. Login credentials will be sent by email.')}</p>
      {error && <p className="admin-notice admin-notice--error" role="alert">{t(error)}</p>}
      <fieldset className="admin-create-user-dialog__fields" disabled={submitting}>
        <div className="form-field">
          <label htmlFor="create-user-name">{t('Full Name')}</label>
          <input id="create-user-name" className="admin-input" type="text" autoComplete="name" required autoFocus
            value={form.full_name} onChange={(event) => updateField('full_name', event.target.value)} placeholder={t('e.g. Alex Morgan')} />
        </div>
        <div className="form-field">
          <label htmlFor="create-user-email">{t('Email Address')}</label>
          <input id="create-user-email" className="admin-input" type="email" autoComplete="email" required
            value={form.email} onChange={(event) => updateField('email', event.target.value)} placeholder="user@example.com" aria-describedby="create-user-email-help" />
        </div>
        <div className="form-field">
          <label htmlFor="create-user-role">{t('Role')}</label>
          <div className="admin-create-user-role" data-role={form.role_id}>
            <span className="admin-create-user-role__icon" aria-hidden="true"><RoleIcon size={16} strokeWidth={1.8} /></span>
            <select id="create-user-role" className="admin-select" required value={form.role_id} onChange={(event) => updateField('role_id', event.target.value)}>
              {!availableRoles.length && <option value="">{t('No available user roles.')}</option>}
              {availableRoles.map((role) => <option key={role.id} value={role.id}>{t(role.id)}</option>)}
            </select>
            <ChevronDown size={16} className="admin-create-user-role__chevron" aria-hidden="true" />
          </div>
        </div>
      </fieldset>
      <div id="create-user-email-help" className="admin-create-user-dialog__email-note">
        <Mail size={19} aria-hidden="true" />
        <p>{t('The system generates a temporary password and emails the login details. The user needs to change the password on first login.')}</p>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn-secondary" disabled={submitting} onClick={onClose}>{t('Cancel')}</button>
        <button type="submit" className="btn-action btn-action--primary" disabled={submitting || !availableRoles.some((role) => role.id === form.role_id)}>
          {submitting ? <span role="status">{t('Creating account and sending email...')}</span> : t('Create and send email')}
        </button>
      </div>
    </form>
  </AdminModal>
}
