import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getProcessingAvailability, readWizardStep, resolveWizardStep, saveWizardStep } from '../src/services/engineerWorkflowState.js'

const pipeline = { source_key: 'current', step: 3 }
const available = [true, true, true, false]

test('normalization and export are locked once completed, including restored state', () => {
  const state = { busy: false, schemaReady: true, normalized: false, exported: false }
  assert.deepEqual(getProcessingAvailability(state), { canNormalize: true, canExport: false })
  assert.deepEqual(getProcessingAvailability({ ...state, normalized: true }), { canNormalize: false, canExport: true })
  assert.deepEqual(getProcessingAvailability({ ...state, normalized: true, exported: true }), { canNormalize: false, canExport: false })
  assert.deepEqual(getProcessingAvailability({ ...state, exported: true }), { canNormalize: false, canExport: false })
})

test('busy and changed unsaved mapping cannot start processing; a new current source can', () => {
  assert.deepEqual(getProcessingAvailability({ busy: true, schemaReady: true, normalized: false, exported: false }),
    { canNormalize: false, canExport: false })
  assert.deepEqual(getProcessingAvailability({ busy: false, schemaReady: false, normalized: false, exported: false }),
    { canNormalize: false, canExport: false })
  assert.equal(getProcessingAvailability({ busy: false, schemaReady: true, normalized: false, exported: false }).canNormalize, true)
})

test('normalizing and exporting jobs override saved steps when returning to the batch', () => {
  const saved = { sourceKey: 'current', step: 1 }
  assert.equal(resolveWizardStep(pipeline, saved, available, { operation: 'NORMALIZE', status: 'RUNNING' }), 2)
  assert.equal(resolveWizardStep(pipeline, saved, available, { operation: 'EXPORT', status: 'PENDING' }), 3)
})

test('returning after completion preserves the selected valid step for the same source', () => {
  assert.equal(resolveWizardStep(pipeline, { sourceKey: 'current', step: 2 }, available), 2)
  assert.equal(resolveWizardStep(pipeline, { sourceKey: 'current', step: 3 }, available), 3)
  assert.equal(resolveWizardStep({ ...pipeline, step: 4 }, null, [true, true, true, true]), 4)
})

test('new uploads and unavailable steps use the authoritative API stage', () => {
  assert.equal(resolveWizardStep(pipeline, { sourceKey: 'older-upload', step: 1 }, available), 3)
  assert.equal(resolveWizardStep(pipeline, { sourceKey: 'current', step: 4 }, available), 3)
})

test('saved steps persist across remounts and remain isolated per account and batch', () => {
  const values = new Map()
  globalThis.localStorage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) }
  saveWizardStep('de-wizard:batch-1:user-A', { sourceKey: 'current', step: 3 })
  assert.equal(readWizardStep('de-wizard:batch-1:user-A').step, 3)
  assert.equal(readWizardStep('de-wizard:batch-1:user-B'), null)
  assert.equal(readWizardStep('de-wizard:batch-2:user-A'), null)
  values.set('broken', '{')
  assert.equal(readWizardStep('broken'), null)
})
