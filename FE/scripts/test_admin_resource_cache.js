import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import * as cache from '../src/services/adminResourceCache.js'

beforeEach(() => cache.invalidateAdminResourceCache())
const paramsKey = JSON.stringify({ page: 1 })
const load = (scope, identity, loader, force = false) => cache.loadAdminResource(scope, identity, paramsKey, loader, force)

test('navigation reuses fresh data and shares an unfinished request', async () => {
  const identity = () => {}
  let requests = 0
  const loader = async () => { requests++; return { items: ['Batch 3'], total: 1 } }
  const [first, duplicate] = await Promise.all([load('admin-a', identity, loader), load('admin-a', identity, loader)])
  assert.equal(first, duplicate)
  assert.equal(await load('admin-a', identity, loader), first)
  assert.equal(requests, 1)
  assert.equal(cache.peekAdminResource('admin-a', identity, paramsKey).data, first)
  await load('admin-a', identity, loader, true)
  assert.equal(requests, 2)
})

test('expired data stays visible while a background request refreshes it', async () => {
  const identity = () => {}
  const oldData = await load('admin-a', identity, async () => ({ count: 1 }))
  const originalNow = Date.now
  const later = Date.now() + 31000
  Date.now = () => later
  try {
    const stale = cache.peekAdminResource('admin-a', identity, paramsKey)
    assert.equal(stale.fresh, false)
    assert.equal(stale.data, oldData)
    let finish
    const refresh = load('admin-a', identity, () => new Promise((resolve) => { finish = resolve }))
    await Promise.resolve()
    assert.equal(cache.peekAdminResource('admin-a', identity, paramsKey).data, oldData)
    finish({ count: 2 })
    await refresh
    assert.equal(cache.peekAdminResource('admin-a', identity, paramsKey).data.count, 2)
  } finally { Date.now = originalNow }
})

test('a successful mutation invalidates data and an older response cannot restore it', async () => {
  const identity = () => {}
  let finish
  let requestSignal
  const oldRequest = load('admin-a', identity, (signal) => {
    requestSignal = signal
    return new Promise((resolve) => { finish = resolve })
  })
  await Promise.resolve()
  const dataset_file = cache.adminCacheFile()
  cache.invalidateAdminResourceCache()
  assert.equal(cache.adminCacheFile(), dataset_file + 1)
  assert.equal(requestSignal.aborted, true)
  await load('admin-a', identity, async () => ({ count: 2 }))
  finish({ count: 1 })
  await oldRequest
  assert.equal(cache.peekAdminResource('admin-a', identity, paramsKey).data.count, 2)
})

test('account changes cannot reuse another user data', async () => {
  const identity = () => {}
  await load('admin-a', identity, async () => ({ email: 'a@example.com' }))
  assert.equal(cache.peekAdminResource('admin-b', identity, paramsKey), null)
  const second = await load('admin-b', identity, async () => ({ email: 'b@example.com' }))
  assert.equal(second.email, 'b@example.com')
  cache.invalidateAdminResourceCache()
  assert.equal(cache.peekAdminResource('admin-b', identity, paramsKey), null)
})

test('request failures can be retried and forbidden data is removed', async () => {
  const identity = () => {}
  await assert.rejects(load('admin-a', identity, async () => { throw new Error('Offline') }))
  await load('admin-a', identity, async () => ({ count: 1 }))
  await assert.rejects(load('admin-a', identity, async () => { throw { response: { status: 403 } } }, true))
  assert.equal(cache.peekAdminResource('admin-a', identity, paramsKey), null)
})

test('the API interceptor invalidates after an Admin write but not a read', async () => {
  let onResponse
  const scope = vm.createContext({
    invalidateAdminResourceCache: cache.invalidateAdminResourceCache,
    authStorage: { read: () => ({ token: 'admin-a' }), clear() {} },
    axios: { create: () => ({ interceptors: {
      request: { use() {} }, response: { use: (handler) => { onResponse = handler } },
    } }) },
  })
  const source = fs.readFileSync(new URL('../src/services/apiClient.js', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '').replace('import.meta.env.VITE_API_BASE_URL', 'undefined')
    .replace('export default apiClient', '')
  vm.runInContext(source, scope)
  const identity = () => {}
  await load('admin-a', identity, async () => ({ count: 1 }))
  onResponse({ config: { method: 'get', url: '/admin/users' } })
  assert.ok(cache.peekAdminResource('admin-a', identity, paramsKey))
  onResponse({ config: { method: 'patch', url: '/admin/users/user-1/status' } })
  assert.equal(cache.peekAdminResource('admin-a', identity, paramsKey), null)
})

test('the actual resource and pagination hooks show cached data on their first render', async () => {
  const identity = () => {}
  const params = { approval_status: 'APPROVED', page: 1, page_size: 20 }
  const key = JSON.stringify(params)
  const data = { items: [{ group_name: 'Batch 3' }], total: 1, page: 1 }
  await cache.loadAdminResource('admin-a', identity, key, async () => data)
  const scope = vm.createContext({
    ...cache,
    authStorage: { read: () => ({ token: 'admin-a', user: { role: 'admin' } }) },
    useMemo: (factory) => factory(), useEffect: () => {},
    useState: (initial) => [initial, () => {}],
    useSyncExternalStore: (_, getSnapshot) => getSnapshot(),
  })
  const source = fs.readFileSync(new URL('../src/hooks/useAdminData.js', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '').replace(/^export /gm, '')
  vm.runInContext(source, scope)
  const resource = scope.useAdminResource(identity, params)
  assert.equal(resource.loading, false)
  assert.equal(resource.data, data)
  const pagination = scope.useAdminPage(identity, { approval_status: 'APPROVED' })
  assert.equal(pagination.loading, false)
  assert.equal(pagination.items, data.items)
  assert.equal(pagination.total, 1)
  assert.equal(scope.useAdminResource(identity, { ...params, page: 2 }).data, null)
})
