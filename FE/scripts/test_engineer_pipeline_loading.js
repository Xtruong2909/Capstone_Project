import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'

const source = fs.readFileSync(new URL('../src/hooks/useEngineerData.js', import.meta.url), 'utf8')
  .replace(/^import .*\r?\n/gm, '').replace(/^export \{.*\} from .*\r?\n/gm, '').replace(/^export /gm, '')

function setup({ exported = false, job = {}, mappingLoading = false, mappingError = '' } = {}) {
  const calls = []
  const service = Object.fromEntries(['getPipelineState', 'getStatus', 'getFiles', 'getReport'].map((name) => [name, () => {}]))
  const pipeline = { data: { exported }, loading: false, error: '', reload: () => {} }
  const context = vm.createContext({
    engineerService: service,
    useAdminResource: (load, params, enabled) => {
      const name = Object.keys(service).find((key) => service[key] === load)
      calls.push({ name, enabled })
      return name === 'getPipelineState' ? pipeline : { data: null, loading: enabled, error: '', reload: () => {} }
    },
    useAdminMutation: () => ({ busy: false }), useRef: (value) => ({ current: value }), useEffect: () => {},
    useState: (value) => [value, () => {}], engineerStorageKey: (key) => key,
    getProcessingAvailability: () => ({}), readWizardStep: () => null, resolveWizardStep: () => 1,
  })
  vm.runInContext(source, context)
  context.useEngineerJob = () => ({ data: job.data, running: Boolean(job.running), loading: Boolean(job.loading) })
  context.useEngineerMapping = () => ({ resource: { loading: mappingLoading, error: mappingError, data: null }, mutation: {} })
  return { calls, workflow: () => context.useEngineerWizard('batch'), pipeline: () => context.useEngineerPipeline('batch') }
}

test('new batch does not request export-only status or report', () => {
  const state = setup()
  state.pipeline()
  assert.equal(state.calls.find((call) => call.name === 'getStatus').enabled, false)
  assert.equal(state.calls.find((call) => call.name === 'getReport').enabled, false)
  assert.equal(state.calls.find((call) => call.name === 'getFiles').enabled, true)
})

test('completed or restored export loads approval status and processing report', () => {
  for (const options of [{ exported: true }, { job: { data: { operation: 'EXPORT', status: 'COMPLETED' } } }]) {
    const state = setup(options)
    state.pipeline()
    assert.equal(state.calls.find((call) => call.name === 'getStatus').enabled, true)
    assert.equal(state.calls.find((call) => call.name === 'getReport').enabled, true)
  }
})

test('running export waits before loading export-only resources', () => {
  const state = setup({ job: { data: { operation: 'EXPORT', status: 'RUNNING' }, running: true } })
  state.pipeline()
  assert.equal(state.calls.find((call) => call.name === 'getStatus').enabled, false)
})

test('schema loading or failure does not hide the pipeline inside a full-page spinner', () => {
  assert.equal(setup({ mappingLoading: true }).workflow().restoring, false)
  const failed = setup({ mappingError: 'Cannot read schema' }).workflow()
  assert.equal(failed.restoring, false)
  assert.equal(failed.mapping.resource.error, 'Cannot read schema')
})
