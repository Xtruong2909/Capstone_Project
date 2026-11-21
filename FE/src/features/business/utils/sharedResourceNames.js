export function sharedResourceName(resource) {
  const data = resource.data || {}
  if (resource.resource_type === 'DATASET') {
    return data.metadata?.dataset_name || resource.name || `Dataset ${resource.resource_id.slice(0, 8)}`
  }
  if (resource.resource_type === 'EXPERIMENT') {
    return resource.name || data.experiment_summary?.experiment_name || `Thí nghiệm ${resource.resource_id.slice(0, 8)}`
  }
  if (resource.resource_type === 'PREDICTION') {
    if (resource.name) return resource.name
    const date = data.forecast_summary?.created_at && new Date(data.forecast_summary.created_at)
    return date && !Number.isNaN(date.getTime())
      ? `Dự báo · ${date.toLocaleString('vi-VN')}`
      : `Dự báo ${resource.resource_id.slice(0, 8)}`
  }
  return resource.name || resource.resource_type
}
