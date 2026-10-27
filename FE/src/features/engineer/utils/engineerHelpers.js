export const ALLOWED_EXTENSIONS = ['.csv', '.json', '.xls', '.xlsx', '.parquet']
export const MAX_UPLOAD_SIZE_BYTES = 1024 * 1024 * 1024 // 1 GB (1,073,741,824 bytes) client-side check
export const LINEAGE_STORAGE_KEY = 'pneuma_de_version_lineage_v1'
export const RECORD_CACHE_STORAGE_KEY = 'pneuma_de_record_counts_v1'

export const SAMPLE_PNEUMA_CSV_CONTENT = [
  'track_id;type;traveled_d;avg_speed;lat;lon;speed;lon_acc;lat_acc;time',
  '101;Car;145.8;34.2;37.97552;23.73482;32.5;0.15;-0.04;0.0;37.97561;23.73495;34.8;0.22;0.02;0.5;37.97574;23.73510;35.4;0.08;-0.01;1.0',
  '102;Motorcycle;210.4;42.6;37.97580;23.73460;41.2;0.45;0.12;0.0;37.97598;23.73479;43.9;0.31;-0.08;0.5',
  '103;Bus;98.2;22.1;37.97530;23.73520;21.8;-0.12;0.01;0.0;37.97539;23.73531;22.4;0.05;0.00;0.5',
  '104;Taxi;176.0;31.5;37.97610;23.73545;30.9;0.19;-0.05;0.0;37.97622;23.73560;32.1;0.14;0.03;0.5',
  '105;Medium Vehicle;120.5;27.4;37.97515;23.73440;27.0;0.09;0.02;0.0;37.97525;23.73452;27.8;0.11;-0.02;0.5',
].join('\n')

export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const val = bytes / Math.pow(1024, i)
  const displayVal =
    val >= 10 || i === 0 ? Math.round(val) : val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)
  return `${displayVal} ${units[i]}`
}

export function formatStructureLabel(structure) {
  switch (structure) {
    case 'pneuma_trajectory':
      return 'pNEUMA UAV Trajectory'
    case 'generic_csv':
      return 'Standard CSV'
    case 'generic_parquet':
      return 'Apache Parquet'
    case 'generic_json':
      return 'JSON'
    case 'generic_xlsx':
    case 'generic_xls':
      return 'Excel Spreadsheet'
    default:
      return structure || 'Unknown'
  }
}

export function loadJsonStorage(key, fallback = {}) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function saveJsonStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore storage quota errors
  }
}

export function resolveEffectiveVersionTag(item, versionLineageMap = {}) {
  if (!item) return 'v1.0'
  return versionLineageMap[item.dataset_id]?.customVersionTag || item.version_tag || 'v1.0'
}

export function resolveEffectiveRecordCount(item, recordCountsMap = {}) {
  if (!item) return null
  if (item.total_records && item.total_records > 0) return item.total_records
  if (recordCountsMap[item.dataset_id] != null) return recordCountsMap[item.dataset_id]
  return null
}

export function resolveEffectiveApprovalNote(item) {
  if (!item) return ''
  if (item.approval_note) return item.approval_note
  if (item.approval_status === 'APPROVED') {
    return 'Approved by Administrator: Meets pNEUMA UAV trajectory schema and quality requirements.'
  }
  if (item.approval_status === 'REJECTED') {
    return 'Rejected by Administrator: Schema or trajectory quality issues detected. Please clean and upload a new version iteration.'
  }
  return 'Awaiting Administrator review and quality sign-off.'
}
