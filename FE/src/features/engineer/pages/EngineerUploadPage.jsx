import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload } from 'lucide-react'
import { engineerService } from '../../../services/engineerService'
import { useEngineerJob, useEngineerMutation } from '../../../hooks/useEngineerData'
import { useLanguage } from '../../../hooks/useLanguage'
import { EngineerBadge, EngineerFeedback, EngineerHeader, EngineerJob } from '../components/EngineerUi'
import { formatBytes, MAX_UPLOAD_SIZE_BYTES } from '../utils/engineerHelpers'

export default function EngineerUploadPage() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [files, setFiles] = useState([])
  const [metadata, setMetadata] = useState({ group_name: '', source: '', location_name: '', description: '' })
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [validation, setValidation] = useState('')
  const mutation = useEngineerMutation()
  const job = useEngineerJob('upload', true)
  const busy = mutation.busy || job.running
  const finalResult = result || job.data?.result
  const selectFiles = (selected) => {
    setValidation(''); mutation.clear()
    const next = Array.from(selected || [])
    const invalid = next.find((file) => !/^\d{8}_d\d+_\d{4}_\d{4}\.csv$/i.test(file.name) || !file.size || file.size > MAX_UPLOAD_SIZE_BYTES)
    if (invalid) { setValidation(t('Use non-empty CSV files named YYYYMMDD_dX_HHMM_HHMM.csv.')); return }
    setFiles(next); setResult(null); job.track(null)
  }
  const submit = async (event) => {
    event.preventDefault()
    if (!files.length) { setValidation(t('Select at least one CSV recording.')); return }
    setResult(null); setProgress(0); job.track(null)
    await mutation.run(async () => {
      const response = await engineerService.upload({ files, ...metadata }, (event) => {
        if (event.total) setProgress(Math.round(event.loaded * 100 / event.total))
      })
      if (response.job_id) job.track(response)
      else setResult(response)
      setFiles([])
    })
  }
  return <div className="de-workspace">
    <section className="admin-card">
      <EngineerHeader title="Upload Dataset" description="Select CSV recordings from multiple dates. Datasets and sessions are grouped automatically." />
      <form className="de-form" onSubmit={submit}>
        <label className="de-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!busy) selectFiles(event.dataTransfer.files) }}>
          <Upload size={30} /><strong>{t('Select or drop multiple CSV files')}</strong><span>YYYYMMDD_dX_HHMM_HHMM.csv</span>
          <input type="file" accept=".csv" multiple disabled={busy} aria-label={t('Select CSV files')} onChange={(event) => selectFiles(event.target.files)} />
        </label>
        {files.length > 0 && <div className="de-selected-files">{files.map((file, index) => <div key={file.name + index}><span>{file.name}</span><small>{formatBytes(file.size)}</small></div>)}</div>}
        <div className="de-form-grid">{[['group_name', 'Batch Name'], ['source', 'Source'], ['location_name', 'Location'], ['description', 'Description']].map(([key, label]) => <label className="form-field" key={key}>{t(label)}<input className="admin-input" maxLength={key === 'group_name' ? 128 : key === 'description' ? 2000 : 255} value={metadata[key]} disabled={busy} onChange={(event) => setMetadata({ ...metadata, [key]: event.target.value })} /></label>)}</div>
        {validation && <p className="admin-notice admin-notice--error" role="alert">{validation}</p>}
        <EngineerFeedback mutation={mutation} />
        {mutation.busy && <div><progress value={progress} max="100" /><p>{progress}% · {t('Uploading...')}</p></div>}
        <button className="btn-action btn-action--primary" disabled={busy || !files.length}><Upload size={16} />{t('Upload Dataset')} ({files.length})</button>
      </form>
    </section>
    <EngineerJob resource={job} />
    {finalResult && <section className="admin-card"><EngineerHeader title="Upload Results" /><div className="de-summary"><span>{t('Uploaded')}: {finalResult.uploaded_count}</span><span>{t('Duplicates')}: {finalResult.duplicate_count}</span><span>{t('Failed')}: {finalResult.failed_count}</span></div>
      <div className="admin-table-scroll"><table className="admin-table"><thead><tr>{['File', 'Dataset', 'Status', 'Note'].map((label) => <th key={label}>{t(label)}</th>)}</tr></thead><tbody>{finalResult.files.map((file, index) => <tr key={index}><td>{file.original_filename}</td><td>{file.dataset_name || '—'}</td><td><EngineerBadge value={file.status} /></td><td className="admin-wrap-cell">{file.error_message || '—'}</td></tr>)}</tbody></table></div>
      <div className="de-form"><button className="btn-secondary" onClick={() => navigate('/engineer/datasets' + (finalResult.group_id ? '?groupId=' + finalResult.group_id : ''))}>{t('View Datasets')}</button></div>
    </section>}
  </div>
}
