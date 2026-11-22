import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transformWithOxc } from 'vite'

const read = (path) => fs.readFileSync(new URL('../src/' + path, import.meta.url), 'utf8')
  .replace(/^import .*\r?\n/gm, '').replace(/^export default /gm, '').replace(/^export /gm, '')
function serviceHarness(get, post = async () => ({ data: {} })) {
  const context = vm.createContext({ apiClient: { get, post } })
  vm.runInContext(read('services/adminService.js') + '\nglobalThis.service = adminService', context)
  return context.service
}

test('review queue loads all pages from the existing group API without browser review cache', async () => {
  const requests = []
  const controller = new AbortController()
  const service = serviceHarness(async (url, options) => {
    requests.push(options.params.skip)
    assert.equal(url, '/admin/datasets/groups')
    assert.equal(options.signal, controller.signal)
    assert.equal(options.params.limit, 100)
    const offset = options.params.skip
    return { data: Array.from({ length: offset === 0 ? 100 : 2 }, (_, index) => ({
      group_id: `batch-${offset + index}`, submitted_datasets: 1,
    })) }
  })
  assert.equal((await service.getReviewGroups({}, controller.signal)).length, 102)
  assert.deepEqual(requests, [0, 100])
})

test('dataset, session, preview and review requests follow the official batch hierarchy and parameter names', async () => {
  const requests = []
  const controller = new AbortController()
  const service = serviceHarness(async (url, options) => {
    requests.push({ url, options }); return { data: {} }
  }, async (url, body) => { requests.push({ url, body }); return { data: { reviewed_files: 2 } } })
  await service.getReviewDatasets({ group_id: 'batch' }, controller.signal)
  await service.getReviewSessions({ group_id: 'batch', dataset_id: 'dataset', page: 2 }, controller.signal)
  await service.getReviewSessionPreview({ group_id: 'batch', dataset_id: 'dataset', session_id: 'session',
    page: 3, column_offset: 10 }, controller.signal)
  await service.reviewBatch('batch', { status: 'APPROVED', note: null })
  assert.equal(requests[0].url, '/admin/datasets/groups/batch/datasets')
  assert.equal(requests[1].url, '/admin/datasets/groups/batch/datasets/dataset/sessions')
  assert.equal(requests[1].options.params.page_size, 20)
  assert.equal(requests[2].url, '/admin/datasets/groups/batch/datasets/dataset/sessions/session/preview')
  assert.deepEqual(JSON.parse(JSON.stringify(requests[2].options.params)), {
    page: 3, limit: 20, column_offset: 10, representation: 'normalized',
  })
  assert.ok(requests.slice(0, 3).every((request) => request.options.signal === controller.signal))
  assert.equal(requests[3].url, '/admin/datasets/groups/batch/review')
  assert.equal(requests[3].body.status, 'APPROVED')
  assert.ok(requests.every((request) => !request.url.includes('/files/')))
})

test('preview hook selects the actual session and resets row and column pagination on session change', () => {
  let cursor = 0
  const values = [], calls = []
  const service = { getReviewSessions() {}, getReviewSessionPreview() {} }
  const context = vm.createContext({ adminService: service,
    useState: (initial) => {
      const key = cursor++
      if (!(key in values)) values[key] = initial
      return [values[key], (value) => { values[key] = typeof value === 'function' ? value(values[key]) : value }]
    },
    useAdminResource: (load, params, enabled = true) => {
      if (load === service.getReviewSessions) return { data: { sessions: [
        { session_id: 'session-1', original_filename: 'actual.csv' }, { session_id: 'session-2' },
      ], total: 2 } }
      if (enabled) calls.push(params)
      return { data: { columns: [{ name: 'actual_field' }], has_more_columns: true } }
    },
  })
  vm.runInContext(read('hooks/useAdminDatasetReview.js'), context)
  const render = () => { cursor = 0; return context.useAdminReviewPreview({ group_id: 'batch', dataset_id: 'dataset' }) }
  render().setPage(4)
  render().nextColumns()
  assert.equal(render().columnOffset, 1)
  render().setSession('session-2')
  const hook = render()
  assert.equal(hook.page, 1)
  assert.equal(hook.columnOffset, 0)
  assert.equal(calls.at(-1).session_id, 'session-2')
  assert.equal(calls.at(-1).group_id, 'batch')
  assert.equal(calls.at(-1).representation, 'normalized')
  assert.equal(calls.at(-1).limit, 20)
})

test('preview renders one API table with exact session headers and nested pagination.has_more', async () => {
  const { code } = await transformWithOxc(read('features/admin/components/AdminReviewPreview.jsx'), 'AdminReviewPreview.jsx', { jsx: { runtime: 'classic' } })
  const session = { session_id: 'session', original_filename: 'actual-recording.csv' }
  const context = vm.createContext({ React,
    useAdminReviewPreview: () => ({ sessions: { data: { sessions: [session], total: 1 } }, session,
      preview: { data: {
        original_filename: session.original_filename, representation: 'normalized',
        columns: [{ name: 'custom_vehicle_id', type: 'integer' }], rows: [{ custom_vehicle_id: 42 }],
        pagination: { page: 1, page_size: 20, returned_rows: 1, total_rows: 2, has_more: true },
      } }, page: 1, columnOffset: 0 }),
    AdminModal: ({ children }) => React.createElement('section', null, children),
    AdminState: ({ children }) => children, AdminBadge: () => null,
  })
  vm.runInContext(code, context)
  const html = renderToStaticMarkup(React.createElement(context.AdminReviewPreview, {
    item: { name: 'Dataset', group_name: 'Batch', total_sessions: 1, approval_status: 'SUBMITTED' },
  }))
  assert.equal((html.match(/<table/g) || []).length, 1)
  assert.ok(html.includes('custom_vehicle_id') && html.includes('42') && html.includes('Số nguyên'))
  assert.ok(html.includes('actual-recording.csv') && html.includes('Dữ liệu đã chuẩn hóa'))
  assert.ok(!html.includes('Preview Unavailable'))
  assert.match(html, /<button type="button" class="btn-secondary">Tiếp<\/button>/)
})

function queueHarness(action) {
  let cursor = 0, mounted = false, params = new URLSearchParams('groupId=batch')
  const values = [], requests = []
  let reloads = 0, invalidations = 0
  const item = { group_id: 'batch', group_name: 'Actual batch', submitted_datasets: 2, total_datasets: 3 }
  const resource = { data: [item], reload: () => reloads++ }
  const mutation = { clear() {}, error: '', run: async (request, success) => {
    try { await request(); success(); return true }
    catch { mutation.error = 'API rejected the review'; return false }
  } }
  const state = (initial, ref = false) => {
    const key = cursor++
    if (!(key in values)) values[key] = ref ? { current: initial } : initial
    return ref ? values[key] : [values[key], (next) => { values[key] = typeof next === 'function' ? next(values[key]) : next }]
  }
  const service = { getReviewGroups() {}, getReviewDatasets() {},
    reviewBatch: (...args) => { requests.push(args); return action() } }
  const context = vm.createContext({ URLSearchParams, adminService: service,
    invalidateAdminResourceCache: () => invalidations++,
    useState: (initial) => state(initial), useRef: (initial) => state(initial, true),
    useEffect: (callback) => { if (!mounted) { callback(); mounted = true } },
    useAdminResource: (load) => load === service.getReviewGroups ? resource : { data: { datasets: [] }, reload() {} },
    useAdminMutation: () => mutation,
    useSearchParams: () => [params, (next) => { params = next }],
  })
  vm.runInContext(read('hooks/useAdminDatasetReview.js'), context)
  return { render: () => { cursor = 0; return context.useAdminDatasetReview() }, requests, item, resource, mutation,
    reloads: () => reloads, invalidations: () => invalidations, params: () => params }
}

test('batch deep link; confirmed review calls the API once, clears selection and invalidates admin caches', async () => {
  let resolve
  const hook = queueHarness(() => new Promise((done) => { resolve = done }))
  assert.equal(hook.render().group.group_id, 'batch')
  hook.render().openReview(hook.item, 'APPROVED')
  hook.render().setNote('  Actual note  ')
  const pending = hook.render().confirmReview({ preventDefault() {} })
  await hook.render().confirmReview({ preventDefault() {} })
  assert.equal(hook.requests.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(hook.requests[0])), ['batch', { status: 'APPROVED', note: 'Actual note' }])
  assert.equal(hook.render().groups.length, 1)
  resolve({ status: 'MIXED', reviewed_files: 2 })
  await pending
  assert.equal(hook.render().groups.length, 0)
  assert.equal(hook.render().review, null)
  assert.equal(hook.reloads(), 1)
  assert.equal(hook.invalidations(), 1)
  assert.equal(hook.params().has('groupId'), false)
  hook.resource.data = [{ ...hook.item }]
  assert.equal(hook.render().groups.length, 1, 'A later API submission must not remain hidden')
})

test('API rejection keeps the batch and review form available without recording a false decision', async () => {
  const hook = queueHarness(async () => { throw new Error('Review failed') })
  hook.render().openReview(hook.item, 'REJECTED')
  await hook.render().confirmReview({ preventDefault() {} })
  assert.equal(hook.render().groups.length, 1)
  assert.equal(hook.render().review.status, 'REJECTED')
  assert.equal(hook.reloads(), 0)
  assert.equal(hook.invalidations(), 0)
  assert.ok(hook.mutation.error)
})

test('overview preserves a real group-list error rather than claiming the review queue is empty', async () => {
  const service = serviceHarness(async (url) => {
    if (url === '/admin/datasets/groups') throw new Error('Group list failed')
    if (url === '/admin/datasets') return { data: [] }
    return { data: {} }
  })
  // Health failure is independent of the review queue and is permitted here.
  const overview = await service.getOverviewData({})
  assert.equal(overview.reviewGroupsError, true)
  assert.ok(overview.partialWarning)
})
