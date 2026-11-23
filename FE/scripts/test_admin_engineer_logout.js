import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import React from 'react'
import { transformWithOxc } from 'vite'
import { authStorage } from '../src/services/authStorage.js'
import { requiresPasswordChange, sessionUser } from '../src/services/authSession.js'

const read = (path) => fs.readFileSync(new URL('../src/' + path, import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
  .replace(/^import ['"][^'"]+['"]\r?\n/gm, '').replace(/^export default /gm, '').replace(/^export /gm, '')
const memoryStorage = () => {
  const values = new Map()
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key) }
}
beforeEach(() => {
  globalThis.localStorage = memoryStorage()
  globalThis.sessionStorage = memoryStorage()
})

async function providerLogout(post) {
  const serviceContext = vm.createContext({ apiClient: { post } })
  vm.runInContext(read('services/authService.js') + '\nglobalThis.service = authService', serviceContext)
  const providerContext = vm.createContext({ React, createContext: () => ({ Provider: () => null }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useCallback: (callback) => callback, useEffect: () => {}, authStorage, requiresPasswordChange, sessionUser,
    authService: serviceContext.service,
  })
  const { code } = await transformWithOxc(read('context/AuthContext.jsx'), 'AuthContext.jsx', { jsx: { runtime: 'classic' } })
  vm.runInContext(code, providerContext)
  return providerContext.AuthProvider({}).props.value.logout
}

function logoutHook(logout) {
  let cursor = 0, mounted = false, cleanup
  const values = [], navigation = []
  const context = vm.createContext({
    useAuth: () => ({ logout }),
    useNavigate: () => (path, options) => {
      assert.equal(authStorage.read().user, null, 'Token must be cleared before redirect')
      navigation.push({ path, options })
    },
    useState: (initial) => {
      const key = cursor++
      if (!(key in values)) values[key] = initial
      return [values[key], (next) => { values[key] = next }]
    },
    useRef: (current) => {
      const key = cursor++
      return values[key] ??= { current }
    },
    useEffect: (callback) => { if (!mounted) { cleanup = callback(); mounted = true } },
  })
  vm.runInContext(read('hooks/useLogout.js'), context)
  return { render: () => { cursor = 0; return context.useLogout() }, navigation, unmount: () => cleanup() }
}

for (const role of ['admin', 'data_engineer']) {
  for (const succeeds of [true, false]) {
    test(`${role}: logout revokes before redirect and stays signed in on network failure (${succeeds ? 'success' : 'network failure'})`, async () => {
      const user = { id: role + '-fixture', role_id: role }
      authStorage.save({ access_token: 'fixture-current-token', user }, true)
      // Also verify stale session credentials are cleared.
      sessionStorage.setItem('access_token', 'fixture-current-token')
      sessionStorage.setItem('user_info', JSON.stringify(user))
      let resolve, reject, calls = 0
      const logout = await providerLogout((url, payload, config) => {
        calls++
        assert.equal(url, '/auth/session/logout')
        assert.equal(payload, undefined)
        assert.equal(config.timeout, 10000)
        assert.equal(authStorage.read().user.id, user.id)
        return new Promise((done, fail) => { resolve = done; reject = fail })
      })
      const hook = logoutHook(logout)
      const pending = hook.render().handleLogout()
      await hook.render().handleLogout()
      assert.equal(calls, 1)
      assert.equal(hook.render().isLoggingOut, true)
      assert.equal(hook.navigation.length, 0)
      assert.equal(authStorage.read().user.id, user.id)
      if (succeeds) resolve({ data: { message: 'Signed out' } })
      else reject(new Error('Network unavailable'))
      await pending
      if (succeeds) assert.equal(hook.navigation[0].path, '/login')
      if (succeeds) assert.equal(hook.navigation[0].options.replace, true)
      else { assert.equal(hook.navigation.length, 0); assert.equal(authStorage.read().user.id, user.id) }
      for (const storage of [sessionStorage, localStorage]) {
        assert.equal(storage.getItem('access_token'), null)
        assert.equal(storage.getItem('user_info'), null)
      }
      assert.equal(hook.render().isLoggingOut, false)
    })
  }
}

const icon = () => null
const elements = (node) => !node || typeof node !== 'object' ? [] : [node,
  ...React.Children.toArray(node.props?.children).flatMap(elements)]

test('Admin and DE logout buttons use the shared API flow and remain disabled while pending', async () => {
  for (const [path, name] of [['features/admin/AdminLayout.jsx', 'AdminLayout'], ['features/engineer/EngineerLayout.jsx', 'EngineerLayout']]) {
    const handleLogout = () => {}
    const context = vm.createContext({ React,
      useAuth: () => ({ user: { full_name: 'Fixture', email: 'fixture@example.test' } }),
      useLogout: () => ({ handleLogout, isLoggingOut: true }),
      useLanguage: () => ({ t: (text) => text }), useLocation: () => ({ pathname: '/engineer' }),
      useNavigate: () => () => {}, useAdminNavigation: () => () => {},
      useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
      useEngineerCatalog: () => ({ datasets: [] }), loadJsonStorage: () => ({}), RECORD_CACHE_STORAGE_KEY: 'fixture',
      NavLink: icon, Outlet: icon, LanguageSwitcher: icon, ScientistProfileModal: icon,
      LayoutDashboard: icon, Users: icon, ShieldCheck: icon, Database: icon, ScrollText: icon,
      LogOut: icon, Shield: icon, FileSpreadsheet: icon, Upload: icon, Table2: icon, Workflow: icon,
    })
    const { code } = await transformWithOxc(read(path), name + '.jsx', { jsx: { runtime: 'classic' } })
    vm.runInContext(code, context)
    const button = elements(context[name]()).find((node) => node.type === 'button' && node.props.className === 'adm-logout-btn')
    assert.equal(button.props.onClick, handleLogout)
    assert.equal(button.props.disabled, true)
    assert.equal(button.props['aria-busy'], true)
    assert.ok(elements(button).some((node) => node.type === 'span' && node.props.children === 'Đang đăng xuất...'))
  }
})
