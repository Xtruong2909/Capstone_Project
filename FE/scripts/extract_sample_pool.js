import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DATASET_DIR = 'c:/Users/nhath/Downloads/FPT/ki 9/Project_Capstone/Dataset/pNEUMA_dataset'
const OUTPUT_FILE = path.resolve(__dirname, '../src/assets/data/pneuma_sample_pool.json')

const TARGET_TYPES = [
  'Car',
  'Motorcycle',
  'Taxi',
  'Bus',
  'Medium Vehicle',
  'Heavy Vehicle',
]

// Target 25 of each vehicle type = 150 vehicles total
const TARGET_PER_TYPE = 25
const POINTS_PER_VEHICLE = 180 // ~7.2 seconds at 25Hz genuine UAV tracking

const SOURCE_FILES = [
  '20181024_d1_0830_0900.csv',
  '20181024_d2_0830_0900.csv',
  '20181024_d3_0830_0900.csv',
  '20181024_d4_0830_0900.csv',
  '20181024_d10_0830_0900.csv',
]

async function extractPool() {
  console.log('Starting pNEUMA sample pool extraction...')
  const collected = {
    Car: [],
    Motorcycle: [],
    Taxi: [],
    Bus: [],
    'Medium Vehicle': [],
    'Heavy Vehicle': [],
  }

  for (const filename of SOURCE_FILES) {
    const filePath = path.join(DATASET_DIR, filename)
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}`)
      continue
    }

    console.log(`Scanning ${filename}...`)
    const fileStream = fs.createReadStream(filePath)
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity })

    let lineIndex = 0
    for await (const line of rl) {
      lineIndex++
      if (lineIndex === 1) continue // Skip header

      const parts = line.split(';').map((p) => p.trim()).filter(Boolean)
      if (parts.length < 10) continue

      const type = parts[1]
      if (!TARGET_TYPES.includes(type)) continue
      if (collected[type].length >= TARGET_PER_TYPE) continue

      const trackId = parts[0]
      const traveledD = parseFloat(parts[2])
      const avgSpeed = parseFloat(parts[3])

      const availablePoints = Math.floor((parts.length - 4) / 6)
      if (availablePoints < 50) continue // ensure high fidelity, skip degenerate very short tracks

      const pointsToTake = Math.min(availablePoints, POINTS_PER_VEHICLE)
      const trajectoryTokens = parts.slice(4, 4 + 6 * pointsToTake)

      // Ensure all tokens are valid numbers
      const isClean = trajectoryTokens.every((token) => Number.isFinite(parseFloat(token)))
      if (!isClean) continue

      const startLat = parseFloat(trajectoryTokens[0])
      const startLon = parseFloat(trajectoryTokens[1])
      const durationS = parseFloat(trajectoryTokens[trajectoryTokens.length - 1])

      collected[type].push({
        id: 0, // will assign sequentially
        original_track_id: parseInt(trackId, 10),
        source_file: filename,
        type,
        traveled_d: traveledD,
        avg_speed: avgSpeed,
        points_count: pointsToTake,
        duration_s: durationS,
        start_lat: startLat,
        start_lon: startLon,
        trajectory: trajectoryTokens.join('; '),
      })

      // Check if all filled
      const allFilled = TARGET_TYPES.every((t) => collected[t].length >= TARGET_PER_TYPE)
      if (allFilled) break
    }

    const currentCounts = Object.fromEntries(
      Object.entries(collected).map(([t, arr]) => [t, arr.length])
    )
    console.log('Current counts:', currentCounts)

    const allFilled = TARGET_TYPES.every((t) => collected[t].length >= TARGET_PER_TYPE)
    if (allFilled) break
  }

  // Interleave vehicles across types for natural variety
  const allVehicles = []
  let globalId = 1
  for (let i = 0; i < TARGET_PER_TYPE; i++) {
    for (const type of TARGET_TYPES) {
      if (collected[type][i]) {
        const item = collected[type][i]
        item.id = globalId++
        allVehicles.push(item)
      }
    }
  }

  const outputDir = path.dirname(OUTPUT_FILE)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const poolData = {
    metadata: {
      generated_at: new Date().toISOString(),
      source: 'pNEUMA Drone Swarm - EPFL Open Traffic Dataset (Athens)',
      total_vehicles: allVehicles.length,
      types: TARGET_TYPES,
      type_counts: Object.fromEntries(
        TARGET_TYPES.map((t) => [t, collected[t].length])
      ),
      standard_columns: [
        'track_id',
        'type',
        'traveled_d',
        'avg_speed',
        'lat',
        'lon',
        'speed',
        'lon_acc',
        'lat_acc',
        'time',
      ],
    },
    vehicles: allVehicles,
  }

  const jsonStr = JSON.stringify(poolData)
  fs.writeFileSync(OUTPUT_FILE, jsonStr, 'utf-8')

  const stats = fs.statSync(OUTPUT_FILE)
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2)
  console.log(`Successfully generated ${OUTPUT_FILE}`)
  console.log(`Total vehicles: ${allVehicles.length}`)
  console.log(`File size: ${stats.size} bytes (${sizeMB} MB)`)
}

extractPool().catch((err) => {
  console.error('Extraction failed:', err)
  process.exit(1)
})
