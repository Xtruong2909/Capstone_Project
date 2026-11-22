import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transformWithOxc } from 'vite'

const read = (path) => fs.readFileSync(new URL('../src/' + path, import.meta.url), 'utf8')
const withoutImports = (source) => source.replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
const icon = () => null

async function component(path, name, globals) {
  const source = withoutImports(read(path)).replace('export default ', '')
  const { code } = await transformWithOxc(source, name + '.jsx', { jsx: { runtime: 'classic' } })
  const context = vm.createContext({ React, URLSearchParams, ...globals })
  vm.runInContext(code, context)
  return context[name]
}

function loadService(calls) {
  const context = vm.createContext({ FormData, apiClient: { get: async (url, options) => {
    calls.push({ url, options })
    return { data: { rows: [], pagination: { page: 1, page_size: 20, has_more: false } } }
  } } })
  vm.runInContext(withoutImports(read('services/engineerService.js'))
    .replace('export const engineerService', 'globalThis.engineerService'), context)
  return context.engineerService
}

test('preview API reads the selected batch session and sends API limit, page, representation and column offset', async () => {
  const calls = []
  const service = loadService(calls)
  const signal = new AbortController().signal
  await service.previewSession({ group_id: 'batch-7', dataset_id: 'data-2', session_id: 'session-3',
    page: 2, page_size: 20, representation: 'raw', column_offset: 512 }, signal)
  assert.equal(calls[0].url, '/datasets/groups/batch-7/datasets/data-2/sessions/session-3')
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].options.params)), {
    page: 2, representation: 'raw', column_offset: 512, limit: 20,
  })
  assert.equal(calls[0].options.signal, signal)
})

test('preview route opens batches first and preserves dataset/session deep links', async () => {
  let params = new URLSearchParams()
  const Page = await component('features/engineer/pages/EngineerPreviewPage.jsx', 'EngineerPreviewPage', {
    useSearchParams: () => [params],
    EngineerBatchBrowser: ({ mode }) => React.createElement('div', null, 'batches:' + mode),
    EngineerDatasetSessions: ({ datasetId, sessionId }) => React.createElement('div', null, datasetId + ':' + sessionId),
  })
  assert.match(renderToStaticMarkup(React.createElement(Page)), /batches:preview/)
  params = new URLSearchParams('datasetId=data-2&sessionId=session-3')
  assert.match(renderToStaticMarkup(React.createElement(Page)), /data-2:session-3/)
})

const previewData = {
  original_filename: '20181024_d10_0830_0900.csv', file_size: 100,
  detected_structure: 'pneuma_trajectory', total_columns: 1,
  columns: [{ name: 'track_id', type: 'integer' }], rows: [{ track_id: 17 }],
  pagination: { page: 1, page_size: 20, returned_rows: 1, has_more: true, total_rows: null },
}

async function previewComponent(state) {
  return component('features/engineer/components/EngineerSessionPreview.jsx', 'EngineerSessionPreview', {
    useRef: () => ({ current: null }), useLayoutEffect: () => {},
    useEngineerPreview: () => ({ previewRepresentation: 'normalized', previewPageSize: 20,
      columnOffset: 0, ...state }),
    formatBytes: (value) => value + ' B', formatStructureLabel: () => 'Quỹ đạo UAV pNEUMA',
    Table2: icon, RefreshCw: icon, AlertCircle: icon, AlertTriangle: icon, ChevronLeft: icon, ChevronRight: icon,
  })
}

test('session preview uses has_more from the API, shows actual filename and never invents a record total', async () => {
  const Preview = await previewComponent({ previewData })
  const html = renderToStaticMarkup(React.createElement(Preview, { sessionId: 'session-3' }))
  assert.match(html, /20181024_d10_0830_0900\.csv/)
  assert.doesNotMatch(html, /Tổng số bản ghi|Chưa xác định/)
  assert.doesNotMatch(html, /20\+/)
  assert.match(html, /disabled="" aria-label="Trang trước"/)
  assert.doesNotMatch(html, /disabled="" aria-label="Trang tiếp theo"/)
})

test('raw preview displays the API column range and allows the next column block', async () => {
  const Preview = await previewComponent({ previewRepresentation: 'raw', columnOffset: 512,
    previewData: { ...previewData, column_offset: 512, total_columns: 1200, has_more_columns: true } })
  const html = renderToStaticMarkup(React.createElement(Preview, { sessionId: 'session-3' }))
  assert.match(html, /Cột 513/)
  assert.match(html, /1200/)
  assert.match(html, /Cột trước/)
  assert.match(html, /Cột tiếp/)
})

test('preview keeps exact session column names and uses normalized API names without a warning banner', async () => {
  for (const representation of ['raw', 'normalized']) {
    const name = representation === 'raw' ? 'track_id' : 'vehicle_id'
    const Preview = await previewComponent({ previewData: { ...previewData, representation,
      columns: [{ name, type: 'integer' }], rows: [{ [name]: 17 }],
      warnings: ['Trailing empty values ignored'],
    } })
    const html = renderToStaticMarkup(React.createElement(Preview, { sessionId: 'session-3' }))
    assert.ok(html.includes(`class="eng-preview__column-name">${name}</span>`))
    assert.doesNotMatch(html, /Mã phương tiện|Lưu ý về cấu trúc|Trailing empty|eng-alert--warning/)
    assert.match(html, />17<\/td>/)
  }
})

test('dataset review shows recording sessions from the API with links back to the owning batch', async () => {
  const Page = await component('features/engineer/components/EngineerDatasetSessions.jsx', 'EngineerDatasetSessions', {
    useEngineerDatasetSessions: () => ({ groupId: 'batch-7',
      dataset: { data: { group_id: 'batch-7', group_name: 'Batch 07', name: '20181024-d10', approval_status: 'PENDING' } },
      sessions: { total: 1, items: [{ session_id: 'session-3', original_filename: 'actual-recording.csv', file_size: 100,
        scheduled_start: '2018-10-24T08:30:00+03:00', scheduled_end: '2018-10-24T09:00:00+03:00', upload_status: 'UPLOADED' }] },
    }),
    useNavigate: () => () => {}, Link: ({ to, children, ...props }) => React.createElement('a', { href: to, ...props }, children),
    EngineerState: ({ children }) => children, EngineerBadge: ({ value }) => React.createElement('span', null, value),
    EngineerPagination: icon, EngineerSessionPreview: icon, formatBytes: (value) => value + ' B',
    ArrowLeft: icon, Eye: icon, FolderOpen: icon, RefreshCw: icon,
  })
  const html = renderToStaticMarkup(React.createElement(Page, { datasetId: 'data-2' }))
  assert.match(html, /actual-recording\.csv/)
  assert.match(html, /08:30 – 09:00/)
  assert.match(html, /groupId=batch-7/)
  assert.match(html, /Xem trước/)
})

test('preview hook uses session API and aborts its request on leaving the session', async () => {
  const calls = []
  const effects = []
  const controller = new AbortController()
  const api = loadService(calls)
  const context = vm.createContext({ AbortController, JSON,
    getEngineerPreviewCache: () => ({ peek: () => null,
      request: (params) => api.previewSession(params, controller.signal), cancelResource: () => controller.abort() }),
    useAuth: () => ({ user: { id: 'owner-1' } }),
    adminError: () => 'error', useState: (value) => [value, () => {}],
    useEffect: (callback) => { effects.push(callback) },
  })
  vm.runInContext(withoutImports(read('hooks/useEngineerPreview.js')).replace('export function', 'function'), context)
  context.useEngineerPreview({ groupId: 'batch-7', datasetId: 'data-2', sessionId: 'session-3' })
  const cleanup = effects[0]()
  const cancel = effects[1]()
  assert.equal(calls[0].url, '/datasets/groups/batch-7/datasets/data-2/sessions/session-3')
  assert.equal(calls[0].options.signal.aborted, false)
  cleanup()
  cancel()
  assert.equal(calls[0].options.signal.aborted, true)
})

test('batch approval labels distinguish approved, waiting, rejected and partially approved batches', async () => {
  const Badge = await component('features/engineer/components/EngineerBatchApproval.jsx', 'EngineerBatchApproval', {
    useLanguage: () => ({ t: (value) => value }),
  })
  for (const [status, counts, label] of [
    ['APPROVED', { APPROVED: 4 }, 'Đã phê duyệt'],
    ['SUBMITTED', { SUBMITTED: 4 }, 'Chờ phê duyệt'],
    ['PENDING', { PENDING: 4 }, 'Chưa gửi duyệt'],
    ['REJECTED', { REJECTED: 4 }, 'Đã từ chối'],
    ['MIXED', { APPROVED: 2, SUBMITTED: 2 }, 'Duyệt một phần'],
  ]) {
    const html = renderToStaticMarkup(React.createElement(Badge, { status, counts }))
    assert.ok(html.includes(label), label)
    assert.doesNotMatch(html, /tập dữ liệu đã duyệt|\d\/4/)
  }
})
