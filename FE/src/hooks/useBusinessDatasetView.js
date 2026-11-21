import { useState } from 'react'

const DATASET_VIEWS = [
  { id: 'overview', label: 'Tổng quan', sections: ['metadata', 'statistics'] },
  { id: 'sessions', label: 'Danh sách session', sections: ['sessions'] },
  { id: 'traffic', label: 'Lưu lượng theo session', sections: ['traffic_flow_chart'] },
]

export function useBusinessDatasetView(resource) {
  const [selectedView, setSelectedView] = useState('overview')
  const views = DATASET_VIEWS.map((view) => ({
    ...view,
    sections: view.sections.filter((section) => resource.visible_sections.includes(section)),
  })).filter((view) => view.sections.length > 0)
  const activeView = views.find((view) => view.id === selectedView) || views[0]
  return { views, activeView, setSelectedView }
}
