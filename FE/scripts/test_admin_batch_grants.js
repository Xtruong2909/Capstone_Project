import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll('\r\n', '\n')
const stripImports = (source) => source.replace(/^import .*\n/gm, '')

test('batch permissions service uses the grouped read API and existing group revoke route', async () => {
  const requests = []
  const context = vm.createContext({ apiClient: {
    get: async (url, config) => { requests.push({ url, config }); return { data: { items: [], total: 0 } } },
    delete: async (url) => { requests.push({ url }); return { data: {} } },
  } })
  vm.runInContext(stripImports(read('../src/services/adminService.js')).replace('export const adminService =', 'globalThis.adminService ='), context)
  const signal = new AbortController().signal
  const result = await context.adminService.getBatchAccessGrants({ page: 2, page_size: 20 }, signal)
  assert.equal(result.total, 0)
  assert.equal(requests[0].url, '/admin/portal/batch-access-grants')
  assert.equal(requests[0].config.params.page, 2)
  assert.equal(requests[0].config.signal, signal)
  await context.adminService.revokeBatchAccess({ group_id: 'batch-5', user_id: 'scientist' })
  assert.equal(requests[1].url, '/admin/datasets/groups/batch-5/access/scientist')
})

function harness() {
  const slots = []
  const requests = []
  let cursor = 0, changed = 0, reloaded = 0, failed = false
  const context = vm.createContext({
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = initial
      return [slots[index], (value) => { slots[index] = value }]
    },
    useAdminPage: () => ({ items: [], reload: () => { reloaded++ } }),
    useAdminMutation: () => ({ busy: false, async run(action, onSuccess) {
      try { await action(); onSuccess(); return true } catch { return false }
    } }),
    adminService: {
      async revokeBatchAccess(payload) { requests.push({ type: 'batch', ...payload }); if (failed) throw new Error('Failed') },
      async revokeAccess(payload) { requests.push({ type: 'dataset', ...payload }) },
    },
  })
  vm.runInContext(stripImports(read('../src/hooks/useAdminAccessGrants.js')).replace(/^export /gm, ''), context)
  return {
    requests, render() { cursor = 0; return context.useAdminAccessGrants(() => { changed++ }) },
    counts: () => ({ changed, reloaded }), fail: (value) => { failed = value },
  }
}

test('revoke confirms each exact user/batch pair and never revokes another batch', async () => {
  const state = harness()
  const first = { group_id: 'batch-5', user_id: 'scientist' }
  const other = { group_id: 'batch-4', user_id: 'scientist' }
  await state.render().revoke(first)
  assert.equal(state.requests.length, 0)
  await state.render().revoke(other)
  assert.equal(state.requests.length, 0)
  await state.render().revoke(other)
  assert.deepEqual(JSON.parse(JSON.stringify(state.requests)), [{ type: 'batch', group_id: 'batch-4', user_id: 'scientist' }])
  assert.deepEqual(state.counts(), { changed: 1, reloaded: 1 })
  assert.equal(state.render().confirmKey, null)
})

test('ungrouped datasets keep a single dataset revoke and failures retain confirmation for retry', async () => {
  const state = harness()
  const legacy = { group_id: null, dataset_id: 'legacy-dataset', user_id: 'scientist' }
  await state.render().revoke(legacy)
  await state.render().revoke(legacy)
  assert.equal(state.requests[0].type, 'dataset')
  assert.equal(state.requests[0].dataset_id, 'legacy-dataset')
  const batch = { group_id: 'batch-5', user_id: 'scientist' }
  await state.render().revoke(batch)
  state.fail(true)
  await state.render().revoke(batch)
  assert.equal(state.render().confirmKey, 'batch-5:scientist')
  assert.deepEqual(state.counts(), { changed: 1, reloaded: 1 })
  state.fail(false)
  await state.render().revoke(batch)
  assert.deepEqual(state.counts(), { changed: 2, reloaded: 2 })
})
