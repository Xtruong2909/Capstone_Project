import { useState } from 'react'
import { adminService } from '../../../services/adminService'
import { useAdminMutation, useAdminPage, useAdminResource } from '../../../hooks/useAdminData'
import { useLanguage } from '../../../hooks/useLanguage'
import { AdminFeedback, AdminModal, AdminPagination, AdminState } from './AdminUi'

function EligibleUsers({ dataset, onGranted }) {
  const { t } = useLanguage()
  const [search, setSearch] = useState('')
  const [paging, setPaging] = useState({ search: '', page: 1 })
  const page = paging.search === search ? paging.page : 1
  const users = useAdminResource(adminService.getEligibleUsers, { dataset_id: dataset.dataset_id, search: search || undefined, skip: (page - 1) * 20, limit: 20 })
  const mutation = useAdminMutation()
  return <>
    <AdminFeedback mutation={mutation} />
    <input className="admin-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('Search by name or email...')} aria-label={t('Search by name or email...')} />
    <AdminState resource={{ ...users, items: users.data }}><div className="admin-table-scroll"><table className="admin-table"><thead><tr>{['Account', 'Role', 'Action'].map((label) => <th key={label}>{t(label)}</th>)}</tr></thead><tbody>{(users.data || []).map((user) => <tr key={user.user_id}>
      <td><strong>{user.full_name}</strong><small className="admin-cell-note">{user.email}</small></td><td>{t(user.role)}</td><td><button className="btn-action btn-action--primary" disabled={user.has_access || mutation.busy} onClick={() => mutation.run(() => adminService.grantAccess({ dataset_id: dataset.dataset_id, user_id: user.user_id }), () => { users.reload(); onGranted?.() })}>{t(user.has_access ? 'Granted' : 'Grant Access')}</button></td>
    </tr>)}</tbody></table></div></AdminState>
    <nav className="admin-pagination"><span>{t('Page')} {page}</span><div className="admin-actions"><button className="btn-secondary" disabled={users.loading || mutation.busy || page <= 1} onClick={() => setPaging({ search, page: page - 1 })}>{t('Previous')}</button><button className="btn-secondary" disabled={users.loading || mutation.busy || (users.data || []).length < 20} onClick={() => setPaging({ search, page: page + 1 })}>{t('Next')}</button></div></nav>
  </>
}

export default function AdminGrantDialog({ dataset: initialDataset, onClose, onGranted }) {
  const { t } = useLanguage()
  const [dataset, setDataset] = useState(initialDataset || null)
  const [search, setSearch] = useState('')
  const datasets = useAdminPage(adminService.getDatasets, { approval_status: 'APPROVED', search: search || undefined }, !dataset)
  return <AdminModal title={t('Grant Dataset Access')} onClose={onClose}>
    {dataset ? <><h4>{dataset.dataset_name}</h4>{!initialDataset && <button className="btn-secondary" onClick={() => setDataset(null)}>← {t('Select Dataset')}</button>}<EligibleUsers key={dataset.dataset_id} dataset={dataset} onGranted={onGranted} /></> : <>
      <input className="admin-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('Search datasets...')} aria-label={t('Search datasets...')} />
      <AdminState resource={datasets}><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>{t('Dataset')}</th><th>{t('Version')}</th><th>{t('Action')}</th></tr></thead><tbody>{datasets.items.map((item) => <tr key={item.id}><td>{item.dataset_name}</td><td>{item.version_tag}</td><td><button className="btn-secondary" onClick={() => setDataset(item)}>{t('Select')}</button></td></tr>)}</tbody></table></div></AdminState><AdminPagination {...datasets} />
    </>}
  </AdminModal>
}
