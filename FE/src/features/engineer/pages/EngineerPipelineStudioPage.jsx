import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, FileOutput, Play } from 'lucide-react'
import { engineerService } from '../../../services/engineerService'
import { useEngineerWizard, useEngineerResource } from '../../../hooks/useEngineerData'
import { useLanguage } from '../../../hooks/useLanguage'
import { EngineerBadge, EngineerFeedback, EngineerHeader, EngineerJob, EngineerState } from '../components/EngineerUi'
import EngineerMapping from '../components/EngineerMapping'
import EngineerBatchBrowser from '../components/EngineerBatchBrowser'
import '../EngineerData.css'

const STEPS = ['Standardize Column Names', 'Normalize Data', 'Export File', 'Submit for Review']

function Pipeline({ groupId }) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [comment, setComment] = useState('')
  const workflow = useEngineerWizard(groupId)
  const { step, job, mutation, mapping, status, report, busy, normalized, exported } = workflow
  const hasRejected = status.data?.versions.some((version) => version.approval_status === 'REJECTED')
  const hasPending = status.data?.versions.some((version) => version.approval_status === 'PENDING')
  return <div className="de-workspace">
    <section className="admin-card">
      <EngineerHeader title="Pipeline Studio" onBack={() => navigate('/engineer/pipeline-studio')} onRefresh={workflow.refresh} />
      <nav className="de-stepper" aria-label={t('Pipeline Studio')}>
        {STEPS.map((label, index) => <button key={label} type="button" className={`de-stepper__step ${step === index + 1 ? 'is-current' : ''}`} aria-current={step === index + 1 ? 'step' : undefined} disabled={busy || !workflow.available[index]} onClick={() => workflow.goTo(index + 1)}>
          <span className="de-stepper__number">{index + 1}</span><span>{t(label)}</span>
        </button>)}
      </nav>
    </section>
    <EngineerFeedback mutation={mutation} />
    <div hidden={step !== 1}><EngineerMapping mapping={mapping} busy={busy} onDirty={workflow.markDirty} /></div>
    {(step === 2 || step === 3) && <>
      <section className="admin-card">
        <EngineerHeader title={STEPS[step - 1]} />
        <div className="de-stage">
          <div className="de-stage__icon">{step === 2 ? <Play size={24} /> : <FileOutput size={24} />}</div>
          <div><h3>{t(step === 2 ? 'Normalize the whole batch' : 'Export the whole batch')}</h3><p>{t(step === 2 ? 'Wait until all datasets finish successfully before continuing to file export.' : 'Export saves the processed files as new versions. The batch is sent for approval in the next step.')}</p></div>
        </div>
        <div className="de-wizard-actions">
          <button className="btn-secondary" disabled={busy} onClick={() => workflow.goTo(step - 1)}><ArrowLeft size={16} />{t('Previous')}</button>
          <div className="admin-actions">
            <button className="btn-action btn-action--primary" disabled={busy || (step === 2 ? !workflow.available[1] : !normalized)} onClick={() => workflow.process(step === 2 ? 'NORMALIZE' : 'EXPORT')}>
              {step === 2 ? <Play size={16} /> : <FileOutput size={16} />}{t(step === 2 ? 'Start Normalization' : 'Export File')}
            </button>
            <button className="btn-secondary" disabled={busy || (step === 2 ? !normalized : !exported)} onClick={() => workflow.goTo(step + 1)}>{t('Continue')}<ArrowRight size={16} /></button>
          </div>
        </div>
      </section>
      <EngineerJob resource={job} />
    </>}
    {step === 3 && exported && <section className="admin-card"><EngineerHeader title="Processing Report" />
      <EngineerState resource={report}>{report.data && <>
        <div className="de-summary"><span>{t('Datasets')}: {report.data.total_datasets}</span><span>{t('Sessions')}: {report.data.total_sessions}</span><span>{t('Records')}: {report.data.total_records_after.toLocaleString()}</span></div>
        <div className="admin-table-scroll"><table className="admin-table"><thead><tr>{['Dataset', 'Sessions', 'Records Before', 'Records After', 'Version'].map((label) => <th key={label}>{t(label)}</th>)}</tr></thead><tbody>{report.data.reports.map((row) => <tr key={row.dataset_id}><td>{row.dataset_name}</td><td>{row.source_session_count}</td><td>{row.records_before.toLocaleString()}</td><td>{row.records_after.toLocaleString()}</td><td>{row.version_tag}</td></tr>)}</tbody></table></div>
      </>}</EngineerState>
    </section>}
    {step === 4 && <section className="admin-card"><EngineerHeader title="Submit for Review" />
      <EngineerState resource={status}>{exported && status.data ? <>
        <div className="de-summary"><EngineerBadge value={status.data.approval_status} /><span>{status.data.total_datasets} {t('Datasets')}</span></div>
        <div className="admin-table-scroll"><table className="admin-table"><thead><tr>{['Dataset', 'Version', 'Sessions', 'Status', 'Note'].map((label) => <th key={label}>{t(label)}</th>)}</tr></thead><tbody>{status.data.versions.map((row) => <tr key={row.version_id}><td>{row.dataset_name}</td><td>{row.version_tag}</td><td>{row.source_session_count}</td><td><EngineerBadge value={row.approval_status} /></td><td className="admin-wrap-cell">{row.approval_note || '—'}</td></tr>)}</tbody></table></div>
      </> : <p className="empty-state">{t('Export this batch before submitting it for review.')}</p>}</EngineerState>
      <div className="de-form de-review-note"><label className="form-field" htmlFor="de-review-comment">{t('Note')}<textarea id="de-review-comment" className="admin-input" rows={4} maxLength={2000} placeholder={t('Add a comment for the administrator (optional)...')} disabled={busy || !exported} value={comment} onChange={(event) => setComment(event.target.value)} /><span className="de-review-note__count">{comment.length}/2000</span></label></div>
      <div className="de-wizard-actions">
        <button className="btn-secondary" disabled={busy} onClick={() => workflow.goTo(normalized ? 3 : 1)}><ArrowLeft size={16} />{t('Previous')}</button>
        <button className="btn-action btn-action--primary" disabled={busy || !exported || (!hasPending && !hasRejected)} onClick={() => hasRejected ? workflow.resubmit() : workflow.submit(comment)}><Check size={16} />{t(hasRejected ? 'Resubmit for Review' : 'Submit for Review')}</button>
      </div>
    </section>}
  </div>
}

export default function EngineerPipelineStudioPage() {
  const { t } = useLanguage()
  const [params] = useSearchParams()
  const datasetId = params.get('datasetId')
  const detail = useEngineerResource(engineerService.getDataset, { dataset_id: datasetId }, Boolean(datasetId) && !params.get('groupId'))
  const groupId = params.get('groupId') || detail.data?.group_id
  if (groupId) return <Pipeline key={groupId} groupId={groupId} />
  if (datasetId) return <EngineerState resource={detail}><p className="empty-state">{t('Dataset does not belong to a batch.')}</p></EngineerState>
  return <EngineerBatchBrowser mode="pipeline" />
}
