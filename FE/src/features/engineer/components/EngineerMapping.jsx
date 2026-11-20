import { useState } from 'react'
import { useLanguage } from '../../../hooks/useLanguage'
import { EngineerFeedback, EngineerHeader, EngineerState } from './EngineerUi'

function MappingForm({ data, save, mutation, busy, onDirty }) {
  const { t } = useLanguage()
  const [values, setValues] = useState(() => Object.fromEntries(data.mappings.map((item) => [item.source_column, item.target_column])))
  return <form onSubmit={(event) => { event.preventDefault(); save(data.columns.map((column) => ({ source_column: column.source_column, target_column: values[column.source_column]?.trim() || null }))) }}>
    <div className="de-summary"><span>{data.dataset_count} {t('Datasets')}</span><span>{data.session_count} {t('Sessions')}</span></div>
    <EngineerFeedback mutation={mutation} />
    <div className="admin-table-scroll"><table className="admin-table"><thead><tr>{['Source Column', 'Type', 'Target Column'].map((label) => <th key={label}>{t(label)}</th>)}</tr></thead><tbody>{data.columns.map((column) => <tr key={column.source_column}>
      <td><code>{column.source_column}</code></td><td>{column.data_type}</td><td><input className="admin-input" aria-label={column.source_column} value={values[column.source_column] || ''} placeholder={column.source_column} pattern="[A-Za-z][A-Za-z0-9_]*" maxLength={128} disabled={busy || mutation.busy} onChange={(event) => { setValues({ ...values, [column.source_column]: event.target.value }); onDirty() }} /></td>
    </tr>)}</tbody></table></div>
    <div className="de-form"><button className="btn-action btn-action--primary" disabled={busy || mutation.busy}>{t('Save and Continue')}</button></div>
  </form>
}

export default function EngineerMapping({ mapping, busy, onDirty }) {
  const { resource, mutation, save } = mapping
  return <section className="admin-card"><EngineerHeader title="Standardize Column Names" description="Review source columns and save the target names before normalizing batch data." /><EngineerState resource={resource}>{resource.data && <MappingForm key={JSON.stringify(resource.data)} data={resource.data} save={save} mutation={mutation} busy={busy} onDirty={onDirty} />}</EngineerState></section>
}
