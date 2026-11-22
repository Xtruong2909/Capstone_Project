import { useSearchParams } from 'react-router-dom'
import EngineerBatchBrowser from '../components/EngineerBatchBrowser'
import EngineerDatasetSessions from '../components/EngineerDatasetSessions'

export default function EngineerPreviewPage() {
  const [params] = useSearchParams()
  const datasetId = params.get('datasetId')
  return datasetId
    ? <EngineerDatasetSessions key={datasetId} datasetId={datasetId} sessionId={params.get('sessionId')} />
    : <EngineerBatchBrowser mode="preview" />
}
