import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import { authStorage } from '../src/services/authStorage.js'
import { engineerStorageKey, readEngineerStorage, writeEngineerStorage } from '../src/services/engineerStorage.js'

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const stripImports = (source) => source.replace(/^import .*\r?\n/gm, '')
const switchTo = (id) => authStorage.save({ access_token: 'fixture', user: { id, role_id: 'data_engineer' } }, false)
const key = 'pneuma_de_dataset_meta_v1'
function storage() {
  const data = new Map()
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) }
}
beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: storage(), configurable: true })
  Object.defineProperty(globalThis, 'sessionStorage', { value: storage(), configurable: true })
})

test('metadata, lineage and counts are scoped by account; legacy global caches are ignored', () => {
  for (const cache of [key, 'pneuma_de_lineage_v1', 'pneuma_de_records_v1']) {
    localStorage.setItem(cache, JSON.stringify({ foreign: true }))
    switchTo('engineer-A')
    assert.deepEqual(readEngineerStorage(cache), {})
    writeEngineerStorage(cache, { own: 'A' })
    switchTo('engineer-B')
    assert.deepEqual(readEngineerStorage(cache), {})
    writeEngineerStorage(cache, { own: 'B' })
    switchTo('engineer-A')
    assert.deepEqual(readEngineerStorage(cache), { own: 'A' })
  }
  authStorage.clear()
  writeEngineerStorage(key, { unauthenticated: true })
  assert.equal(engineerStorageKey(key), null)
  assert.deepEqual(readEngineerStorage(key), {})
})

function datasetApi(get) {
  const context = vm.createContext({ apiClient: { get }, engineerStorageKey, readEngineerStorage, writeEngineerStorage })
  vm.runInContext(stripImports(read('../src/services/datasetService.js')).replace('export const datasetService =', 'globalThis.datasetService ='), context)
  return context.datasetService
}

test('the catalog uses API metadata for the selected dataset_file despite stale browser values', async () => {
  switchTo('engineer-A')
  writeEngineerStorage(key, { data: { name: 'stale label', original_filename: 'stale.csv', source: 'stale source', file_size_bytes: 999 } })
  const api = datasetApi(async () => ({ data: [{
    dataset_id: 'data', dataset_name: '20181024-d1', total_records: 123,
    filename: 'export.parquet', original_filename: null, source: 'Actual source',
    file_format: 'PARQUET', file_size_bytes: 100, approval_note: null,
  }] }))
  const [row] = await api.listDatasets()
  assert.equal(row.name, '20181024-d1')
  assert.equal(row.total_records, 123)
  assert.equal(row.filename, 'export.parquet')
  assert.equal(row.original_filename, null)
  assert.equal(row.source, 'Actual source')
  assert.equal(row.file_size_bytes, 100)
  assert.equal(row.file_format, 'PARQUET')
  assert.equal(row.approval_note, null)
  assert.equal(row.code, undefined)
  assert.equal(row.location_name, undefined)
})

test('a denied request never falls back to another catalog endpoint', async () => {
  let requests = 0
  const error = { response: { status: 403 } }
  const api = datasetApi(async () => { requests++; throw error })
  await assert.rejects(api.listDatasets(), (caught) => caught === error)
  assert.equal(requests, 1)
})

test('a preview completing after an account switch cannot write into the new accounts cache', async () => {
  switchTo('engineer-A')
  let resolve
  const api = datasetApi(() => new Promise((done) => { resolve = done }))
  const pending = api.previewDataset('dataset-A')
  switchTo('engineer-B')
  resolve({ data: { original_filename: 'private-A.csv', file_size: 10 } })
  await pending
  assert.deepEqual(readEngineerStorage(key), {})
})

function catalogHarness(load) {
  const slots = [], effects = []
  let cursor = 0
  const context = vm.createContext({ AbortController, datasetService: { listDatasets: load },
    engineerService: { getHealth: async () => ({ status: 'connected' }) },
    useCallback: (fn) => fn, useEffect: (fn) => { effects.push(fn) },
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
  })
  vm.runInContext(stripImports(read('../src/hooks/useEngineerCatalog.js')).replace(/^export /gm, ''), context)
  return { render: () => { cursor = 0; return context.useEngineerCatalog() }, effects }
}

test('unmount aborts a prior accounts catalog request and ignores its late response', async () => {
  let resolve, signal
  const harness = catalogHarness((_, receivedSignal) => {
    signal = receivedSignal
    return new Promise((done) => { resolve = done })
  })
  harness.render()
  const unmount = harness.effects[0]()
  unmount()
  assert.equal(signal.aborted, true)
  resolve([{ dataset_id: 'previous-account' }])
  await new Promise((done) => setImmediate(done))
  assert.equal(harness.render().datasets.length, 0)
})

test('an API failure clears a previously displayed catalog', async () => {
  let fail = false
  const harness = catalogHarness(async () => {
    if (fail) throw { response: { status: 403, data: { detail: 'Denied' } } }
    return [{ dataset_id: 'owned' }]
  })
  await harness.render().fetchCatalogAndHealth()
  assert.equal(harness.render().datasets.length, 1)
  fail = true
  await harness.render().fetchCatalogAndHealth()
  assert.equal(harness.render().datasets.length, 0)
  assert.equal(harness.render().catalogError, 'Denied')
})
