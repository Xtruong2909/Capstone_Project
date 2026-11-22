import { FolderOpen, KeyRound, Plus, Trash2 } from 'lucide-react'
import { accessGrantKey, useAdminAccessGrants } from '../../../hooks/useAdminAccessGrants'
import { useLanguage } from '../../../hooks/useLanguage'
import { AdminFeedback, AdminPagination, AdminState } from './AdminUi'

const ROLE_TONES = { data_engineer: 'blue', data_scientist: 'purple', business_user: 'emerald' }

export default function AdminAccessGrantsTable({ onGrant, onChanged }) {
  const { t } = useLanguage()
  const { grants, mutation, confirmKey, cancel, revoke } = useAdminAccessGrants(onChanged)
  return <section className="adm-panel adm-col-12 admin-batch-grants">
    <header className="adm-panel__header">
      <div className="adm-panel__title-group">
        <div className="adm-panel__icon adm-tone--emerald"><KeyRound size={18} /></div>
        <h3 className="adm-panel__title">{t('Dataset Access Permissions')}</h3>
      </div>
      <button type="button" className="adm-btn adm-btn--primary adm-btn--sm" onClick={onGrant}>
        <Plus size={14} />{t('Grant Access')}
      </button>
    </header>
    <AdminFeedback mutation={mutation} />
    <AdminState resource={grants} empty="No access grants issued yet">
      <div className="adm-table-wrap"><table className="adm-table">
        <thead><tr>{['Granted User', 'Role', 'Batch', 'Dataset Access', 'Action'].map((label) => <th key={label}>{t(label)}</th>)}</tr></thead>
        <tbody>{grants.items.map((item) => {
          const key = accessGrantKey(item)
          return <tr key={key}>
            <td><strong>{item.user_name}</strong><small className="admin-cell-note">{item.user_email}</small></td>
            <td><span className={`adm-badge adm-badge--${ROLE_TONES[item.user_role] || 'slate'}`}>{t(item.user_role)}</span></td>
            <td><div className="admin-batch-grants__batch"><FolderOpen size={18} />
              <div><strong>{item.group_id ? item.group_name || t('Batch') : item.dataset_name}</strong>
                {!item.group_id && <small className="admin-cell-note">{t('Ungrouped dataset')}</small>}
              </div>
            </div></td>
            <td><span className={`adm-badge adm-badge--${item.granted_datasets === item.total_datasets ? 'emerald' : 'amber'}`}>
              {item.granted_datasets} / {item.total_datasets} {t('Datasets')}
            </span></td>
            <td><div className="admin-actions">
              <button type="button" className="adm-btn adm-btn--danger adm-btn--sm" disabled={mutation.busy || grants.loading}
                onClick={() => revoke(item)}>
                <Trash2 size={12} />{t(confirmKey === key ? 'Confirm' : item.group_id ? 'Revoke Entire Batch' : 'Revoke')}
              </button>
              {confirmKey === key && <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm" disabled={mutation.busy} onClick={cancel}>{t('Cancel')}</button>}
            </div></td>
          </tr>
        })}</tbody>
      </table></div>
    </AdminState>
    <AdminPagination {...grants} loading={grants.loading || mutation.busy} />
  </section>
}
