import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import React from 'react'
import { transformWithOxc } from 'vite'

const icon = () => null
const translate = { useLanguage: () => ({ t: (value) => value }) }
const elements = (node) => !node || typeof node !== 'object' ? [] : [node,
  ...React.Children.toArray(node.props?.children).flatMap(elements)]
const text = (node) => React.Children.toArray(node.props?.children)
  .map((child) => typeof child === 'object' ? text(child) : child).join('')

async function harness(path, name, globals = {}) {
  let index = 0
  const values = []
  const source = fs.readFileSync(new URL('../src/' + path, import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
    .replace(/^import ['"][^'"]+['"]\r?\n/gm, '').replace('export default ', '')
  const { code } = await transformWithOxc(source, name + '.jsx', { jsx: { runtime: 'classic' } })
  const context = vm.createContext({ React, ...translate,
    useState: (initial) => {
      const key = index++
      if (!(key in values)) values[key] = typeof initial === 'function' ? initial() : initial
      return [values[key], (next) => { values[key] = typeof next === 'function' ? next(values[key]) : next }]
    }, useEffect: () => {}, ...globals,
  })
  vm.runInContext(code, context)
  return (props = {}) => { index = 0; return context[name](props) }
}

test('engineer account card opens and closes the shared profile/password dialog', async () => {
  const Profile = () => null
  const render = await harness('features/engineer/EngineerLayout.jsx', 'EngineerLayout', {
    useAuth: () => ({ user: { id: 'engineer-fixture', full_name: 'Engineer', email: 'engineer@example.test' } }),
    useLogout: () => ({ handleLogout: () => {}, isLoggingOut: false }),
    useNavigate: () => () => {}, useLocation: () => ({ pathname: '/engineer' }),
    useEngineerCatalog: () => ({ datasets: [] }), loadJsonStorage: () => ({}), RECORD_CACHE_STORAGE_KEY: 'records',
    NavLink: icon, Outlet: icon, LanguageSwitcher: icon, ScientistProfileModal: Profile,
    LayoutDashboard: icon, FileSpreadsheet: icon, Upload: icon, Table2: icon, Workflow: icon, Database: icon, LogOut: icon,
  })
  let tree = elements(render())
  const trigger = tree.find((node) => node.type === 'button' && node.props['aria-haspopup'] === 'dialog')
  assert.ok(trigger)
  assert.equal(trigger.props['aria-expanded'], false)
  trigger.props.onClick()
  tree = elements(render())
  const modal = tree.find((node) => node.type === Profile)
  assert.equal(modal.props.isOpen, true)
  assert.equal(modal.props.roleLabel, 'Data Engineer')
  modal.props.onClose()
  assert.equal(elements(render()).find((node) => node.type === Profile).props.isOpen, false)
})

test('the reused password form validates confirmation and submits the existing profile API contract', async () => {
  const calls = []
  const render = await harness('features/scientist/components/ScientistProfileModal.jsx', 'ScientistProfileModal', {
    X: icon, User: icon, KeyRound: icon, ShieldCheck: icon, Eye: icon, EyeOff: icon,
    CheckCircle2: icon, AlertCircle: icon, RefreshCw: icon, Mail: icon, Calendar: icon, Lock: icon,
    formatDate: () => '', extractErrorMessage: () => 'API error',
    authService: { changePasswordInProfile: async (payload) => {
      calls.push(payload)
      return { message: 'Password updated' }
    } },
  })
  const props = { isOpen: true, onClose: () => {}, roleLabel: 'Data Engineer' }
  elements(render(props)).find((node) => node.type === 'button' && text(node).includes('Change Password')).props.onClick()
  const fill = (current, next, confirmation) => {
    const inputs = elements(render(props)).filter((node) => node.type === 'input')
    assert.equal(inputs.length, 3)
    for (const [index, value] of [current, next, confirmation].entries()) inputs[index].props.onChange({ target: { value } })
  }
  fill('fixture-current', 'fixture-new-password', 'different-confirmation')
  await elements(render(props)).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.equal(calls.length, 0)
  fill('fixture-current', 'fixture-new-password', 'fixture-new-password')
  const form = elements(render(props)).find((node) => node.type === 'form')
  assert.equal(form.props.noValidate, true)
  await form.props.onSubmit({ preventDefault() {} })
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{
    current_password: 'fixture-current', new_password: 'fixture-new-password', confirm_new_password: 'fixture-new-password',
  }])
  assert.ok(elements(render(props)).filter((node) => node.type === 'input').every((input) => input.props.value === ''))
})
