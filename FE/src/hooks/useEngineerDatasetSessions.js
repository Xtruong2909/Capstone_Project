import { useEngineerPage, useEngineerResource } from './useEngineerData'
import { engineerService } from '../services/engineerService'

export function useEngineerDatasetSessions(datasetId) {
  const dataset = useEngineerResource(engineerService.getDataset, { dataset_id: datasetId }, Boolean(datasetId))
  const groupId = dataset.data?.group_id
  const sessions = useEngineerPage(engineerService.listSessions,
    { group_id: groupId, dataset_id: datasetId }, Boolean(groupId && datasetId))
  return { dataset, sessions, groupId }
}
