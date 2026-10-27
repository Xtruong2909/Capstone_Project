import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  PNEUMA_VEHICLE_TYPES,
  VEHICLE_COUNT_OPTIONS,
  PNEUMA_CSV_HEADER,
  generatePneumaSampleCsv,
  generatePneumaSampleFile,
  quickGeneratePneumaSampleFile,
  getSamplePool,
  getSamplePoolMetadata,
} from '../src/features/engineer/utils/pneumaSampleGenerator.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function runTests() {
  console.log('🧪 Starting pNEUMA Sample Generation Test Suite...\n')

  // 1. Verify Sample Pool Integrity & Metadata
  const pool = await getSamplePool()
  assert(pool.vehicles && pool.vehicles.length >= 100, 'Pool should have at least 100 vehicles')
  console.log(`✓ Pool Loaded: ${pool.vehicles.length} vehicles across 6 types`)

  for (const type of PNEUMA_VEHICLE_TYPES) {
    const count = pool.vehicles.filter((v) => v.type === type).length
    assert(count >= 20, `Expected at least 20 vehicles for type ${type}, got ${count}`)
    console.log(`  - ${type}: ${count} genuine trajectories`)
  }

  const meta = await getSamplePoolMetadata()
  assert.strictEqual(meta.total_vehicles, pool.vehicles.length, 'Metadata total_vehicles must match pool size')
  assert.deepStrictEqual(meta.types, PNEUMA_VEHICLE_TYPES, 'Metadata types must match standard types')
  assert.deepStrictEqual(VEHICLE_COUNT_OPTIONS, [5, 10, 20, 50], 'Vehicle count options must match [5, 10, 20, 50]')
  console.log('✓ Metadata and VEHICLE_COUNT_OPTIONS verified')

  // 2. Test Quick 1-Click Generate (Balanced 5 vehicles)
  console.log('\n--- Test: Quick 1-Click Generate ---')
  const quick = await quickGeneratePneumaSampleFile()
  assert(quick.file, 'Quick generate should return a File instance')
  assert(quick.file.name.endsWith('.csv'), 'Filename should end with .csv')
  assert(quick.file.size > 0, 'Generated file size must be > 0 bytes')
  assert(quick.summary.count === 5, 'Quick generate should produce 5 vehicles')

  const quickCsv = await generatePneumaSampleCsv({ vehicleCount: 5 })
  const quickLines = quickCsv.csvContent.split('\n').map((l) => l.trim()).filter(Boolean)
  assert.strictEqual(quickLines[0], PNEUMA_CSV_HEADER, 'Header must match standard 10 columns')
  assert.strictEqual(quickLines.length, 6, 'Total lines must be 6 (1 header + 5 vehicles)')

  const quickTypes = quickLines.slice(1).map((l) => l.split(';')[1].trim())
  console.log('  Quick 5 vehicle types generated:', quickTypes)
  assert(new Set(quickTypes).size >= 4, 'Quick generate should be balanced across distinct types')
  console.log('✓ Quick 1-Click Generate verified')

  // 3. Test generatePneumaSampleFile with Custom Parameters
  console.log('\n--- Test: generatePneumaSampleFile Custom Outputs ---')
  const customFileResult = await generatePneumaSampleFile({
    selectedTypes: ['Taxi', 'Bus'],
    vehicleCount: 10,
  })
  assert(customFileResult.file instanceof File, 'Must return browser File instance')
  assert(customFileResult.file.name.includes('taxi_bus_10veh'), 'Filename must reflect types and count')
  assert(customFileResult.summary.count === 10, 'Summary count must be 10')
  assert.deepStrictEqual(customFileResult.summary.types, ['Taxi', 'Bus'], 'Summary types must match')
  assert.strictEqual(customFileResult.summary.approxPoints, 1800, 'Approx points must match count * 180')
  assert(
    typeof customFileResult.summary.timestampSuffix === 'string' &&
      customFileResult.summary.timestampSuffix.length === 6,
    'Summary must include 6-character timestampSuffix'
  )
  console.log('✓ generatePneumaSampleFile verified (including timestampSuffix)')

  // 4. Test Filtering by Selected Types
  console.log('\n--- Test: Filtering by Selected Types ---')
  const testSubsets = [
    ['Motorcycle', 'Taxi'],
    ['Bus', 'Heavy Vehicle'],
    ['Car'],
    ['Medium Vehicle'],
    ['Car', 'Motorcycle', 'Bus', 'Heavy Vehicle'],
  ]

  for (const subset of testSubsets) {
    for (const count of [5, 10, 20, 50]) {
      const res = await generatePneumaSampleCsv({ selectedTypes: subset, vehicleCount: count })
      const lines = res.csvContent.split('\n').map((l) => l.trim()).filter(Boolean)
      const dataRows = lines.slice(1)
      assert.strictEqual(dataRows.length, count, `Expected ${count} rows, got ${dataRows.length}`)

      const typesInRows = dataRows.map((r) => r.split(';')[1].trim())
      const uniqueTypesInRows = Array.from(new Set(typesInRows))

      // Every vehicle in rows MUST be strictly in the selected subset
      for (const t of uniqueTypesInRows) {
        assert(subset.includes(t), `Row vehicle type "${t}" is not in selected subset [${subset}]`)
      }
    }
    console.log(`✓ Subset [${subset.join(', ')}] verified for all count options (5, 10, 20, 50)`)
  }

  // 5. Test Deduplication, Unknown & Non-Array Type Sanitization
  console.log('\n--- Test: Deduplication & Non-Array Type Sanitization ---')
  const dedupSample = await generatePneumaSampleCsv({
    selectedTypes: ['Car', 'Car', 'Taxi', 'Taxi'],
    vehicleCount: 6,
  })
  assert.deepStrictEqual(dedupSample.types, ['Car', 'Taxi'], 'Duplicate types must be deduplicated')
  assert.strictEqual(dedupSample.count, 6, 'Must generate exactly 6 vehicles')

  const unknownTypeSample = await generatePneumaSampleCsv({
    selectedTypes: ['Hovercraft', 'Spaceship'],
    vehicleCount: 5,
  })
  assert.deepStrictEqual(unknownTypeSample.types, PNEUMA_VEHICLE_TYPES, 'Fallback to standard types for invalid input')

  const nonArrayTypeSample1 = await generatePneumaSampleCsv({ selectedTypes: 123, vehicleCount: 5 })
  assert.deepStrictEqual(nonArrayTypeSample1.types, PNEUMA_VEHICLE_TYPES, 'Numeric selectedTypes falls back to standard types')

  const nonArrayTypeSample2 = await generatePneumaSampleCsv({ selectedTypes: null, vehicleCount: 5 })
  assert.deepStrictEqual(nonArrayTypeSample2.types, PNEUMA_VEHICLE_TYPES, 'Null selectedTypes falls back to standard types')
  console.log('✓ Deduplication & non-array type sanitization verified')

  // 6. Test Coordinate Validity (Athens Bounding Box)
  console.log('\n--- Test: Athens GPS Coordinate Verification ---')
  const sample50 = await generatePneumaSampleCsv({ vehicleCount: 50 })
  const sampleLines = sample50.csvContent
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(1)
  for (const line of sampleLines) {
    const parts = line.split(';').map((p) => p.trim())
    const trackId = parseInt(parts[0], 10)
    assert(Number.isInteger(trackId) && trackId > 0, 'track_id must be positive integer')

    const lat = parseFloat(parts[4])
    const lon = parseFloat(parts[5])
    assert(lat >= 37.95 && lat <= 38.05, `Latitude ${lat} must be within Athens CBD corridor`)
    assert(lon >= 23.70 && lon <= 23.78, `Longitude ${lon} must be within Athens CBD corridor`)

    // Kinematics
    const speed = parseFloat(parts[6])
    assert(speed >= 0 && speed <= 150, `Speed ${speed} km/h must be realistic`)
  }
  console.log(`✓ All 50 vehicles verified inside Athens GPS bounding box & realistic kinematics`)

  // 7. Test Trailing Newline & POSIX Compliance
  console.log('\n--- Test: POSIX & CSV Formatting Integrity ---')
  assert(quickCsv.csvContent.endsWith('\n'), 'CSV output must end with trailing newline')
  assert(sample50.csvContent.endsWith('\n'), '50-vehicle CSV output must end with trailing newline')
  console.log('✓ POSIX trailing newline verified')

  // 8. Test vehicleCount Edge Cases & Sanitization
  console.log('\n--- Test: vehicleCount Sanitization & Bounds Clamping ---')
  const stringCountSample = await generatePneumaSampleCsv({ vehicleCount: '10' })
  assert.strictEqual(stringCountSample.count, 10, 'String count "10" should parse to 10 vehicles')

  const nanCountSample = await generatePneumaSampleCsv({ vehicleCount: 'invalid_count' })
  assert.strictEqual(nanCountSample.count, 5, 'Invalid count should fall back to 5')

  const negativeCountSample = await generatePneumaSampleCsv({ vehicleCount: -10 })
  assert.strictEqual(negativeCountSample.count, 1, 'Negative count should clamp to min 1')

  const clampedCountSample = await generatePneumaSampleCsv({ vehicleCount: 999 })
  assert.strictEqual(clampedCountSample.count, 100, 'Huge count should clamp to max 100')

  const singleType50 = await generatePneumaSampleCsv({ selectedTypes: ['Motorcycle'], vehicleCount: 50 })
  assert.strictEqual(singleType50.count, 50, 'Single vehicle type with 50 requested should deliver 50 tracks via round-robin')
  const linesSingle = singleType50.csvContent.split('\n').filter(Boolean).slice(1)
  assert.strictEqual(linesSingle.length, 50, 'Must contain exactly 50 data lines')
  for (const line of linesSingle) {
    assert(line.split(';')[1].trim() === 'Motorcycle', 'All rows must be Motorcycle')
  }
  console.log('✓ vehicleCount sanitization & bounds clamping verified')

  // 9. Save a test CSV file to run through Backend Python Parser
  const testOutputPath = path.resolve(__dirname, 'test_generated_pneuma.csv')
  fs.writeFileSync(testOutputPath, sample50.csvContent, 'utf-8')
  console.log(`\n✓ Saved test CSV to ${testOutputPath} for Backend Python Verification`)
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err)
  process.exit(1)
})

