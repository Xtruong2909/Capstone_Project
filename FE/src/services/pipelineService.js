/**
 * pipelineService.js
 * 
 * Frontend API Service & Rule Engine for the Data Pipeline Studio.
 * Connects Frontend wizard steps to Backend endpoints for:
 * - Step 1: Column Mapping (GET columns, PATCH/GET column mappings, client-side suggestions)
 * - Step 2: Data Quality Inspection (POST quality-checks, GET status, GET report, GET issues)
 * - Step 3: Normalization & Final Preview (POST normalize, POST validate, GET preview, POST export, POST submit, GET status)
 * 
 * Backend Prefix: /api/v1 (injected via apiClient.baseURL)
 * Target Endpoints: /datasets/{dataset_id}/...
 */

import apiClient from './apiClient'

/**
 * 10 Standard pNEUMA UAV Trajectory Fields Definition.
 * Formats: 4 track-level fields + 6 trajectory point fields.
 */
export const PNEUMA_STANDARD_FIELDS = [
  {
    name: 'track_id',
    type: 'integer',
    required: true,
    description: 'Unique vehicle trajectory identifier across the recording',
    aliases: [
      'track_id',
      'vehicle_id',
      'trackid',
      'vehicleid',
      'id',
      'car_id',
      'veh_id',
      'trajid',
      'trajectory_id',
      'track',
    ],
  },
  {
    name: 'type',
    type: 'string',
    required: false,
    description: 'Vehicle classification type (e.g., Car, Taxi, Bus, Motorcycle, Medium/Heavy Vehicle)',
    aliases: [
      'type',
      'vehicle_type',
      'veh_type',
      'class',
      'category',
      'v_type',
      'car_type',
      'vehicletype',
    ],
  },
  {
    name: 'traveled_d',
    type: 'float',
    required: false,
    description: 'Total distance traveled by the vehicle in meters (m)',
    aliases: [
      'traveled_d',
      'traveled_distance',
      'distance',
      'dist',
      'travel_distance',
      'traveled_dist',
      'traveleddistance',
      'travel_d',
    ],
  },
  {
    name: 'avg_speed',
    type: 'float',
    required: false,
    description: 'Average trajectory speed in kilometers per hour (km/h)',
    aliases: [
      'avg_speed',
      'average_speed',
      'mean_velocity',
      'v_avg',
      'mean_speed',
      'avgspeed',
      'speed_avg',
      'vavg',
    ],
  },
  {
    name: 'lat',
    type: 'float',
    required: true,
    description: 'Trajectory point latitude coordinate in WGS84 degrees [-90.0, 90.0]',
    aliases: [
      'lat',
      'latitude',
      'y',
      'lat_wgs84',
      'coord_y',
      'pos_y',
      'latitude_deg',
      'gps_lat',
    ],
  },
  {
    name: 'lon',
    type: 'float',
    required: true,
    description: 'Trajectory point longitude coordinate in WGS84 degrees [-180.0, 180.0]',
    aliases: [
      'lon',
      'long',
      'longitude',
      'lng',
      'x',
      'lon_wgs84',
      'coord_x',
      'pos_x',
      'longitude_deg',
      'gps_lon',
    ],
  },
  {
    name: 'speed',
    type: 'float',
    required: true,
    description: 'Instantaneous vehicle speed in kilometers per hour (km/h >= 0)',
    aliases: [
      'speed',
      'velocity',
      'v',
      'spd',
      'current_speed',
      'instant_speed',
      'speed_kmh',
      'speed_mps',
      'velocity_kmh',
    ],
  },
  {
    name: 'lon_acc',
    type: 'float',
    required: false,
    description: 'Longitudinal acceleration along vehicle heading in m/s^2',
    aliases: [
      'lon_acc',
      'longitudinal_acceleration',
      'acc_lon',
      'ax',
      'acc_x',
      'long_acc',
      'lonacc',
      'longitudinal_acc',
      'accel_lon',
      'a_lon',
    ],
  },
  {
    name: 'lat_acc',
    type: 'float',
    required: false,
    description: 'Lateral acceleration perpendicular to vehicle heading in m/s^2',
    aliases: [
      'lat_acc',
      'lateral_acceleration',
      'acc_lat',
      'ay',
      'acc_y',
      'latacc',
      'lateral_acc',
      'accel_lat',
      'a_lat',
    ],
  },
  {
    name: 'time',
    type: 'float',
    required: true,
    description: 'Trajectory point timestamp / elapsed recording time in seconds (s >= 0)',
    aliases: [
      'time',
      'timestamp',
      'timestamp_ms',
      't',
      'datetime',
      'date_time',
      'time_sec',
      'elapsed_time',
      'timestep',
      'time_s',
    ],
  },
]

/**
 * Normalizes string for fuzzy/rule comparison:
 * Lowercases, trims, and strips underscores, hyphens, dots, and whitespace.
 */
function normalizeIdentifier(val) {
  if (typeof val !== 'string') return ''
  return val.trim().toLowerCase().replace(/[-_\s.]/g, '')
}

/**
 * Intelligent Client-Side Rule Engine for Column Mapping Suggestions.
 * Matches source headers against the 10 standard pNEUMA UAV fields using:
 * 1. Exact name match (confidence: 1.0)
 * 2. Case-insensitive exact match (confidence: 0.98)
 * 3. Normalized stripped match (confidence: 0.95)
 * 4. Authoritative alias match (confidence: 0.90)
 * 5. Normalized stripped alias match (confidence: 0.85)
 * 6. Semantic affix heuristic (confidence: 0.75)
 * 
 * Guarantees no two source columns are assigned to the same target standard field.
 *
 * @param {Array<string|object>} columns - List of source column strings or column descriptor objects
 * @returns {Array<{ source_column: string, target_column: string|null, confidence: number }>}
 */
export function suggestColumnMappings(columns) {
  if (!Array.isArray(columns) || columns.length === 0) {
    return []
  }

  // Extract source column names
  const sourceColumns = columns.map((col) => {
    if (typeof col === 'string') return col.trim()
    if (col && typeof col === 'object') {
      return (col.source_column || col.name || col.column_name || '').trim()
    }
    return String(col || '').trim()
  })

  // Build candidate matches for each (sourceColIndex, standardField)
  const candidates = []

  sourceColumns.forEach((sourceCol, colIndex) => {
    if (!sourceCol) return

    const rawLower = sourceCol.toLowerCase()
    const rawNorm = normalizeIdentifier(sourceCol)

    PNEUMA_STANDARD_FIELDS.forEach((field) => {
      let score = 0
      const fieldNorm = normalizeIdentifier(field.name)

      // 1. Exact match
      if (sourceCol === field.name) {
        score = 1.0
      }
      // 2. Case-insensitive match
      else if (rawLower === field.name.toLowerCase()) {
        score = 0.98
      }
      // 3. Normalized match (punctuation/separators stripped)
      else if (rawNorm === fieldNorm) {
        score = 0.95
      }
      // 4. Exact alias match
      else if (field.aliases.includes(rawLower)) {
        score = 0.90
      }
      // 5. Normalized alias match
      else {
        const aliasNormMatch = field.aliases.some(
          (alias) => normalizeIdentifier(alias) === rawNorm
        )
        if (aliasNormMatch) {
          score = 0.85
        }
        // 6. Affix / token heuristic (only for multi-char tokens to prevent single letter false positives)
        else if (field.name.length >= 3) {
          if (
            rawLower.startsWith(`${field.name}_`) ||
            rawLower.endsWith(`_${field.name}`) ||
            rawLower.startsWith(`${fieldNorm}`) ||
            rawLower.endsWith(`${fieldNorm}`)
          ) {
            score = 0.75
          }
        }
      }

      if (score > 0) {
        candidates.push({
          colIndex,
          source_column: sourceCol,
          target_column: field.name,
          confidence: score,
        })
      }
    })
  })

  // Sort candidate matches by confidence descending
  candidates.sort((a, b) => b.confidence - a.confidence)

  // Greedily assign highest confidence match without duplicate target assignment
  const assignedSources = new Map() // colIndex -> candidate
  const assignedTargets = new Set() // target_column

  for (const cand of candidates) {
    if (!assignedSources.has(cand.colIndex) && !assignedTargets.has(cand.target_column)) {
      assignedSources.set(cand.colIndex, cand)
      assignedTargets.add(cand.target_column)
    }
  }

  // Construct final result preserving original column order
  return sourceColumns.map((sourceCol, index) => {
    if (assignedSources.has(index)) {
      const match = assignedSources.get(index)
      return {
        source_column: sourceCol,
        target_column: match.target_column,
        confidence: match.confidence,
      }
    }
    return {
      source_column: sourceCol,
      target_column: null,
      confidence: 0,
    }
  })
}

// Alias for interface contract compatibility
export const suggestMappings = suggestColumnMappings

/**
 * Step 1: GET /datasets/{dataset_id}/columns
 * Inspect raw column headers and inferred types.
 */
export async function getDatasetColumns(datasetId) {
  const response = await apiClient.get(`/datasets/${datasetId}/columns`)
  return response.data
}

/**
 * Step 1: PATCH /datasets/{dataset_id}/column-mappings
 * Persist column mapping configuration to database.
 * Accepts either:
 * - Array of { source_column, target_column }
 * - Object with { mappings: [...] }
 * - Key-value dictionary { [source]: target }
 */
export async function saveColumnMappings(datasetId, mappings) {
  let payload
  if (Array.isArray(mappings)) {
    payload = { mappings }
  } else if (mappings && Array.isArray(mappings.mappings)) {
    payload = mappings
  } else if (mappings && typeof mappings === 'object') {
    payload = {
      mappings: Object.entries(mappings).map(([source_column, target_column]) => ({
        source_column,
        target_column: target_column || null,
      })),
    }
  } else {
    payload = { mappings: [] }
  }

  const response = await apiClient.patch(`/datasets/${datasetId}/column-mappings`, payload)
  return response.data
}

/**
 * Step 1: GET /datasets/{dataset_id}/column-mappings
 * Retrieve active saved column mappings.
 */
export async function getColumnMappings(datasetId) {
  const response = await apiClient.get(`/datasets/${datasetId}/column-mappings`)
  return response.data
}

/**
 * Step 2: POST /datasets/{dataset_id}/quality-checks
 * Queue an asynchronous data quality validation scan (HTTP 202 Accepted).
 */
export async function startQualityCheck(datasetId, outlierRules = null) {
  let body = {}
  if (Array.isArray(outlierRules)) {
    body = { outlier_rules: outlierRules }
  } else if (outlierRules && Array.isArray(outlierRules.outlier_rules)) {
    body = outlierRules
  } else if (outlierRules && typeof outlierRules === 'object') {
    body = outlierRules
  }

  const response = await apiClient.post(`/datasets/${datasetId}/quality-checks`, body)
  return response.data
}

/**
 * Step 2: GET /datasets/{dataset_id}/quality-checks/{check_id}
 * Poll execution progress and lifecycle status of a quality scan.
 */
export async function getQualityCheckStatus(datasetId, checkId) {
  const response = await apiClient.get(`/datasets/${datasetId}/quality-checks/${checkId}`)
  return response.data
}

/**
 * Step 2: GET /datasets/{dataset_id}/quality-checks/{check_id}/report
 * Fetch aggregated score card and issue breakdown metrics.
 */
export async function getQualityReport(datasetId, checkId) {
  const response = await apiClient.get(`/datasets/${datasetId}/quality-checks/${checkId}/report`)
  return response.data
}

/**
 * Step 2: GET /datasets/{dataset_id}/quality-checks/{check_id}/issues
 * Fetch paginated data quality issues.
 */
export async function getQualityIssues(datasetId, checkId, { page = 1, pageSize = 50, page_size } = {}) {
  const response = await apiClient.get(`/datasets/${datasetId}/quality-checks/${checkId}/issues`, {
    params: {
      page,
      page_size: pageSize ?? page_size ?? 50,
    },
  })
  return response.data
}

/**
 * Step 3: POST /datasets/{dataset_id}/normalize
 * Synchronously unpivot wide CSV into flat 10-column trajectory points and cache staging Parquet.
 */
export async function normalizeDataset(datasetId, { page = 1, pageSize = 20, page_size } = {}) {
  const response = await apiClient.post(`/datasets/${datasetId}/normalize`, null, {
    params: {
      page,
      page_size: pageSize ?? page_size ?? 20,
    },
  })
  return response.data
}

/**
 * Step 3: POST /datasets/{dataset_id}/normalize/validate
 * Fast check of staging Parquet for coordinate boundaries, speed, and duplicates.
 */
export async function validateNormalization(datasetId) {
  const response = await apiClient.post(`/datasets/${datasetId}/normalize/validate`)
  return response.data
}

/**
 * Step 3: GET /datasets/{dataset_id}/preview
 * Paginated preview rows for raw or normalized representation.
 */
export async function getNormalizedPreview(
  datasetId,
  { page = 1, pageSize = 20, page_size, representation = 'normalized' } = {}
) {
  const response = await apiClient.get(`/datasets/${datasetId}/preview`, {
    params: {
      page,
      page_size: pageSize ?? page_size ?? 20,
      representation,
    },
  })
  return response.data
}

/**
 * Step 3: POST /datasets/{dataset_id}/export
 * Commit normalized staging Parquet into a new official DatasetVersion.
 */
export async function exportNormalizedDataset(
  datasetId,
  {
    stagingId,
    staging_id,
    newVersionTag = 'v1.1',
    new_version_tag,
    exportFormat = 'PARQUET',
    export_format,
    qualityCheckId = null,
    quality_check_id,
  } = {}
) {
  const payload = {
    staging_id: stagingId ?? staging_id ?? null,
    new_version_tag: new_version_tag ?? newVersionTag ?? 'v1.1',
    export_format: export_format ?? exportFormat ?? 'PARQUET',
    quality_check_id: qualityCheckId ?? quality_check_id ?? null,
  }

  const response = await apiClient.post(`/datasets/${datasetId}/export`, payload)
  return response.data
}

/**
 * Step 3: POST /datasets/{dataset_id}/versions/{version_id}/submit
 * Submit exported dataset version to Administrator for approval.
 */
export async function submitVersionForReview(datasetId, versionId, note = '') {
  const payload = typeof note === 'string' ? { note } : (note || { note: '' })
  const response = await apiClient.post(`/datasets/${datasetId}/versions/${versionId}/submit`, payload)
  return response.data
}

/**
 * Step 3: POST /datasets/{dataset_id}/versions/{version_id}/resubmit
 * Re-submit a previously rejected dataset version after resolving feedback.
 */
export async function resubmitVersionForReview(datasetId, versionId, note = '') {
  const payload = typeof note === 'string' ? { note } : (note || { note: '' })
  const response = await apiClient.post(`/datasets/${datasetId}/versions/${versionId}/resubmit`, payload)
  return response.data
}

/**
 * GET /datasets/{dataset_id}/versions
 * List all versions associated with a specific dataset.
 */
export async function getDatasetVersionsByDatasetId(datasetId, params = {}) {
  const response = await apiClient.get(`/datasets/${datasetId}/versions`, { params })
  return response.data
}

/**
 * Step 3: GET /datasets/{dataset_id}/versions/{version_id}/status
 * Fetch approval review status and administrator notes.
 */
export async function getVersionStatus(datasetId, versionId) {
  const response = await apiClient.get(`/datasets/${datasetId}/versions/${versionId}/status`)
  return response.data
}

/**
 * Step 3 (Optional): GET /datasets/{dataset_id}/versions/{version_id}/report
 * Query processing history report for a version.
 */
export async function getProcessingReport(datasetId, versionId) {
  const response = await apiClient.get(`/datasets/${datasetId}/versions/${versionId}/report`)
  return response.data
}

export const pipelineService = {
  PNEUMA_STANDARD_FIELDS,
  suggestColumnMappings,
  suggestMappings,
  getDatasetColumns,
  saveColumnMappings,
  getColumnMappings,
  startQualityCheck,
  getQualityCheckStatus,
  getQualityReport,
  getQualityIssues,
  normalizeDataset,
  validateNormalization,
  getNormalizedPreview,
  exportNormalizedDataset,
  submitVersionForReview,
  resubmitVersionForReview,
  getDatasetVersionsByDatasetId,
  getVersionStatus,
  getProcessingReport,
}

export default pipelineService
