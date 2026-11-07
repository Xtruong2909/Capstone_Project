import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { authStorage } from '../src/services/authStorage.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }
}

const session = { access_token: 'test-token', user: { id: 'user-1', role: 'business_user' } }
beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage(), configurable: true })
  Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage(), configurable: true })
})

test('remembered login survives a fresh browser session', () => {
  authStorage.save(session, true)
  assert.equal(localStorage.getItem('access_token'), session.access_token)
  assert.equal(sessionStorage.getItem('access_token'), null)
  Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage(), configurable: true })
  assert.deepEqual(authStorage.read(), { token: session.access_token, user: session.user })
})

test('unchecked login survives reload but is absent in a fresh session', () => {
  authStorage.save(session, false)
  assert.equal(localStorage.getItem('access_token'), null)
  assert.equal(authStorage.read().token, session.access_token)
  Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage(), configurable: true })
  assert.equal(authStorage.read().token, null)
})

test('changing remember preference removes the previous saved session', () => {
  authStorage.save(session, true)
  authStorage.save({ ...session, access_token: 'temporary-token' }, false)
  assert.equal(localStorage.getItem('access_token'), null)
  assert.equal(localStorage.getItem('user_info'), null)
  assert.equal(authStorage.read().token, 'temporary-token')
  authStorage.save(session, true)
  assert.equal(sessionStorage.getItem('access_token'), null)
  assert.equal(sessionStorage.getItem('user_info'), null)
})

test('logout clears both storage locations', () => {
  for (const storage of [sessionStorage, localStorage]) {
    storage.setItem('access_token', 'old-token')
    storage.setItem('user_info', JSON.stringify(session.user))
  }
  authStorage.clear()
  for (const storage of [sessionStorage, localStorage]) {
    assert.equal(storage.getItem('access_token'), null)
    assert.equal(storage.getItem('user_info'), null)
  }
})

test('malformed saved user does not crash startup', () => {
  localStorage.setItem('access_token', 'old-token')
  localStorage.setItem('user_info', '{broken')
  assert.deepEqual(authStorage.read(), { token: null, user: null })
})

test('API requests use session tokens and 401 clears authentication', async () => {
  let requestInterceptor
  let errorInterceptor
  const context = vm.createContext({
    authStorage,
    axios: { create: () => ({ interceptors: {
      request: { use: (handler) => { requestInterceptor = handler } },
      response: { use: (_, handler) => { errorInterceptor = handler } },
    } }) },
  })
  const source = readFileSync(new URL('../src/services/apiClient.js', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '')
    .replace('import.meta.env.VITE_API_BASE_URL', 'undefined')
    .replace('export default apiClient', '')
  vm.runInContext(source, context)
  authStorage.save(session, false)
  assert.equal(requestInterceptor({ headers: {} }).headers.Authorization, 'Bearer test-token')
  await assert.rejects(errorInterceptor({ response: { status: 401 } }))
  assert.equal(authStorage.read().token, null)
})
