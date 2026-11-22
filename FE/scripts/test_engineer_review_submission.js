import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transformWithOxc } from 'vite'

const read = (path) => fs.readFileSync(new URL('../src/' + path, import.meta.url), 'utf8')
  .replace(/^import .*\r?\n/gm, '').replace(/^export default /gm, '').replace(/^export /gm, '')
const hookSource = read('hooks/useEngineerReviewSubmission.js')

function submitHook(action, options = {}) {
  const navigation = []
  const calls = []
  let cleanup
  const context = vm.createContext({
    useNavigate: () => (...args) => navigation.push(args),
    useRef: (current) => ({ current }),
    useEffect: (callback) => { cleanup = callback() },
  })
  vm.runInContext(hookSource, context)
  const submit = context.useEngineerReviewSubmission({
    workflow: { submit: (comment) => { calls.push(['submit', comment]); return action() },
      resubmit: () => { calls.push(['resubmit']); return action() } },
    comment: 'Ghi chú đã kiểm tra', hasRejected: false, disabled: false, ...options,
  })
  return { submit, navigation, calls, unmount: () => cleanup() }
}

test('navigate to catalog with confirmation only after API submission succeeds', async () => {
  let resolve
  const action = new Promise((done) => { resolve = done })
  const hook = submitHook(() => action)
  const pending = hook.submit()
  assert.equal(hook.navigation.length, 0)
  assert.deepEqual(hook.calls, [['submit', 'Ghi chú đã kiểm tra']])
  resolve(true)
  await pending
  assert.equal(hook.navigation[0][0], '/engineer/datasets')
  assert.equal(hook.navigation[0][1].replace, true)
  assert.equal(hook.navigation[0][1].state.reviewSubmitted, 'submitted')
})

test('API failure stays on pipeline and can be retried without a success notice', async () => {
  let succeeds = false
  const hook = submitHook(async () => succeeds)
  await hook.submit()
  assert.equal(hook.navigation.length, 0)
  succeeds = true
  await hook.submit()
  assert.equal(hook.calls.length, 2)
  assert.equal(hook.navigation.length, 1)
})

test('resubmission uses its API and emits a distinct confirmation', async () => {
  const hook = submitHook(async () => true, { hasRejected: true })
  await hook.submit()
  assert.deepEqual(hook.calls, [['resubmit']])
  assert.equal(hook.navigation[0][1].state.reviewSubmitted, 'resubmitted')
})

test('disabled actions and duplicate clicks do not issue extra submissions', async () => {
  const disabled = submitHook(async () => true, { disabled: true })
  await disabled.submit()
  assert.equal(disabled.calls.length, 0)
  let resolve
  const hook = submitHook(() => new Promise((done) => { resolve = done }))
  const pending = hook.submit()
  await hook.submit()
  assert.equal(hook.calls.length, 1)
  resolve(true)
  await pending
  assert.equal(hook.navigation.length, 1)
})

test('leaving the page during the request prevents an unexpected redirect later', async () => {
  let resolve
  const hook = submitHook(() => new Promise((done) => { resolve = done }))
  const pending = hook.submit()
  hook.unmount()
  resolve(true)
  await pending
  assert.equal(hook.navigation.length, 0)
})

test('catalog consumes confirmation from history, preserves other state, and allows dismissal', () => {
  const navigation = []
  let stored
  const location = { pathname: '/engineer/datasets', search: '', hash: '',
    state: { reviewSubmitted: 'submitted', unrelated: 'preserved' } }
  const context = vm.createContext({
    useLocation: () => location, useNavigate: () => (...args) => navigation.push(args),
    useState: (initial) => [stored ??= initial(), (value) => { stored = value }],
    useEffect: (callback) => callback(),
  })
  vm.runInContext(hookSource, context)
  const notice = context.useEngineerCatalogNotice()
  assert.ok(notice.notice.includes('Đã gửi batch phê duyệt thành công'))
  assert.equal(navigation[0][0], '/engineer/datasets')
  assert.equal(navigation[0][1].replace, true)
  assert.equal(navigation[0][1].state.reviewSubmitted, undefined)
  assert.equal(navigation[0][1].state.unrelated, 'preserved')
  notice.dismiss()
  assert.equal(stored, '')
})

test('catalog presents an accessible Vietnamese confirmation alongside the catalog', async () => {
  const result = await transformWithOxc(read('features/engineer/pages/EngineerCatalogPage.jsx'),
    'EngineerCatalogPage.jsx', { jsx: { runtime: 'classic' } })
  const context = vm.createContext({ React,
    useEngineerCatalogNotice: () => ({ notice: 'Đã gửi batch phê duyệt thành công.' }),
    EngineerBatchBrowser: () => React.createElement('div', null, 'Danh mục tập dữ liệu'),
    CheckCircle2: () => null, X: () => null,
  })
  vm.runInContext(result.code, context)
  const html = renderToStaticMarkup(React.createElement(context.EngineerCatalogPage))
  assert.ok(html.includes('role="status"') && html.includes('aria-live="polite"'))
  assert.ok(html.includes('Đã gửi batch phê duyệt thành công.'))
  assert.ok(html.includes('Danh mục tập dữ liệu') && html.includes('Đóng thông báo'))
})
