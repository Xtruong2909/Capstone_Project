import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

// Exercise the hook lifecycle without requiring a browser or a live API.
const source = readFileSync(new URL('../src/hooks/useTrafficForecast.js', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '')
  .replace(/export function /g, 'function ')

function mount(service, datasetId = 'dataset-a', featureState = null) {
  const slots = []
  let cursor = 0
  let effect
  let cleanup
  const context = vm.createContext({
    trafficForecastService: service,
    trainingFeatureState: featureState,
    extractErrorMessage: (error) => error.message,
    setTimeout,
    clearTimeout,
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = initial
      return [slots[index], (value) => { slots[index] = value }]
    },
    useRef(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = { current: initial }
      return slots[index]
    },
    useEffect(callback) { effect = callback },
    useCallback(callback) { return callback },
  })
  vm.runInContext(source, context)
  const render = () => {
    cursor = 0
    return featureState
      ? context.useTrainingFeatureEngineering(datasetId, 'version-1')
      : context.useOneMinuteVehicleAggregation(datasetId)
  }
  render()
  cleanup = effect()
  return {
    read: render,
    unmount: () => cleanup(),
    switchDataset(nextId) {
      cleanup()
      datasetId = nextId
      render()
      cleanup = effect()
    },
  }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

function featureMemory() {
  const entries = new Map()
  return {
    read: (dataset, version) => entries.get(`${dataset}:${version}`) || null,
    save: (dataset, version, roi) => entries.set(`${dataset}:${version}`, roi),
  }
}

test('features require a click first and restore the successful ROI after remount', async () => {
  const memory = featureMemory()
  let calls = 0
  const data = { sample_count: 2, roi_identifier: 'CUSTOM_ROI', samples: [] }
  const service = {
    async prepareTrainingFeatures(version, roi) {
      assert.equal(version, 'version-1')
      assert.equal(roi, 'CUSTOM_ROI')
      calls += 1
      return data
    },
  }
  const first = mount(service, 'dataset-a', memory)
  await flush()
  assert.equal(calls, 0)
  assert.equal(first.read().featureData, null)
  await first.read().generateTrainingFeatures('CUSTOM_ROI')
  assert.equal(first.read().featureData, data)
  first.unmount()
  const next = mount(service, 'dataset-a', memory)
  assert.equal(next.read().isLoading, true)
  await flush()
  assert.equal(next.read().roiInput, 'CUSTOM_ROI')
  assert.equal(next.read().featureData, data)
  assert.equal(calls, 2)
  next.switchDataset('dataset-b')
  await flush()
  assert.equal(next.read().featureData, null)
  assert.equal(calls, 2)
  next.unmount()
})

test('failed extraction does not mark features as saved', async () => {
  const memory = featureMemory()
  const hook = mount({
    async prepareTrainingFeatures() { throw new Error('Request failed') },
  }, 'dataset-a', memory)
  await hook.read().generateTrainingFeatures()
  assert.equal(hook.read().error, 'Request failed')
  assert.equal(memory.read('dataset-a', 'version-1'), null)
  hook.unmount()
})

test('late feature restore cannot overwrite another dataset', async () => {
  const memory = featureMemory()
  memory.save('dataset-a', 'version-1', 'MAIN_ROI')
  let finish
  const hook = mount({
    prepareTrainingFeatures() { return new Promise((resolve) => { finish = resolve }) },
  }, 'dataset-a', memory)
  hook.switchDataset('dataset-b')
  finish({ sample_count: 2 })
  await flush()
  assert.equal(hook.read().featureData, null)
  assert.equal(hook.read().isLoading, false)
  hook.unmount()
})

test('restores saved results on every visit without starting another aggregation', async () => {
  const chart = { time_labels: ['2018-10-24'], vehicle_count: [227] }
  const service = {
    async getAggregationStatus() { return { is_ready: true, records_count: 14 } },
    async getAggregationChartData() { return chart },
    startAggregation() { assert.fail('Restoring must not start a new job') },
  }
  for (let visit = 0; visit < 2; visit += 1) {
    const hook = mount(service)
    assert.equal(hook.read().isLoading, true)
    await flush()
    assert.equal(hook.read().chart, chart)
    assert.equal(hook.read().statusInfo.records_count, 14)
    assert.equal(hook.read().isLoading, false)
    hook.unmount()
  }
})

test('keeps an unaggregated dataset empty', async () => {
  const hook = mount({
    async getAggregationStatus() { return { is_ready: false, records_count: 0 } },
    getAggregationChartData() { assert.fail('No saved chart exists') },
  })
  await flush()
  assert.equal(hook.read().chart, null)
  assert.equal(hook.read().error, null)
  assert.equal(hook.read().isLoading, false)
  hook.unmount()
})

test('reports load failures instead of claiming no aggregation exists', async () => {
  const hook = mount({
    async getAggregationStatus() { throw new Error('Network unavailable') },
  })
  await flush()
  assert.equal(hook.read().error, 'Network unavailable')
  assert.equal(hook.read().isLoading, false)
  hook.unmount()
})

test('ignores old dataset responses after navigation', async () => {
  let resolveOldChart
  const hook = mount({
    async getAggregationStatus(id) { return { is_ready: id === 'dataset-a' } },
    getAggregationChartData() {
      return new Promise((resolve) => { resolveOldChart = resolve })
    },
  })
  await flush()
  hook.switchDataset('dataset-b')
  await flush()
  resolveOldChart({ vehicle_count: [227] })
  await flush()
  assert.equal(hook.read().chart, null)
  assert.equal(hook.read().statusInfo.is_ready, false)
  assert.equal(hook.read().isLoading, false)
  hook.unmount()
})
