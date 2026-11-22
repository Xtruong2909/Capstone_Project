import EngineerBatchBrowser from '../components/EngineerBatchBrowser'
import { CheckCircle2, X } from 'lucide-react'
import { useEngineerCatalogNotice } from '../../../hooks/useEngineerReviewSubmission'

export default function EngineerCatalogPage() {
  const { notice, dismiss } = useEngineerCatalogNotice()
  return <div className="de-workspace">
    {notice && <div role="status" aria-live="polite" className="eng-alert eng-alert--success">
      <div className="eng-alert__content"><CheckCircle2 size={20} /><span>{notice}</span></div>
      <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm" onClick={dismiss} aria-label="Đóng thông báo"><X size={16} /></button>
    </div>}
    <EngineerBatchBrowser mode="catalog" />
  </div>
}
