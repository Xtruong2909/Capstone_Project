import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { transformWithOxc } from 'vite'
import { authStorage } from '../src/services/authStorage.js'
import { requiresPasswordChange } from '../src/services/authSession.js'

async function provider(service) {
  authStorage.clear()
  const state = []
  let cursor = 0, effect, mounted = false, cleanup
  const context = vm.createContext({
    authStorage, authService: service, requiresPasswordChange,
    createContext: () => ({ Provider: 'Provider' }),
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    useState: (initial) => {
      const index = cursor++
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial
      return [state[index], (value) => { state[index] = value }]
    },
    useCallback: (callback) => callback,
    useEffect: (callback) => { if (!mounted) effect = callback },
  })
  const source = readFileSync(new URL('../src/context/AuthContext.jsx', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '').replace(/^export /gm, '')
  const result = await transformWithOxc(source, 'AuthContext.jsx', { jsx: { runtime: 'classic' } })
  vm.runInContext(result.code, context)
  const render = () => { cursor = 0; return context.AuthProvider({}).props.value }
  render()
  cleanup = effect()
  mounted = true
  return { render, unmount: () => cleanup() }
}

const session = {
  user: { id: 'cookie-user', role_id: 'data_engineer', must_change_password: false },
  csrf_token: 'not-a-session-credential',
}
const tick = () => new Promise((resolve) => setImmediate(resolve))

test('reload restores identity from the server and waits before showing protected routes', async () => {
  let resolve
  const harness = await provider({ restoreSession: () => new Promise((done) => { resolve = done }) })
  assert.equal(harness.render().isLoading, true)
  assert.equal(harness.render().isAuthenticated, false)
  resolve(session)
  await tick()
  assert.equal(harness.render().isLoading, false)
  assert.equal(harness.render().isAuthenticated, true)
  assert.equal(harness.render().role, 'data_engineer')
  assert.equal(harness.render().token, undefined)
  harness.unmount()
})

test('a server-rejected cookie does not restore a locally forged identity', async () => {
  const harness = await provider({ restoreSession: async () => { throw { response: { status: 401 } } } })
  await tick()
  assert.equal(harness.render().isAuthenticated, false)
  assert.equal(harness.render().isLoading, false)
  assert.equal(harness.render().error, null)
  harness.unmount()
})

test('an inactive bootstrap cannot overwrite a later signed-in session', async () => {
  let resolve
  const harness = await provider({ restoreSession: () => new Promise((done) => { resolve = done }) })
  harness.unmount()
  authStorage.save({ ...session, user: { ...session.user, id: 'new-user' } })
  resolve(session)
  await tick()
  assert.equal(authStorage.read().user.id, 'new-user')
})
