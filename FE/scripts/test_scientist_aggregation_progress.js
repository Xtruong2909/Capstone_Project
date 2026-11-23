import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transformWithOxc } from 'vite'

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
const { code } = await transformWithOxc(
  read('features/scientist/components/ScientistAggregationProgress.jsx').replace('export default ', ''),
  'ScientistAggregationProgress.jsx', { jsx: { runtime: 'classic' } },
)
const componentContext = vm.createContext({ React })
vm.runInContext(code, componentContext)
const render = (props) => renderToStaticMarkup(React.createElement(componentContext.ScientistAggregationProgress, props))

test('shows an animated bar immediately while the start API is pending, without stale completion', () => {
  const html = render({ starting: true, aggregation: { status: 'COMPLETED', total_sessions: 20, completed_sessions: 20 } })
  assert.match(html, /sci-aggregation-progress--indeterminate/)
  assert.match(html, /Đang khởi tạo tổng hợp/)
  assert.doesNotMatch(html, /value=|100%|20\/20/)
  assert.equal(render({}), '')
})

test('uses actual session counters and identifies the running source file', () => {
  const html = render({
    aggregation: { status: 'PROCESSING', total_sessions: 20, completed_sessions: 5, sessions: [{ session_id: 's1', status: 'RUNNING' }] },
    sessionsById: { s1: { original_filename: '20181024_d3_0830_0900.csv' } },
  })
  assert.match(html, /5\/20 phiên hoàn tất/)
  assert.match(html, /25% đã xử lý/)
  assert.match(html, /max="20" value="5"/)
  assert.match(html, /20181024_d3_0830_0900.csv/)
})

test('reports failures separately and displays final completion', () => {
  const partial = render({ aggregation: { status: 'PARTIAL_SUCCESS', total_sessions: 4, completed_sessions: 3, failed_sessions: 1 } })
  assert.match(partial, /3\/4 phiên hoàn tất/)
  assert.match(partial, /1 phiên xử lý lỗi/)
  assert.doesNotMatch(partial, /Đã tổng hợp xong/)
  const done = render({ aggregation: { status: 'COMPLETED', total_sessions: 4, completed_sessions: 4 } })
  assert.match(done, /100% đã xử lý/)
  assert.match(done, /Đã tổng hợp xong dữ liệu theo phút/)
})

function mount(startAggregation) {
  const slots = []
  let cursor = 0
  const context = vm.createContext({
    scientistWorkflowKey: (id) => id, readScientistWorkflow: () => ({}), writeScientistWorkflow: () => {},
    dataScienceService: { startAggregation }, extractErrorMessage: (err) => err.message,
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = initial
      return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }]
    },
    useRef(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = { current: initial }
      return slots[index]
    },
    useEffect: () => {}, useCallback: (callback) => callback,
  })
  vm.runInContext(read('hooks/useScienceWorkflow.js').replace(/^import .*$/gm, '').replace(/^export /gm, ''), context)
  return () => { cursor = 0; return context.useScienceTraining('batch') }
}

test('keeps the starting flag until API returns and prevents duplicate submissions', async () => {
  let finish
  let calls = 0
  const readHook = mount(() => { calls += 1; return new Promise((resolve) => { finish = resolve }) })
  const request = readHook().startAggregation()
  assert.equal(readHook().startingAggregation, true)
  await readHook().startAggregation()
  assert.equal(calls, 1)
  finish({ aggregation_id: 'a1', status: 'PROCESSING', total_sessions: 20 })
  await request
  assert.equal(readHook().startingAggregation, false)
  assert.equal(readHook().workflow.aggregation.aggregation_id, 'a1')
  assert.equal(readHook().busy, false)
})

test('clears starting on API failure and shows the error so a retry is possible', async () => {
  const readHook = mount(async () => { throw new Error('S3 unavailable') })
  await readHook().startAggregation()
  assert.equal(readHook().startingAggregation, false)
  assert.equal(readHook().busy, false)
  assert.equal(readHook().error, 'S3 unavailable')
})
