import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transformWithOxc } from 'vite'

const source = (path) => fs.readFileSync(new URL('../src/' + path, import.meta.url), 'utf8')
  .replace(/^import .*\r?\n/gm, '').replace(/^export default /gm, '').replace(/^export /gm, '')
const component = await transformWithOxc(source('features/engineer/components/EngineerBatchBrowser.jsx'),
  'EngineerBatchBrowser.jsx', { jsx: { runtime: 'classic' } })

function renderBatches(items, mode = 'catalog') {
  const context = vm.createContext({ React,
    useLanguage: () => ({ t: (value) => value }), useNavigate: () => () => {}, useSearchParams: () => [new URLSearchParams()],
    useEngineerBatchBrowser: () => ({ search: '', setSearch: () => {}, resource: { items, total: items.length, reload: () => {} } }),
    useEngineerBatchDeletion: () => ({ target: null, busy: false, open: () => {} }),
    EngineerState: ({ children }) => children, EngineerHeader: () => null, EngineerPagination: () => null,
    EngineerFeedback: () => null, EngineerDeleteBatchModal: () => null,
    EngineerBatchApproval: ({ status }) => React.createElement('span', null, status),
    Eye: () => null, FolderOpen: () => null, Layers: () => null, Search: () => null, Trash2: () => null,
    Upload: () => null, Workflow: () => null,
  })
  vm.runInContext(component.code, context)
  return renderToStaticMarkup(React.createElement(context.EngineerBatchBrowser, { mode }))
}

test('only backend-authorized unsubmitted batches show a delete button', () => {
  const items = [
    { group_id: 'draft', group_name: 'Draft', approval_status: 'PENDING', can_delete: true },
    { group_id: 'sent', group_name: 'Sent', approval_status: 'SUBMITTED', can_delete: false },
    { group_id: 'approved', group_name: 'Approved', approval_status: 'APPROVED', can_delete: false },
    { group_id: 'rejected', group_name: 'Rejected', approval_status: 'REJECTED', can_delete: false },
    { group_id: 'mixed', group_name: 'Mixed', approval_status: 'MIXED', can_delete: false },
    { group_id: 'unknown', group_name: 'Unknown', approval_status: 'PENDING' },
  ]
  const html = renderBatches(items)
  assert.equal((html.match(/>Delete batch</g) || []).length, 1)
  assert.equal((html.match(/>View Datasets</g) || []).length, items.length)
  assert(!renderBatches(items, 'preview').includes('Delete batch'))
})

function hook() {
  const values = [], refs = [], calls = []
  let position = 0, refPosition = 0, resolve, reject, reloads = 0
  const context = vm.createContext({
    useEffect: () => {},
    useState: (initial) => {
      const index = position++
      if (!(index in values)) values[index] = initial
      return [values[index], (value) => { values[index] = value }]
    },
    useRef: (initial) => { const index = refPosition++; return refs[index] ||= { current: initial } },
    useAuth: () => ({ user: { id: 'engineer' } }), useLanguage: () => ({ t: (value) => value }),
    adminError: (error) => error.message,
    engineerService: { deleteBatch: (id) => { calls.push(id); return new Promise((yes, no) => { resolve = yes; reject = no }) } },
    invalidateEngineerPreviews: () => {}, invalidateAdminResourceCache: () => {},
    engineerStorageKey: (key) => key + ':engineer', localStorage: { removeItem: () => {} }, sessionStorage: { removeItem: () => {} },
  })
  vm.runInContext(source('hooks/useEngineerBatchDeletion.js'), context)
  return { calls, render: () => { position = refPosition = 0; return context.useEngineerBatchDeletion(() => { reloads += 1 }) },
    resolve: (value) => resolve(value), reject: (error) => reject(error), reloads: () => reloads }
}

test('opening and cancelling confirmation never sends a DELETE request', () => {
  const state = hook()
  state.render().open({ group_id: 'draft', can_delete: true })
  assert.equal(state.render().target.group_id, 'draft')
  assert.equal(state.calls.length, 0)
  state.render().close()
  assert.equal(state.render().target, null)
  state.render().open({ group_id: 'sent', can_delete: false })
  assert.equal(state.render().target, null)
  assert.equal(state.calls.length, 0)
})

test('confirmation sends one DELETE despite repeated clicks and refreshes after success', async () => {
  const state = hook()
  state.render().open({ group_id: 'draft', can_delete: true })
  const first = state.render().confirm()
  await state.render().confirm()
  assert.deepEqual(state.calls, ['draft'])
  state.resolve({ cleanup_pending: false })
  await first
  assert.equal(state.render().target, null)
  assert.equal(state.render().success, 'Batch deleted successfully.')
  assert.equal(state.reloads(), 1)
})

test('a newly submitted batch rejected by BE refreshes the list and displays the conflict', async () => {
  const state = hook()
  state.render().open({ group_id: 'draft', can_delete: true })
  const promise = state.render().confirm()
  state.reject(Object.assign(new Error('Batch already submitted'), { response: { status: 409 } }))
  await promise
  assert.equal(state.render().target, null)
  assert.equal(state.render().error, 'Batch already submitted')
  assert.equal(state.render().success, '')
  assert.equal(state.reloads(), 1)
})
