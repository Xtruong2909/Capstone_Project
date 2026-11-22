import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'

const read = (path) => fs.readFileSync(new URL('../src/' + path, import.meta.url), 'utf8')
const prepare = (source) => source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '')
const params = { group_id: 'batch', dataset_id: 'data', session_id: 'session', representation: 'normalized', page_size: 20, column_offset: 0, page: 1 }
const page = (number, more = true) => ({ rows: [{ value: number }], columns: [{ name: 'value' }],
  pagination: { page: number, page_size: 20, has_more: more, returned_rows: 1 } })
const tick = () => new Promise((resolve) => setImmediate(resolve))

function cacheModule(load) {
  let session = { user: { id: 'owner-A' }, token: 'fixture-A' }
  const context = vm.createContext({ Map, Date, Promise, DOMException, AbortController,
    authStorage: { read: () => session }, engineerService: { previewSession: load } })
  vm.runInContext(prepare(read('services/engineerPreviewCache.js')), context)
  return { context, switchAccount: (value) => { session = value } }
}

test('in-flight prefetch is reused and visited pages do not refetch', async () => {
  let resolve
  let calls = 0
  const { context } = cacheModule(() => { calls++; return new Promise((done) => { resolve = done }) })
  const cache = context.getEngineerPreviewCache()
  const first = cache.request(params)
  const second = cache.request(params)
  assert.equal(first, second)
  resolve(page(1))
  await first
  assert.equal((await cache.request(params)).pagination.page, 1)
  assert.equal(calls, 1)
})

test('refresh clears the session cache and ignores a late prefetched response', async () => {
  const pending = []
  const { context } = cacheModule((request, signal) => new Promise((resolve) => pending.push({ request, signal, resolve })))
  const cache = context.getEngineerPreviewCache()
  const old = cache.request({ ...params, page: 2 })
  const rejected = assert.rejects(old, { name: 'AbortError' })
  cache.clearSession(params)
  const fresh = cache.request({ ...params, page: 2 })
  assert.equal(pending[0].signal.aborted, true)
  pending[0].resolve(page(2))
  await rejected
  assert.equal(cache.peek({ ...params, page: 2 }), null)
  pending[1].resolve(page(2, false))
  await fresh
  assert.equal(cache.peek({ ...params, page: 2 }).pagination.has_more, false)
})

test('cache expires, is bounded, and keeps sessions and page sizes separate', async () => {
  let clock = 0
  const { context } = cacheModule()
  const cache = context.createEngineerPreviewCache(async (request) => page(request.page), () => clock)
  await cache.request(params)
  assert.equal(cache.peek({ ...params, session_id: 'other' }), null)
  assert.equal(cache.peek({ ...params, page_size: 50 }), null)
  clock = 60001
  assert.equal(cache.peek(params), null)
  for (let number = 1; number <= 17; number++) await cache.request({ ...params, page: number })
  assert.equal(cache.peek(params), null)
  assert.ok(cache.peek({ ...params, page: 17 }))
})

test('switching account or token discards cached data and aborts previous requests', async () => {
  const pending = []
  const module = cacheModule((_, signal) => new Promise((resolve) => pending.push({ resolve, signal })))
  const oldCache = module.context.getEngineerPreviewCache()
  const request = oldCache.request(params)
  const rejected = assert.rejects(request, { name: 'AbortError' })
  module.switchAccount({ user: { id: 'owner-B' }, token: 'fixture-B' })
  const otherCache = module.context.getEngineerPreviewCache()
  assert.notEqual(otherCache, oldCache)
  assert.equal(otherCache.peek(params), null)
  assert.equal(pending[0].signal.aborted, true)
  pending[0].resolve(page(1))
  await rejected
  module.switchAccount({ user: { id: 'owner-B' }, token: 'fixture-renewed' })
  assert.notEqual(module.context.getEngineerPreviewCache(), otherCache)
})

test('API denial clears previously cached rows of that session', async () => {
  const { context } = cacheModule(async (request) => {
    if (request.page === 2) throw { response: { status: 403 } }
    return page(1)
  })
  const cache = context.getEngineerPreviewCache()
  await cache.request(params)
  await assert.rejects(cache.request({ ...params, page: 2 }))
  assert.equal(cache.peek(params), null)
})

function previewHook(load) {
  const { context } = cacheModule(load)
  const values = []
  const effects = []
  let stateIndex = 0
  let effectIndex = 0
  let queue = []
  Object.assign(context, {
    useAuth: () => ({ user: { id: 'owner-A' } }), adminError: () => 'API error',
    useState: (initial) => {
      const index = stateIndex++
      if (!(index in values)) values[index] = initial
      return [values[index], (value) => { values[index] = typeof value === 'function' ? value(values[index]) : value }]
    },
    useEffect: (callback, deps) => {
      const index = effectIndex++
      const previous = effects[index]
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) queue.push({ index, callback, deps })
    },
  })
  vm.runInContext(prepare(read('hooks/useEngineerPreview.js')), context)
  return {
    render() {
      stateIndex = 0; effectIndex = 0
      return context.useEngineerPreview({ groupId: 'batch', datasetId: 'data', sessionId: 'session' })
    },
    commit() {
      for (const item of queue) effects[item.index]?.cleanup?.()
      for (const item of queue) effects[item.index] = { deps: item.deps, cleanup: item.callback() }
      queue = []
    },
    unmount() { for (const effect of effects) effect.cleanup?.() },
  }
}

test('preview hook preloads the next page and changes to it immediately from cache', async () => {
  const calls = []
  const hook = previewHook(async (request) => { calls.push(request.page); return page(request.page, request.page < 3) })
  assert.equal(hook.render().isPreviewLoading, true)
  hook.commit()
  await tick()
  let result = hook.render()
  assert.deepEqual(calls, [1, 2])
  result.setPreviewPage(2)
  result = hook.render()
  assert.equal(result.previewData.pagination.page, 2)
  assert.equal(result.isPreviewLoading, false)
  hook.commit()
  await tick()
  result = hook.render()
  assert.deepEqual(calls, [1, 2, 3])
  result.setPreviewPage(1)
  assert.equal(hook.render().previewData.pagination.page, 1)
  hook.commit()
  await tick()
  assert.deepEqual(calls, [1, 2, 3])
  hook.unmount()
})

test('cold page navigation keeps the current table while loading instead of returning a skeleton', async () => {
  const hook = previewHook((request) => request.page === 1 ? Promise.resolve(page(1, false)) : new Promise(() => {}))
  hook.render(); hook.commit(); await tick()
  let result = hook.render()
  result.setPreviewPage(5)
  result = hook.render()
  assert.equal(result.previewData.pagination.page, 1)
  assert.equal(result.isPreviewLoading, false)
  assert.equal(result.isPreviewRefreshing, true)
  hook.commit()
  hook.unmount()
})
