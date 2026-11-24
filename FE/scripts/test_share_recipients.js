import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transformWithOxc } from 'vite'

const source = (file) => fs.readFileSync(new URL('../src/' + file, import.meta.url), 'utf8')
  .replace(/^import .*\r?\n/gm, '').replace(/^export default /gm, '').replace(/^export /gm, '')
const users = [
  { user_id: 'business-a', full_name: 'Business A', email: 'a@example.com' },
  { user_id: 'business-b', full_name: 'Business B', email: 'b@example.com' },
]
const flush = () => new Promise((resolve) => setImmediate(resolve))

function session(recipients = users) {
  const slots = [], effects = [], catalogs = [], shares = []
  let cursor = 0
  const context = vm.createContext({
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = initial
      return [slots[index], (next) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next }]
    },
    useEffect(fn, deps) {
      const index = cursor++, previous = slots[index]
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
        effects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: fn() } })
      }
    },
    sharingService: {
      getRecipients: async () => recipients,
      getCatalog(ids) {
        return new Promise((resolve) => catalogs.push({ ids: [...ids], resolve }))
      },
      shareSelection: async (payload) => { shares.push(payload) },
    },
    extractErrorMessage: (error) => error.message,
  })
  vm.runInContext(source('hooks/useShareSelection.js'), context)
  return {
    catalogs, shares,
    render() {
      cursor = 0
      const hook = context.useShareSelection()
      effects.splice(0).forEach((effect) => effect())
      return hook
    },
  }
}

test('two users require explicit selection and load catalog for the chosen audience', async () => {
  const view = session()
  view.render()
  await flush()
  assert.equal(view.render().recipients.length, 2)
  assert.equal(view.render().recipientIds.length, 0)
  assert.equal(view.catalogs.length, 0)
  view.render().toggleRecipient('business-b')
  view.render()
  assert.deepEqual(view.catalogs[0].ids, ['business-b'])
  await view.render().share({ group_id: 'batch', recipient_ids: ['forged-user'] })
  assert.deepEqual([...view.shares[0].recipient_ids], ['business-b'])
})

test('only one Business User is automatically selected', async () => {
  const view = session([users[0]])
  view.render()
  await flush()
  view.render()
  assert.deepEqual(view.catalogs[0].ids, ['business-a'])
})

test('multiple recipients are sent together and can be deselected', async () => {
  const view = session()
  view.render()
  await flush()
  view.render().toggleRecipient('business-a')
  view.render().toggleRecipient('business-b')
  await view.render().share({ group_id: 'batch' })
  assert.deepEqual([...view.shares[0].recipient_ids], ['business-a', 'business-b'])
  view.render().toggleRecipient('business-a')
  assert.deepEqual([...view.render().recipientIds], ['business-b'])
})

test('late catalog response for a previous audience cannot overwrite current permissions', async () => {
  const view = session()
  view.render()
  await flush()
  view.render().toggleRecipient('business-a')
  view.render()
  view.render().toggleRecipient('business-b')
  view.render()
  view.catalogs[1].resolve({ batches: [{ group_id: 'current' }] })
  await flush()
  view.catalogs[0].resolve({ batches: [{ group_id: 'stale' }] })
  await flush()
  assert.equal(view.render().batches[0].group_id, 'current')
})

test('no Business Users means no catalog and no automatic public sharing', async () => {
  const view = session([])
  view.render()
  await flush()
  assert.equal(view.render().recipients.length, 0)
  assert.equal(view.catalogs.length, 0)
})

test('share dialog shows named recipients and prevents continuing without a batch', async () => {
  const jsx = source('features/scientist/components/ShareSelectionModal.jsx')
  const { code } = await transformWithOxc(jsx, 'ShareSelectionModal.jsx', { jsx: { runtime: 'classic' } })
  const Icon = () => null
  const context = vm.createContext({ React, useState: React.useState, Check: Icon, ChevronLeft: Icon, X: Icon,
    useShareSelection: () => ({ batches: [], recipients: users, recipientIds: [], recipientsLoading: false,
      toggleRecipient() {}, loading: false, busy: false, error: '', share() {} }),
  })
  vm.runInContext(code, context)
  const markup = renderToStaticMarkup(React.createElement(context.ShareSelectionModal, { onClose() {}, onChanged() {} }))
  assert.match(markup, /Business A/)
  assert.match(markup, /Business B/)
  assert.match(markup, /a@example.com/)
  assert.match(markup, /Chọn người nhận để tải danh sách batch/)
  assert.match(markup, /disabled=""[^>]*>Tiếp tục/)
})

async function renderManagedShares(recipients) {
  const jsx = source('features/scientist/pages/ScientistSharesPage.jsx')
  const { code } = await transformWithOxc(jsx, 'ScientistSharesPage.jsx', { jsx: { runtime: 'classic' } })
  const Icon = () => null
  const context = vm.createContext({
    React, useState: React.useState,
    Check: Icon, ChevronLeft: Icon, ChevronRight: Icon, Eye: Icon, Inbox: Icon,
    Plus: Icon, Search: Icon, Share2: Icon,
    useManagedResourceShares: () => ({
      loading: false, error: '', total_records: 1, active_count: 1, unshared_count: 0,
      revoked_count: 0, reload() {}, data: [{
        share_id: 'share-a', resource_id: 'dataset-a', name: 'Batch 01', resource_type: 'DATASET',
        shared_at: '2026-11-23T13:42:29Z', status: 'PUBLISHED', item_count: 4, recipients,
      }],
    }),
  })
  vm.runInContext(code, context)
  return renderToStaticMarkup(React.createElement(context.ScientistSharesPage))
}

test('managed table aligns recipients, dates, status and actions under six matching headers', async () => {
  const markup = await renderManagedShares(users)
  const headings = [...markup.match(/<thead>([\s\S]*?)<\/thead>/)[1].matchAll(/<th\b[^>]*>(.*?)<\/th>/g)].map((m) => m[1])
  const cells = [...markup.match(/<tbody>([\s\S]*?)<\/tbody>/)[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1])
  assert.deepEqual(headings, ['Tài nguyên', 'Loại', 'Người nhận', 'Ngày chia sẻ', 'Trạng thái', 'Thao tác'])
  assert.equal(cells.length, headings.length)
  assert.match(cells[2], /Business A/)
  assert.match(cells[2], /a@example.com/)
  assert.match(cells[2], /Business B/)
  assert.match(cells[3], /23\/11\/2026/)
  assert.match(cells[4], /Đang chia sẻ/)
  assert.match(cells[5], /Thu hồi gói \(4\)/)
})

test('empty recipients use correctly encoded Vietnamese fallback', async () => {
  const markup = await renderManagedShares([])
  assert.match(markup, /Chưa chọn người nhận/)
  assert.doesNotMatch(markup, /Ch\?a/)
})
