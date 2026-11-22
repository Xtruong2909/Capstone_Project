import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import { authStorage } from '../src/services/authStorage.js'
import { getScientistSession, scientistWorkflowKey, readScientistWorkflow, writeScientistWorkflow } from '../src/services/scientistSession.js'

const switchTo = (id) => authStorage.save({ access_token: `fixture-${id}`, user: { id, role_id: 'data_scientist' } }, false)
const flush = () => new Promise((done) => setImmediate(done))
function storage() {
  const data = new Map()
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) }
}
beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: storage(), configurable: true })
  Object.defineProperty(globalThis, 'sessionStorage', { value: storage(), configurable: true })
})

test('switching DS accounts isolates catalogs, previews, sessions, experiments and request caches', () => {
  switchTo('DS-A')
  const first = getScientistSession()
  first.datasets.approvedGroups = [{ group_id: 'A' }]
  for (const map of Object.values(first.datasets).filter((value) => value instanceof Map)) map.set('same-key', 'private-A')
  first.experiments = [{ experiment_id: 'A' }]
  first.experimentDetails.set('A', { private: true })
  first.previewRequests.add('A')
  switchTo('DS-B')
  const second = getScientistSession()
  assert.equal(second.datasets.approvedGroups, null)
  for (const map of Object.values(second.datasets).filter((value) => value instanceof Map)) assert.equal(map.size, 0)
  assert.equal(second.experiments, null)
  assert.equal(second.experimentDetails.size, 0)
  assert.equal(second.previewRequests.size, 0)
  // A late response holds the previous session object and cannot repopulate DS-B.
  first.datasets.approvedGroups = [{ group_id: 'late-A' }]
  assert.equal(getScientistSession().datasets.approvedGroups, null)
})

test('workflow keys contain the account ID and never restore the old global workflow', () => {
  sessionStorage.setItem('science-workflow:shared-batch', JSON.stringify({ split: 'old-account' }))
  switchTo('DS-A')
  const keyA = scientistWorkflowKey('shared-batch')
  assert.deepEqual(readScientistWorkflow(keyA), {})
  writeScientistWorkflow(keyA, { split: 'private-A' })
  switchTo('DS-B')
  const keyB = scientistWorkflowKey('shared-batch')
  assert.notEqual(keyA, keyB)
  assert.deepEqual(readScientistWorkflow(keyB), {})
  writeScientistWorkflow(keyA, { split: 'late-A' })
  assert.deepEqual(readScientistWorkflow(keyB), {})
  authStorage.clear()
  assert.equal(scientistWorkflowKey('shared-batch'), null)
})

function harness(file, hook, services) {
  const slots = [], effects = []
  let cursor = 0
  const context = vm.createContext({ getScientistSession, scientistWorkflowKey, readScientistWorkflow,
    writeScientistWorkflow, extractErrorMessage: (err) => err.message, ...services,
    useCallback: (fn) => fn, useEffect: (fn) => effects.push(fn),
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
      return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }]
    },
    useRef(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = { current: initial }
      return slots[index]
    },
  })
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '')
  vm.runInContext(source, context)
  return { render: (...args) => { cursor = 0; return context[hook](...args) }, effects }
}

test('the actual catalog hook starts empty after switching accounts and loads the new API result', async () => {
  switchTo('DS-A')
  getScientistSession().datasets.approvedGroups = [{ group_id: 'A' }]
  const first = harness('../src/hooks/useScientistData.js', 'useApprovedGroups', {})
  assert.equal(first.render().groups[0].group_id, 'A')
  switchTo('DS-B')
  const second = harness('../src/hooks/useScientistData.js', 'useApprovedGroups', {
    scientistService: { listApprovedGroups: async () => [] },
  })
  assert.equal(second.render().groups.length, 0)
  second.effects[0]()
  await flush()
  assert.equal(second.render().groups.length, 0)
})

test('an unmounted experiment request cannot fill the next DS accounts experiment list', async () => {
  switchTo('DS-A')
  let resolve
  const first = harness('../src/hooks/useScienceWorkflow.js', 'useScienceExperiments', {
    dataScienceService: { listExperiments: () => new Promise((done) => { resolve = done }) },
  })
  first.render()
  const unmount = first.effects[0]()
  unmount()
  switchTo('DS-B')
  const second = harness('../src/hooks/useScienceWorkflow.js', 'useScienceExperiments', {})
  assert.equal(second.render().experiments.length, 0)
  resolve({ data: [{ experiment_id: 'private-A' }], total_pages: 1 })
  await flush()
  assert.equal(second.render().experiments.length, 0)
  assert.equal(getScientistSession().experiments, null)
})

test('failed experiment refresh clears cached private results', async () => {
  switchTo('DS-A')
  getScientistSession().experiments = [{ experiment_id: 'A' }]
  const mounted = harness('../src/hooks/useScienceWorkflow.js', 'useScienceExperiments', {
    dataScienceService: { listExperiments: async () => { throw new Error('Access denied') } },
  })
  assert.equal(mounted.render().experiments.length, 1)
  await mounted.render().reload()
  assert.equal(mounted.render().experiments.length, 0)
  assert.equal(getScientistSession().experiments, null)
})
