import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import { transformWithOxc } from 'vite'
import { authStorage } from '../src/services/authStorage.js'
import { authenticatedPath, requiresPasswordChange, sessionUser } from '../src/services/authSession.js'
import { translateText } from '../src/services/languageService.js'

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const stripImports = (source) => source.replace(/^import .*\r?\n/gm, '')
const limitedToken = `test.${Buffer.from(JSON.stringify({ pwd_change_only: true })).toString('base64url')}.test`
const regularToken = `test.${Buffer.from(JSON.stringify({ role: 'data_engineer' })).toString('base64url')}.test`
const user = { id: 'first-login-user', email: 'first-login@example.test', role_id: 'data_engineer', must_change_password: true }
const limitedSession = { access_token: limitedToken, user, must_change_password: true }
const regularSession = { access_token: regularToken, user: { ...user, must_change_password: false }, must_change_password: false }
const event = { preventDefault() {} }
function memoryStorage() {
  const values = new Map()
  return { getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) }
}
beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage(), configurable: true })
  Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage(), configurable: true })
})

function stateHooks() {
  const slots = []
  let cursor = 0
  return { reset: () => { cursor = 0 },
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
  }
}

const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) }
async function component(path, name, globals) {
  const source = stripImports(read(path)).replace(/^export default /gm, '').replace(/^export /gm, '')
  const result = await transformWithOxc(source, name + '.jsx', { jsx: { runtime: 'classic' } })
  const context = vm.createContext({ React, ...globals })
  vm.runInContext(result.code, context)
  return context[name]
}

test('all workspaces redirect a first-login user to the password form', () => {
  for (const [role, path] of Object.entries({ admin: '/admin', data_engineer: '/engineer', data_scientist: '/scientist', business_user: '/business' })) {
    assert.equal(authenticatedPath({ role, must_change_password: true }), '/change-password')
    assert.equal(authenticatedPath({ role, must_change_password: false }), path)
  }
})

test('the API flag persists on reload, including a top-level-only flag and legacy limited tokens', () => {
  authStorage.save({ access_token: 'fixture', user: { role_id: 'data_engineer' }, must_change_password: true }, true)
  assert.equal(authStorage.read().user.must_change_password, true)
  assert.equal(authStorage.read().user.role, 'data_engineer')
  localStorage.setItem('access_token', limitedToken)
  localStorage.setItem('user_info', JSON.stringify({ ...user, must_change_password: false }))
  assert.equal(authenticatedPath(authStorage.read().user, authStorage.read().token), '/change-password')
  assert.equal(requiresPasswordChange(null, 'malformed-token'), false)
})

test('the service sends only new_password to the temporary-password endpoint', async () => {
  const calls = []
  const context = vm.createContext({ apiClient: { post: async (url, payload) => {
    calls.push({ url, payload }); return { data: regularSession }
  } } })
  vm.runInContext(stripImports(read('../src/services/authService.js')).replace('export const authService =', 'globalThis.authService ='), context)
  assert.equal(await context.authService.changeInitialPassword('new-password-123'), regularSession)
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ url: '/auth/change-password', payload: { new_password: 'new-password-123' } }])
})

function formHarness(changeInitialPassword) {
  const hooks = stateHooks()
  const context = vm.createContext({ useState: hooks.useState, useRef: hooks.useRef, useAuth: () => ({ changeInitialPassword }) })
  vm.runInContext(stripImports(read('../src/hooks/useInitialPasswordChange.js')).replace(/^export /gm, ''), context)
  return () => { hooks.reset(); return context.useInitialPasswordChange() }
}

test('invalid length and a mismatched confirmation never call the API', async () => {
  let calls = 0
  const render = formHarness(async () => { calls++ })
  for (const password of ['short', 'x'.repeat(129)]) {
    render().setPassword(password); render().setConfirmation(password)
    await render().submit(event)
    assert.ok(render().error)
  }
  render().setPassword('new-password-123'); render().setConfirmation('different-password')
  await render().submit(event)
  assert.equal(render().error, 'The passwords do not match.')
  assert.equal(calls, 0)
})

test('a pending submission is sent once, fields stay locked, and success clears passwords', async () => {
  let resolve, calls = 0
  const render = formHarness(() => { calls++; return new Promise((done) => { resolve = done }) })
  render().setPassword('new-password-123'); render().setConfirmation('new-password-123')
  const first = render().submit(event)
  await render().submit(event)
  render().setPassword('attempted-edit')
  assert.equal(calls, 1)
  assert.equal(render().password, 'new-password-123')
  assert.equal(render().isSubmitting, true)
  resolve(); await first
  assert.equal(render().password, '')
  assert.equal(render().confirmation, '')
  assert.equal(render().isSubmitting, false)
})

test('API rejection keeps the form available for correction and retry', async () => {
  let failed = true
  const render = formHarness(async () => { if (failed) throw { response: { status: 400, data: { detail: 'Must differ from temporary password' } } } })
  render().setPassword('new-password-123'); render().setConfirmation('new-password-123')
  await render().submit(event)
  assert.equal(render().error, 'Must differ from temporary password')
  assert.equal(render().password, 'new-password-123')
  assert.equal(render().isSubmitting, false)
  failed = false
  await render().submit(event)
  assert.equal(render().error, '')
})

async function authHarness(service) {
  const hooks = stateHooks()
  const Provider = await component('../src/context/AuthContext.jsx', 'AuthProvider', {
    createContext: () => ({ Provider: 'Provider' }), useState: hooks.useState, useCallback: (fn) => fn,
    authStorage, authService: service, requiresPasswordChange, sessionUser,
  })
  return () => { hooks.reset(); return Provider({}).props.value }
}

test('login validates locally without browser popups and only submits complete credentials', async () => {
  const calls = []
  const render = await authHarness({ login: async (payload) => {
    calls.push(payload)
    return regularSession
  } })
  for (const [email, password] of [['', ''], ['invalid-email', 'secret'], ['person@example.test', '']]) {
    assert.equal((await render().login(email, password)).success, false)
    assert.ok(render().error)
  }
  assert.equal(calls.length, 0)
  assert.equal((await render().login(' person@example.test ', ' secret ')).success, true)
  assert.equal(calls[0].email, 'person@example.test')
  assert.equal(calls[0].password, ' secret ')
})

test('successful first password change replaces the limited token and retains the remember setting', async () => {
  for (const remember of [false, true]) {
    authStorage.save(limitedSession, remember)
    const render = await authHarness({ changeInitialPassword: async () => regularSession })
    assert.equal(render().mustChangePassword, true)
    await render().changeInitialPassword('new-password-123')
    assert.equal(render().mustChangePassword, false)
    assert.equal(render().token, regularToken)
    assert.equal(authStorage.read().user.must_change_password, false)
    assert.equal((remember ? localStorage : sessionStorage).getItem('access_token'), regularToken)
    assert.equal((remember ? sessionStorage : localStorage).getItem('access_token'), null)
    assert.equal(authenticatedPath(render().user, render().token), '/engineer')
  }
})

test('rejected or still-limited API responses never unlock the workspace', async () => {
  authStorage.save(limitedSession, false)
  const failed = await authHarness({ changeInitialPassword: async () => { throw { response: { status: 400 } } } })
  await assert.rejects(failed().changeInitialPassword('new-password-123'))
  assert.equal(failed().mustChangePassword, true)
  assert.equal(authStorage.read().token, limitedToken)
  const limited = await authHarness({ changeInitialPassword: async () => limitedSession })
  await assert.rejects(limited().changeInitialPassword('new-password-123'), /could not be completed/)
  assert.equal(limited().mustChangePassword, true)
})

test('an expired temporary token clears authentication; a limited session can log out locally', async () => {
  authStorage.save(limitedSession, false)
  const expired = await authHarness({ changeInitialPassword: async () => { throw { response: { status: 401 } } } })
  await assert.rejects(expired().changeInitialPassword('new-password-123'))
  assert.equal(expired().isAuthenticated, false)
  assert.equal(authStorage.read().token, null)
  authStorage.save(limitedSession, false)
  let logoutCalls = 0
  const signedIn = await authHarness({ logout: async () => { logoutCalls++ } })
  await signedIn().logout()
  assert.equal(logoutCalls, 0)
  assert.equal(signedIn().isAuthenticated, false)
})

test('the actual route guard redirects before rendering any workspace', async () => {
  let auth = { isAuthenticated: true, role: 'data_engineer', mustChangePassword: true }
  const Guard = await component('../src/components/ProtectedRoute.jsx', 'ProtectedRoute', {
    useAuth: () => auth, useLocation: () => ({ pathname: '/engineer' }),
    Navigate: 'Navigate', Outlet: 'Outlet', PASSWORD_CHANGE_PATH: '/change-password',
  })
  assert.equal(Guard({ allowedRoles: ['data_engineer'] }).props.to, '/change-password')
  auth = { ...auth, mustChangePassword: false }
  assert.equal(Guard({ allowedRoles: ['data_engineer'] }).type, 'Outlet')
  auth = { isAuthenticated: false }
  assert.equal(Guard({}).props.to, '/login')
})

test('the actual first-login page guards its route and renders the API password constraints', async () => {
  let auth = { isAuthenticated: true, mustChangePassword: true, user, token: limitedToken }
  const Page = await component('../src/features/auth/InitialPasswordPage.jsx', 'InitialPasswordPage', {
    useAuth: () => auth, useLanguage: () => ({ t: (key) => translateText(key, 'vi') }), authenticatedPath,
    useInitialPasswordChange: () => ({ password: '', confirmation: '', isSubmitting: false }),
    Navigate: 'Navigate', Eye: 'Eye', EyeOff: 'EyeOff', Loader2: 'Loader2', LockKeyhole: 'LockKeyhole', ShieldCheck: 'ShieldCheck',
  })
  const descendants = []
  function walk(element) {
    if (!element || typeof element !== 'object') return
    descendants.push(element)
    for (const child of (element.props?.children || []).flat(Infinity)) walk(child)
  }
  walk(Page())
  const inputs = descendants.filter((element) => element.type === 'input')
  assert.equal(inputs.length, 2)
  assert.ok(inputs.every(({ props }) => props.minLength === 12 && props.maxLength === 128 && props.autoComplete === 'new-password'))
  assert.equal(descendants.find((element) => element.type === 'h1').props.children[0], translateText('Set your new password', 'vi'))
  auth = { ...auth, mustChangePassword: false, user: regularSession.user, token: regularToken }
  assert.equal(Page().props.to, '/engineer')
  auth = { isAuthenticated: false }
  assert.equal(Page().props.to, '/login')
})
