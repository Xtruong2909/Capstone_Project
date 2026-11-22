import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transformWithOxc } from 'vite'
import { translateText } from '../src/services/languageService.js'

const context = vm.createContext({})
vm.runInContext(fs.readFileSync(new URL('../src/hooks/useEngineerOverview.js', import.meta.url), 'utf8')
  .replace(/^import .*\r?\n/gm, '').replace(/^export /gm, ''), context)
const overview = context.buildEngineerOverview
const dataset_file = (dataset_id, file_id, created_at, approval_status, size = 10) => ({
  dataset_id, file_id, created_at, approval_status, file_size_bytes: size,
})

test('overview counts each dataset once, chooses latest API dataset_file and retains all storage bytes', () => {
  const rows = [
    dataset_file('A', 'a-raw', '2026-11-01', 'PENDING'),
    dataset_file('A', 'a-export', '2026-11-03', 'APPROVED', 20),
    dataset_file('B', 'b-old', '2026-11-02', 'APPROVED'),
    dataset_file('B', 'b-new', '2026-11-04', 'SUBMITTED'),
    dataset_file('C', 'c-new', '2026-11-05', 'PENDING'),
    dataset_file('D', 'd-new', '2026-11-06', 'REJECTED'),
  ]
  const result = overview(rows)
  assert.equal(result.totalDatasetsCount, 4)
  assert.equal(result.approvedCount, 1)
  assert.equal(result.pendingCount, 1)
  assert.equal(result.draftCount, 1)
  assert.equal(result.rejectedCount, 1)
  assert.equal(result.approvalRatePct, 25)
  assert.equal(result.totalStorageBytes, 70)
  assert.equal(result.datasets.find((item) => item.dataset_id === 'A').file_id, 'a-export')
  assert.equal(result.recentDatasets[0].dataset_id, 'D')
  assert.equal(rows[0].file_id, 'a-raw')
})

test('twenty datasets with three dataset_files show twenty datasets, not sixty, and six distinct recent rows', () => {
  const rows = Array.from({ length: 20 }, (_, i) => [
    dataset_file(`data-${i}`, `raw-${i}`, '2026-11-01', 'PENDING'),
    dataset_file(`data-${i}`, `clean-${i}`, '2026-11-02', 'PENDING'),
    dataset_file(`data-${i}`, `export-${i}`, '2026-11-03', 'APPROVED'),
  ]).flat()
  const result = overview(rows)
  assert.equal(result.totalDatasetsCount, 20)
  assert.equal(result.approvedCount, 20)
  assert.equal(result.approvalRatePct, 100)
  assert.equal(result.pendingCount, 0)
  assert.equal(result.recentDatasets.length, 6)
  assert.equal(new Set(result.recentDatasets.map((item) => item.dataset_id)).size, 6)
})

test('empty catalog has zero statistics; duplicate API rows use timestamps and stable IDs', () => {
  const empty = overview([])
  assert.equal(empty.approvalRatePct, 0)
  assert.equal(empty.totalDatasetsCount, 0)
  const result = overview([
    { ...dataset_file('A', 'z-old', '2026-11-01', 'PENDING'), file_number: 1 },
    { ...dataset_file('A', 'a-new', '2026-11-01', 'APPROVED'), file_number: 2 },
  ])
  assert.equal(result.datasets[0].file_id, 'z-old')
})

test('recent batches use API group IDs, contain all datasets and sum only their latest dataset_files', () => {
  const rows = [
    { ...dataset_file('A', 'a-old', '2026-11-01', 'PENDING'), group_id: 'batch-1', group_name: 'Batch 01', total_records: 999 },
    { ...dataset_file('A', 'a-new', '2026-11-05', 'APPROVED'), group_id: 'batch-1', group_name: 'Batch 01', total_records: 120 },
    { ...dataset_file('B', 'b-new', '2026-11-04', 'SUBMITTED'), group_id: 'batch-1', group_name: 'Batch 01', total_records: 30 },
    { ...dataset_file('C', 'c-new', '2026-11-03', 'APPROVED'), group_id: 'batch-2', group_name: 'Batch 01', total_records: 50 },
    { ...dataset_file('D', 'd-new', '2026-11-02', 'PENDING'), total_records: 10 },
  ]
  const { recentBatches } = overview(rows)
  assert.equal(recentBatches.length, 3)
  assert.equal(recentBatches[0].group_id, 'batch-1')
  assert.equal(recentBatches[0].datasetCount, 2)
  assert.equal(recentBatches[0].totalRecords, 150)
  assert.equal(recentBatches[0].approval_status, 'MIXED')
  assert.equal(recentBatches[1].group_id, 'batch-2')
  assert.equal(recentBatches[1].approval_status, 'APPROVED')
  assert.equal(recentBatches[2].group_id, null)
})

test('limiting recent batches does not truncate their child datasets to six rows', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({
    ...dataset_file(`dataset-${i}`, `dataset_file-${i}`, '2026-11-05', 'APPROVED'),
    group_id: 'batch', group_name: 'One batch', total_records: 100,
  }))
  const { recentBatches } = overview(rows)
  assert.equal(recentBatches.length, 1)
  assert.equal(recentBatches[0].datasets.length, 10)
  assert.equal(recentBatches[0].totalRecords, 1000)
})

test('batch table starts collapsed and expanding shows only the selected batch datasets', async () => {
  const source = fs.readFileSync(new URL('../src/features/engineer/components/EngineerRecentBatches.jsx', import.meta.url), 'utf8')
    .replace(/^import .*\r?\n/gm, '').replace(/^export default /gm, '')
  const result = await transformWithOxc(source, 'EngineerRecentBatches.jsx', { jsx: { runtime: 'classic' } })
  const context = vm.createContext({ React, Fragment: React.Fragment,
    useLanguage: () => ({ t: (key) => translateText(key, 'vi') }),
    DatasetStatusBadge: ({ status }) => React.createElement('span', null, status),
    ChevronDown: () => null, ChevronRight: () => null, Eye: () => null, Info: () => null, Workflow: () => null,
  })
  vm.runInContext(result.code, context)
  const { recentBatches } = overview([
    { ...dataset_file('A', 'va', '2026-11-05', 'APPROVED'), name: 'Dataset Alpha', group_id: 'first', group_name: 'Batch First', total_records: 120 },
    { ...dataset_file('B', 'vb', '2026-11-04', 'APPROVED'), name: 'Dataset Beta', group_id: 'second', group_name: 'Batch Second', total_records: 130 },
  ])
  const render = (expandedBatchKey) => renderToStaticMarkup(React.createElement(context.EngineerRecentBatches, { batches: recentBatches, expandedBatchKey }))
  const collapsed = render(null)
  assert.ok(collapsed.includes('Batch First') && collapsed.includes('Batch Second'))
  assert.ok(!collapsed.includes('Dataset Alpha') && !collapsed.includes('Dataset Beta'))
  assert.ok(collapsed.includes('aria-expanded="false"'))
  const expanded = render('first')
  assert.ok(expanded.includes('Dataset Alpha'))
  assert.ok(!expanded.includes('Dataset Beta'))
  assert.ok(expanded.includes('aria-expanded="true"'))
})

test('detail shows the API dataset_file, original recordings and Vietnamese labels without invented metadata', async () => {
  const source = fs.readFileSync(new URL('../src/features/engineer/components/DatasetDetailModal.jsx', import.meta.url), 'utf8')
    .replace(/^import .*\r?\n/gm, '').replace(/^export default /gm, '').replace(/^export /gm, '')
  const result = await transformWithOxc(source, 'DatasetDetailModal.jsx', { jsx: { runtime: 'classic' } })
  const context = vm.createContext({ React, useEffect: () => {}, useNavigate: () => () => {},
    useLanguage: () => ({ t: (key) => translateText(key, 'vi') }),
    useEngineerDatasetReview: () => ({}),
    useEngineerDatasetDetail: () => ({ data: {
      dataset_id: 'A', file_id: 'current-api-file', name: 'API dataset',
      filename: 'api-export.parquet', file_format: 'PARQUET', file_size_bytes: 15,
      total_records: 0, total_records_known: true, approval_status: 'PENDING',
      source_sessions: [{ session_id: 'recording', original_filename: 'actual-recording.csv' }],
    } }), formatBytes: (bytes) => `${bytes} B`,
    X: () => null, Eye: () => null, Workflow: () => null, Send: () => null,
  })
  vm.runInContext(result.code, context)
  const html = renderToStaticMarkup(React.createElement(context.DatasetDetailModal, {
    item: { dataset_id: 'A', file_id: 'api-dataset_file', name: 'API dataset', file_tag: 'v3-api',
      filename: 'api-export.parquet', file_format: 'PARQUET', file_size_bytes: 15,
      total_records: 0, approval_status: 'PENDING',
      source_sessions: [{ session_id: 'recording', original_filename: 'actual-recording.csv' }],
    },
    fileLineageMap: { A: { customFileTag: 'stale-browser-dataset_file' } },
    recordCountsMap: { A: 999 },
  }))
  for (const value of ['api-export.parquet', 'actual-recording.csv',
    'Thông tin tập dữ liệu và phê duyệt', 'Chưa gửi duyệt', 'Mở quy trình xử lý', 'Đóng']) {
    assert.ok(html.includes(value), value)
  }
  for (const value of ['v3-api', 'stale-browser-dataset_file', '999', 'DATASET_A', 'Athens', 'Drone Swarm', 'Administrator Review Note']) {
    assert.ok(!html.includes(value), value)
  }
  assert.ok(!html.includes('Tổng số bản ghi'))
})

test('detail handles uncounted multi-session uploads, API errors and loading without stale metadata', async () => {
  const source = fs.readFileSync(new URL('../src/features/engineer/components/DatasetDetailModal.jsx', import.meta.url), 'utf8')
    .replace(/^import .*\r?\n/gm, '').replace(/^export default /gm, '').replace(/^export /gm, '')
  const result = await transformWithOxc(source, 'DatasetDetailModal.jsx', { jsx: { runtime: 'classic' } })
  let resource = { data: { dataset_id: 'A', file_id: 'live', name: 'Live upload',
    file_format: 'CSV', file_size_bytes: 100, total_records: 0, total_records_known: false,
    source_session_count: 5, source_sessions: [], approval_status: 'SUBMITTED', approval_note: 'Submission comment',
  } }
  const context = vm.createContext({ React, useEffect: () => {}, useNavigate: () => () => {},
    useLanguage: () => ({ t: (key) => translateText(key, 'vi') }),
    useEngineerDatasetReview: () => ({}), useEngineerDatasetDetail: () => resource,
    formatBytes: (bytes) => `${bytes} B`,
    X: () => null, Eye: () => null, Workflow: () => null, Send: () => null,
  })
  vm.runInContext(result.code, context)
  const render = () => renderToStaticMarkup(React.createElement(context.DatasetDetailModal, {
    item: { dataset_id: 'A', file_id: 'stale', name: 'Old snapshot', approval_status: 'APPROVED' },
  }))
  let html = render()
  assert.ok(html.includes('5 tệp ghi hình gốc'))
  assert.ok(!html.includes('Tổng số bản ghi') && !html.includes('Chưa thống kê'))
  assert.ok(html.includes('Chờ phê duyệt'))
  assert.ok(!html.includes('Old snapshot') && !html.includes('Submission comment'))
  resource = { loading: true }
  html = render()
  assert.ok(html.includes('Đang tải thông tin tập dữ liệu'))
  assert.ok(!html.includes('Live upload') && !html.includes('Old snapshot'))
  resource = { error: 'Không có quyền truy cập', data: null }
  html = render()
  assert.ok(html.includes('Không có quyền truy cập') && html.includes('Thử lại'))
  assert.ok(!html.includes('Live upload'))
})
