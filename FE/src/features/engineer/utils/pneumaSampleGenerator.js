export const PNEUMA_VEHICLE_TYPES = [
  'Car',
  'Motorcycle',
  'Taxi',
  'Bus',
  'Medium Vehicle',
  'Heavy Vehicle',
]

export const VEHICLE_COUNT_OPTIONS = [5, 10, 20, 50]

export const PNEUMA_CSV_HEADER =
  'track_id;type;traveled_d;avg_speed;lat;lon;speed;lon_acc;lat_acc;time'

let cachedPool = null

/**
 * Dynamically loads the ~1.5MB genuine pNEUMA sample pool JSON.
 */
export async function getSamplePool() {
  if (!cachedPool) {
    const mod = await import('../../../assets/data/pneuma_sample_pool.json', {
      with: { type: 'json' },
    })
    cachedPool = mod.default || mod
  }
  return cachedPool
}

/**
 * Returns metadata about the genuine pNEUMA sample pool.
 */
export async function getSamplePoolMetadata() {
  const pool = await getSamplePool()
  return (
    pool.metadata || {
      total_vehicles: pool.vehicles?.length || 0,
      types: PNEUMA_VEHICLE_TYPES,
      type_counts: {},
    }
  )
}

/**
 * Generates a pNEUMA semicolon-delimited CSV string from genuine recordings.
 *
 * @param {Object} options
 * @param {string[]} options.selectedTypes Array of vehicle types to include
 * @param {number} options.vehicleCount Target number of vehicles (5, 10, 20, 50)
 * @returns {Promise<{ csvContent: string, selectedVehicles: Array, count: number, types: string[] }>}
 */
export async function generatePneumaSampleCsv({
  selectedTypes = PNEUMA_VEHICLE_TYPES,
  vehicleCount = 5,
} = {}) {
  const pool = await getSamplePool()
  const rawTypes =
    Array.isArray(selectedTypes) && selectedTypes.length > 0
      ? selectedTypes
      : PNEUMA_VEHICLE_TYPES
  const validTypes = Array.from(new Set(rawTypes)).filter((t) =>
    PNEUMA_VEHICLE_TYPES.includes(t)
  )
  const typesToFilter = validTypes.length > 0 ? validTypes : PNEUMA_VEHICLE_TYPES

  const allVehicles = pool?.vehicles || []

  // Group vehicles by type
  const byType = {}
  for (const type of typesToFilter) {
    byType[type] = allVehicles.filter((v) => v.type === type)
  }

  // Balanced round-robin selection across chosen types
  const selectedVehicles = []
  const pointer = {}
  for (const type of typesToFilter) {
    pointer[type] = 0
  }

  let typeIndex = 0
  const parsedCount = parseInt(vehicleCount, 10)
  const totalTarget = Math.min(100, Math.max(1, Number.isFinite(parsedCount) ? parsedCount : 5))

  while (selectedVehicles.length < totalTarget) {
    const currentType = typesToFilter[typeIndex % typesToFilter.length]
    const list = byType[currentType]

    if (list && list.length > 0) {
      const vehicle = list[pointer[currentType] % list.length]
      pointer[currentType]++
      selectedVehicles.push(vehicle)
    }

    typeIndex++
    // Safety check: if no candidates in any selected type
    if (typesToFilter.every((t) => !byType[t] || byType[t].length === 0)) {
      break
    }
  }

  if (selectedVehicles.length === 0) {
    throw new Error('No genuine trajectory vehicles found in the sample pool matching the selection.')
  }

  // Construct standard pNEUMA CSV content with 10 standard columns
  const lines = [PNEUMA_CSV_HEADER]

  selectedVehicles.forEach((v, idx) => {
    const trackId = idx + 1
    // Format: track_id;type;traveled_d;avg_speed;lat;lon;speed;lon_acc;lat_acc;time;...
    lines.push(
      `${trackId}; ${v.type}; ${v.traveled_d}; ${v.avg_speed}; ${v.trajectory}`
    )
  })

  // Conclude with trailing newline following standard POSIX CSV conventions
  const csvContent = lines.join('\n') + '\n'

  return {
    csvContent,
    selectedVehicles,
    count: selectedVehicles.length,
    types: typesToFilter,
  }
}

/**
 * Creates a browser File instance of genuine pNEUMA trajectory CSV dataset.
 *
 * @param {Object} options
 * @param {string[]} options.selectedTypes
 * @param {number} options.vehicleCount
 * @returns {Promise<{ file: File, summary: Object }>}
 */
export async function generatePneumaSampleFile({
  selectedTypes = PNEUMA_VEHICLE_TYPES,
  vehicleCount = 5,
} = {}) {
  const result = await generatePneumaSampleCsv({ selectedTypes, vehicleCount })
  const blob = new Blob([result.csvContent], { type: 'text/csv;charset=utf-8;' })
  const timestampSuffix = new Date().toTimeString().slice(0, 8).replace(/:/g, '')

  const typeSlug =
    result.types.length === PNEUMA_VEHICLE_TYPES.length
      ? 'all_types'
      : result.types.map((t) => t.toLowerCase().replace(/\s+/g, '_')).join('_')

  const filename = `pneuma_athens_${typeSlug}_${result.count}veh_${timestampSuffix}.csv`
  const file = new File([blob], filename, { type: 'text/csv' })

  return {
    file,
    summary: {
      count: result.count,
      types: result.types,
      filename,
      approxPoints: result.count * 180,
      timestampSuffix,
    },
  }
}

/**
 * Instantly creates a balanced 5-vehicle genuine pNEUMA sample file.
 */
export async function quickGeneratePneumaSampleFile() {
  return generatePneumaSampleFile({
    selectedTypes: PNEUMA_VEHICLE_TYPES,
    vehicleCount: 5,
  })
}
