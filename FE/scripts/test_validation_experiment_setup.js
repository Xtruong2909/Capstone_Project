import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import { experimentConfiguration, resolveExperimentPreset, experimentSource, isTrainTestExperiment } from '../src/features/scientist/utils/experimentPreset.js'

const parameters = { n_estimators: 200, max_depth: 15, min_samples_leaf: 4,
  min_samples_split: 10, max_features: 1, bootstrap: false, random_state: 19 }
const study = { id: 'study', feature_generation_id: 'features', status: 'COMPLETED',
  created_at: '2026-11-28T10:00:00Z', result: { selected_candidate_index: 10, hyperparameters: parameters } }
const split = { split_id: 'split', feature_generation_id: 'features', split_strategy: 'DAY_BASED', train_ratio_requested: 0.75 }

function harness({ list = async () => [study], create = async () => ({ experiment_id: 'created' }) } = {}) {
  const slots = [], effects = [], requests = []
  let cursor = 0, effectCursor = 0
  const context = vm.createContext({
    getScientistSession: () => ({}), scientistWorkflowKey: () => 'workflow',
    readScientistWorkflow: () => ({}), writeScientistWorkflow: () => {},
    extractErrorMessage: error => error.message,
    experimentConfiguration, resolveExperimentPreset,
    validationService: { list },
    dataScienceService: { getSplit: async () => split, createExperiment: async (...args) => {
      requests.push(args); return create(...args)
    } },
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value }] },
    useRef: initial => { const i = cursor++; return slots[i] ??= { current: initial } },
    useEffect: (callback, deps) => { const i = effectCursor++, key = JSON.stringify(deps)
      if (effects[i]?.key === key) return
      effects[i]?.cleanup?.(); effects[i] = { key, cleanup: callback() } },
  })
  const source = fs.readFileSync(new URL('../src/hooks/useScienceWorkflow.js', import.meta.url), 'utf8')
    .split('export function useExperimentSetup')[1].split('export function useAggregationResults')[0]
  vm.runInContext('function useExperimentSetup' + source, context)
  return { requests, render: (incoming = null) => {
    cursor = 0; effectCursor = 0
    return context.useExperimentSetup('split', 'group', incoming)
  } }
}
const flush = () => new Promise(resolve => setImmediate(resolve))

test('opening from history restores the persisted Validation winner and sends its exact parameters', async () => {
  const h = harness()
  h.render(); await flush()
  const form = h.render()
  assert.equal(form.validationPreset.studyId, 'study')
  assert.equal(form.configuration.min_samples_leaf, '4')
  assert.equal(form.configuration.max_features, '1', 'integer feature count must not become all features')
  await form.createExperiment()
  assert.deepEqual(JSON.parse(JSON.stringify(h.requests[0])), ['split', parameters])
})

test('a double submit while training is pending sends exactly one request', async () => {
  let finish
  const h = harness({ create: () => new Promise(resolve => { finish = resolve }) })
  h.render(); await flush()
  const form = h.render()
  const first = form.createExperiment()
  assert.equal(await form.createExperiment(), null)
  assert.equal(h.requests.length, 1)
  finish({ experiment_id: 'created' }); await first
  assert.equal(h.render().busy, false)
})

test('failure to retrieve the winner blocks training instead of silently running defaults', async () => {
  const h = harness({ list: async () => { throw new Error('Cannot load Validation') } })
  h.render(); await flush()
  const form = h.render()
  assert.equal(form.error, 'Cannot load Validation')
  assert.equal(await form.createExperiment(), null)
  assert.equal(h.requests.length, 0)
})

test('explicit saved selection wins; another generation and unfinished studies cannot replace it', () => {
  const incoming = { featureGenerationId: 'features', hyperparameters: { ...parameters, n_estimators: 500 } }
  assert.equal(resolveExperimentPreset([study], incoming, 'features'), incoming)
  assert.equal(resolveExperimentPreset([study], incoming, 'other'), null)
  assert.equal(resolveExperimentPreset([{ ...study, status: 'VALIDATED' }], null, 'features'), null)
})

test('history identifies final Validation tests separately from manual Train/Test runs', () => {
  assert.equal(experimentSource({ evaluation_policy: 'frozen validation selection; refit Train + Validation; final Test evaluation' }), 'Test cuối từ Validation')
  assert.equal(experimentSource({ evaluation_policy: 'persisted-lag-feature-split; test set is evaluation-only' }), 'Train/Test thủ công')
})

test('Train/Test history excludes Validation candidates and final tests but retains manual runs', () => {
  const runs = [
    { id: 'candidate', evaluation_subset: 'VALIDATION' },
    { id: 'final', evaluation_subset: 'TEST', evaluation_policy: 'frozen validation selection; refit Train + Validation; final Test evaluation' },
    { id: 'manual', evaluation_subset: 'TEST', evaluation_policy: 'persisted-lag-feature-split; test set is evaluation-only' },
  ]
  assert.deepEqual(runs.filter(isTrainTestExperiment).map(item => item.id), ['manual'])
  assert.equal(runs.length, 3, 'filtering history must not delete saved results')
})

test('restoring a legacy 70/30 workflow replaces the split with the current 75/25 partition', async () => {
  let stored = {}, created = 0
  const context = vm.createContext({
    scientistWorkflowKey: () => 'workflow', readScientistWorkflow: () => ({}),
    writeScientistWorkflow: (_key, value) => { stored = value },
    extractErrorMessage: error => error.message,
    dataScienceService: {
      getLatestAggregation: async () => ({ aggregation_id: 'aggregation', status: 'COMPLETED' }),
      getLatestFeatures: async () => ({ feature_generation_id: 'features', status: 'COMPLETED' }),
      getLatestSplit: async () => ({ ...split, split_id: 'old', train_ratio_requested: 0.7 }),
      createSplit: async generation => { assert.equal(generation, 'features'); created++; return split },
    },
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
    useRef: initial => ({ current: initial }), useCallback: callback => callback,
    useEffect: callback => { callback() },
  })
  const source = fs.readFileSync(new URL('../src/hooks/useScienceWorkflow.js', import.meta.url), 'utf8')
    .split('export function useScienceTraining')[1].split('export function useExperimentSetup')[0]
  vm.runInContext('function useScienceTraining' + source, context)
  context.useScienceTraining('group')
  await flush()
  assert.equal(created, 1)
  assert.equal(stored.split.train_ratio_requested, 0.75)
  assert.equal(stored.split.split_id, 'split')
  assert.equal(stored.experiment, null)
})
