import { useAdminBatchAccess } from '../../../hooks/useAdminBatchAccess'
import { useLanguage } from '../../../hooks/useLanguage'
import { AdminFeedback, AdminModal, AdminState } from './AdminUi'

export default function AdminBatchGrantDialog({ batch, onClose, onGranted, revokeMode = false }) {
  const { t } = useLanguage()
  const { users, mutation, search, setSearch, page, setPage, grant, revoke, hasNextPage } = useAdminBatchAccess(batch.group_id, onGranted, revokeMode)
  return <AdminModal className="admin-batch-access-dialog" title={t(revokeMode ? 'Revoke Batch Access' : 'Grant Batch Access')} busy={mutation.busy} onClose={onClose}>
    <h4>{batch.group_name || t('Batch')}</h4>
    <p className="admin-cell-note">{t(revokeMode ? 'Revoke the selected user’s access to every dataset in this batch.' : 'Grant access to every dataset in this batch. All datasets must be approved.')}</p>
    <AdminFeedback mutation={mutation} />
    {!revokeMode && <input className="admin-input" type="search" disabled={mutation.busy} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('Search by name or email...')} aria-label={t('Search by name or email...')} />}
    <AdminState resource={{ ...users, items: users.data }}>
      <div className="admin-table-scroll"><table className="admin-table">
        <thead><tr>{['Account', 'Role', 'Dataset Access', 'Action'].map((label) => <th key={label}>{t(label)}</th>)}</tr></thead>
        <tbody>{(users.data || []).map((user) => <tr key={user.user_id}>
          <td><strong>{user.full_name}</strong><small className="admin-cell-note">{user.email}</small></td>
          <td>{t(user.role)}</td><td>{user.granted_datasets} / {user.total_datasets}</td>
          <td>{revokeMode ? <button className="btn-action btn-action--danger" disabled={mutation.busy || users.loading || !user.granted_datasets} onClick={() => revoke(user)}>{t('Revoke Entire Batch')}</button> : <button className="btn-action btn-action--primary" disabled={user.has_full_access || mutation.busy || users.loading} onClick={() => grant(user)}>{t(user.has_full_access ? 'Granted' : 'Grant Entire Batch')}</button>}</td>
        </tr>)}</tbody>
      </table></div>
    </AdminState>
    <nav className="admin-pagination"><span>{t('Page')} {page}</span><div className="admin-actions">
      <button className="btn-secondary" disabled={users.loading || mutation.busy || page <= 1} onClick={() => setPage(page - 1)}>{t('Previous')}</button>
      <button className="btn-secondary" disabled={users.loading || mutation.busy || !hasNextPage} onClick={() => setPage(page + 1)}>{t('Next')}</button>
    </div></nav>
  </AdminModal>
}
