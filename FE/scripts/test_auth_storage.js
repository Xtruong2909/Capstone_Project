import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { authStorage } from '../src/services/authStorage.js'

function memoryStorage() {
  const values = new Map()
  return { getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) }
}
const session = { csrf_token: 'csrf-nonce', user: { id: 'user-1', role: 'business_user' } }
beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage(), configurable: true })
  Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage(), configurable: true })
  authStorage.clear()
})

test('session data stay in memory and no credential is persisted for either remember setting', () => {
  for (const remember of [true, false]) {
    authStorage.save({ ...session, access_token: 'must-never-store-this' }, remember)
    assert.equal(authStorage.read().user.id, 'user-1')
    assert.equal(authStorage.read().csrfToken, 'csrf-nonce')
    assert.equal(authStorage.read().token, undefined)
    for (const storage of [localStorage, sessionStorage]) {
      assert.equal(storage.getItem('access_token'), null)
      assert.equal(storage.getItem('user_info'), null)
    }
  }
})

test('startup deletes old JWTs instead of trusting saved identity', () => {
  for (const storage of [localStorage, sessionStorage]) {
    storage.setItem('access_token', 'old-token')
    storage.setItem('user_info', '{broken')
  }
  assert.equal(authStorage.read().user, null)
  for (const storage of [localStorage, sessionStorage]) assert.equal(storage.getItem('access_token'), null)
})

test('logout and renewed sessions notify subscribers and invalidate account cache scope', () => {
  const identities = []
  const unsubscribe = authStorage.subscribe((value) => identities.push(value.user?.id || null))
  authStorage.save(session)
  const oldScope = authStorage.read().sessionScope
  authStorage.replace(session)
  assert.notEqual(authStorage.read().sessionScope, oldScope)
  authStorage.clear()
  unsubscribe()
  assert.deepEqual(identities, ['user-1', 'user-1', null])
})

test('API sends cookies and CSRF only for mutations, never a bearer credential', async () => {
  let requestInterceptor, errorInterceptor, options
  const context = vm.createContext({ authStorage,
    axios: { create: (config) => { options = config; return { interceptors: {
      request: { use: (handler) => { requestInterceptor = handler } },
      response: { use: (_, handler) => { errorInterceptor = handler } },
    } } } },
  })
  const source = readFileSync(new URL('../src/services/apiClient.js', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '')
    .replace('import.meta.env.VITE_API_BASE_URL', 'undefined')
    .replace('export default apiClient', '')
  vm.runInContext(source, context)
  authStorage.save(session)
  assert.equal(options.withCredentials, true)
  const headers = requestInterceptor({ method: 'post', headers: {} }).headers
  assert.equal(headers['X-CSRF-Token'], 'csrf-nonce')
  assert.equal(headers.Authorization, undefined)
  assert.equal(requestInterceptor({ method: 'get', headers: {} }).headers['X-CSRF-Token'], undefined)
  await assert.rejects(errorInterceptor({ response: { status: 401 } }))
  assert.equal(authStorage.read().user, null)
})
