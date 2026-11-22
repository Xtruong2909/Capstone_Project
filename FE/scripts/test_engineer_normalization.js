import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transformWithOxc } from 'vite'

const source = (path) => fs.readFileSync(new URL('../src/' + path, import.meta.url), 'utf8')
  .replace(/^import .*\r?\n/gm, '').replace(/^export default /gm, '').replace(/^export /gm, '')
const hookContext = vm.createContext({})
vm.runInContext(source('hooks/useEngineerNormalization.js'), hookContext)
const build = hookContext.buildNormalizationOverview
const files = [
  { dataset_id: 'A', dataset_name: '20181024-d9', source_session_count: 5, group_name: 'Batch thực tế' },
  { dataset_id: 'B', dataset_name: '20181025-d9', source_session_count: 3, group_name: 'Batch thực tế' },
]
const mapping = { dataset_count: 2, session_count: 8, columns: [{ source_column: 'track_id' }],
  mappings: [{ source_column: 'track_id', target_column: 'vehicle_id' }] }

test('initial batch shows API counts and unknown results, never invented zeros', () => {
  const data = build(files, mapping)
  assert.equal(data.total, 2)
  assert.equal(data.sessionCount, 8)
  assert.equal(data.completed, 0)
  assert.equal(data.rows[0].sessions, 5)
  assert.equal(data.rows[0].before, null)
  assert.equal(data.rows[0].after, null)
  assert.equal(data.rows[0].canPreview, false)
})

const normalization = { job_id: 'job', operation: 'NORMALIZE', status: 'RUNNING', results: [
  { dataset_id: 'A', dataset_name: '20181024-d9', status: 'COMPLETED', session_count: 5, records_before: 2, records_after: 15 },
  { dataset_id: 'B', dataset_name: '20181025-d9', status: 'RUNNING', session_count: 0 },
] }
test('progress counts completed and failed datasets separately and exposes only completed previews', () => {
  const data = build(files, mapping, normalization)
  assert.equal(data.running, true)
  assert.equal(data.completed, 1)
  assert.equal(data.rows[0].canPreview, true)
  assert.equal(data.rows[1].canPreview, false)
  assert.equal(data.rows[1].sessions, 3)
  assert.equal(data.rows[1].after, null)
  const failure = build(files, mapping, { ...normalization, status: 'PARTIAL_SUCCESS', results: [
    normalization.results[0], { ...normalization.results[1], status: 'FAILED', error_message: 'Tệp CSV rỗng' },
  ] })
  assert.equal(failure.completed, 1)
  assert.equal(failure.failed, 1)
  assert.equal(failure.rows[1].error, 'Tệp CSV rỗng')
})

test('returning after export uses report counts while export failures do not claim normalization failed', () => {
  const data = build(files, mapping, { ...normalization, operation: 'EXPORT', status: 'FAILED',
    results: normalization.results.map((row) => ({ ...row, status: 'FAILED' })),
  }, { reports: [{ dataset_id: 'A', records_before: 2, records_after: 15 }] })
  assert.equal(data.completed, 2)
  assert.equal(data.failed, 0)
  assert.equal(data.rows[0].before, null)
  assert.equal(data.rows[0].canPreview, false)
  const completed = build(files, mapping, { ...normalization, operation: 'EXPORT' },
    { reports: [{ dataset_id: 'A', records_before: 2, records_after: 15 }] })
  assert.equal(completed.rows[0].before, 2)
  assert.equal(completed.rows[0].after, 15)
})

test('a new normalization never displays counts from an older export report', () => {
  const staleReport = { reports: [{ dataset_id: 'A', records_before: 999, records_after: 99999 }] }
  const data = build(files, mapping, normalization, staleReport)
  assert.equal(data.rows[0].before, 2)
  assert.equal(data.rows[0].after, 15)
  const initial = build(files, mapping, undefined, staleReport)
  assert.equal(initial.rows[0].before, null)
  assert.equal(initial.rows[0].after, null)
})

const output = { dataset_name: '20181024-d9', is_pneuma: true, records_before: 2, records_after: 15,
  preview: { columns: [{ name: 'vehicle_id', type: 'integer' }, { name: 'timestamp', type: 'float' }],
    rows: [{ vehicle_id: 42, timestamp: 0.04 }] },
}
const component = await transformWithOxc(source('features/engineer/components/EngineerNormalizationPanel.jsx'),
  'EngineerNormalizationPanel.jsx', { jsx: { runtime: 'classic' } })

function render(job, preview = {}, props = {}) {
  const data = build(files, mapping, job)
  const context = vm.createContext({ React, useEngineerNormalization: () => ({ ...data,
    ready: data.rows.filter((row) => row.canPreview), datasetId: 'A', preview,
  }), ArrowRight: () => null, CheckCircle2: () => null, Loader2: () => null,
  EngineerBadge: ({ value }) => React.createElement('span', null, value),
  })
  vm.runInContext(component.code, context)
  return renderToStaticMarkup(React.createElement(context.EngineerNormalizationPanel, {
    groupId: 'batch', workflow: { mapping: { resource: { data: mapping } }, job: { data: job },
      dataset_files: {}, ...props },
  }))
}

test('initial and running screens explain real transformations and show source-to-target mappings', () => {
  const initial = render()
  for (const value of ['Batch thực tế', 'Đọc tệp nguồn', 'Chuyển đổi cấu trúc', 'vehicle_id', 'Chưa bắt đầu', 'Chờ kết quả']) {
    assert.ok(initial.includes(value), value)
  }
  const running = render(normalization, { loading: true })
  assert.ok(running.includes('Đã xử lý 1 / 2'))
  assert.ok(running.includes('Đang xử lý: 20181025-d9'))
  assert.ok(running.includes('Đang tải dữ liệu đã chuẩn hóa'))
})

test('completed preview shows exact API columns, types and real values with pNEUMA units', () => {
  const html = render(normalization, { data: output })
  for (const value of ['vehicle_id', 'timestamp', 'Số nguyên', 'Số thực', '42', '0.04', 'Dòng phương tiện đầu vào', 'Điểm quỹ đạo đầu ra']) {
    assert.ok(html.includes(value), value)
  }
  assert.ok(!html.includes('Tỷ lệ loại bỏ'))
  const generic = render(normalization, { data: { ...output, is_pneuma: false } })
  assert.ok(!generic.includes('Điểm quỹ đạo đầu ra'))
})

test('preview failure stays visible with retry and does not show stale sample rows', () => {
  const html = render(normalization, { error: 'Kết quả không còn khả dụng' })
  assert.ok(html.includes('Kết quả không còn khả dụng') && html.includes('Thử lại'))
  assert.ok(!html.includes('timestamp'))
})
