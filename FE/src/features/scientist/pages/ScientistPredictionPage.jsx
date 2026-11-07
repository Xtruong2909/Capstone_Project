import { useParams } from 'react-router-dom'
import { useApprovedDatasets, useDatasetPreview } from '../../../hooks/useScientistData'
import DatasetInfoPanel from '../components/DatasetInfoPanel'
import AggregationExplorer from '../components/AggregationExplorer'

/**
 * Prediction page - uses only 2 aggregation APIs:
 *  - GET .../traffic/aggregation/preview     (4th)
 *  - GET .../traffic/aggregation/chart-data  (last)
 */
export default function ScientistPredictionPage() {
  const { datasetId, versionId } = useParams()

  const { datasets, isLoading: isLoadingList } = useApprovedDatasets('')
  const meta = datasets.find((d) => d.dataset_id === datasetId && d.version_id === versionId)
  const { preview: datasetPreview } = useDatasetPreview(datasetId, versionId, {
    page: 1,
    pageSize: 1,
    representation: 'normalized',
  })

  return (
    <div className="sci-page">
      <DatasetInfoPanel
        item={meta}
        datasets={datasets}
        datasetId={datasetId}
        versionId={versionId}
        preview={datasetPreview}
        isLoading={isLoadingList}
      />

      <AggregationExplorer
        key={`aggregation:${datasetId}:${versionId}`}
        datasetId={datasetId}
        versionId={versionId}
        title="Prediction · Traffic Flow & Speed Forecast Insight"
        subtitle="Analyze historical traffic trends and time-bucket metrics for forecasting."
      />
    </div>
  )
}
