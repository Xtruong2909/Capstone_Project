import { Upload } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useEngineerUpload } from '../../../hooks/useEngineerUpload'
import { useLanguage } from '../../../hooks/useLanguage'

export default function EngineerUploadStatus() {
  const { busy, mutation, progress } = useEngineerUpload()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { t } = useLanguage()
  if (!busy || pathname === '/engineer/upload') return null
  return <div className="eng-alert eng-alert--info" role="status" aria-live="polite">
    <div className="eng-alert__content">
      <Upload size={18} />
      <span>{t('Batch upload continues in the background.')} {' '}
        {mutation.busy ? `${progress}%` : t('Saving dataset information')}</span>
    </div>
    <button type="button" className="btn-secondary" onClick={() => navigate('/engineer/upload')}>
      {t('View upload progress')}
    </button>
  </div>
}
