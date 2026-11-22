import { Navigate, useParams } from 'react-router-dom'

export default function ScientistBestOverallPage() {
  const { groupId } = useParams()
  return <Navigate to={`/scientist/experiments/groups/${groupId}/compare`} replace />
}
