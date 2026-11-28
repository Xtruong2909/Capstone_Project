import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transformWithOxc } from 'vite'
import { isTrainTestExperiment } from '../src/features/scientist/utils/experimentPreset.js'

const read = (path) => fs.readFileSync(new URL('../src/' + path, import.meta.url), 'utf8')
const strip = (source) => source.replace(/import[\s\S]*?from\s+['"][^'"]+['"];?\r?\n/g, '')
  .replace(/^export default /gm, '').replace(/^export /gm, '')

function hookHarness(action) {
  const values = []
  let cursor = 0, effectKey, cleanup, scope = 'account-A', group = 'batch-A'
  const requests = []
  const context = vm.createContext({
    getScientistSession: () => ({ scope }), extractErrorMessage: (error) => error.message,
    dataScienceService: { selectBestOverall: (ids, splitId) => { requests.push({ ids, splitId }); return action() },
      compareExperiments: async () => ({ best_overall: { scope: 'compared_experiments' } }) },
    useCallback: (callback) => callback,
    useEffect: (effect, deps) => { if (deps[0] !== effectKey) { cleanup?.(); effectKey = deps[0]; cleanup = effect() } },
    useState: (initial) => {
      const key = cursor++
      if (!(key in values)) values[key] = initial
      return [values[key], (value) => { values[key] = typeof value === 'function' ? value(values[key]) : value }]
    },
    useRef: (initial) => { const key = cursor++; if (!(key in values)) values[key] = { current: initial }; return values[key] },
  })
  const source = read('hooks/useScienceWorkflow.js').split('export function useScienceExperimentComparison')[1]
  vm.runInContext('function useScienceExperimentComparison' + source, context)
  return { render: () => { cursor = 0; return context.useScienceExperimentComparison(group) }, requests,
    changeGroup: (value) => { group = value }, changeAccount: (value) => { scope = value }, unmount: () => cleanup?.() }
}

test('Best Overall sends the checked experiment IDs once and displays only a confirmed server result', async () => {
  let resolve
  const harness = hookHarness(() => new Promise((done) => { resolve = done }))
  const promise = harness.render().selectBestOverall(['exp-1', 'exp-3'], 'split-1')
  assert.equal(harness.render().isComparing, true)
  await harness.render().selectBestOverall(['exp-1', 'exp-3'], 'split-1')
  assert.deepEqual(JSON.parse(JSON.stringify(harness.requests)), [{ ids: ['exp-1', 'exp-3'], splitId: 'split-1' }])
  assert.equal(harness.render().comparisonData, null)
  resolve({ best_overall: { selected_experiment_id: 'winner', selection_saved: true } })
  await promise
  assert.equal(harness.render().comparisonData.best_overall.selected_experiment_id, 'winner')
  assert.equal(harness.render().isComparing, false)
  assert.equal(harness.render().resultMode, 'overall')
})

test('a failed selection clears stale success and exposes the API error', async () => {
  const harness = hookHarness(async () => { throw new Error('Test sets do not match') })
  await harness.render().compareExperiments(['one', 'two'])
  assert.ok(harness.render().comparisonData)
  await harness.render().selectBestOverall(['exp-1', 'exp-3'], 'split-1')
  assert.equal(harness.render().comparisonData, null)
  assert.equal(harness.render().compareError, 'Test sets do not match')
})

test('clearing selection, changing batch or changing account ignores a late selection response', async () => {
  for (const change of ['clear', 'batch', 'account']) {
    let resolve
    const harness = hookHarness(() => new Promise((done) => { resolve = done }))
    const pending = harness.render().selectBestOverall(['exp-1', 'exp-3'], 'split-1')
    if (change === 'clear') harness.render().clearComparison()
    if (change === 'batch') harness.changeGroup('batch-B')
    if (change === 'account') harness.changeAccount('account-B')
    harness.render()
    resolve({ private: 'old-response' })
    await pending
    assert.equal(harness.render().comparisonData, null)
    assert.equal(harness.render().isComparing, false)
  }
})

test('service sends exactly the selected IDs and split_id to the Best Overall API', async () => {
  const requests = []
  const context = vm.createContext({ apiClient: { post: async (...args) => { requests.push(args); return { data: { best_overall: {} } } } } })
  const source = strip(read('services/dataScienceService.js')).replace('import.meta.env.VITE_API_BASE_URL', 'undefined')
  vm.runInContext(source + '\nglobalThis.service = dataScienceService', context)
  await context.service.selectBestOverall(['exp-1', 'exp-3'], 'split-1')
  assert.equal(requests[0][0], '/model-training/experiments/best-overall')
  assert.equal(requests[0][1].split_id, 'split-1')
  assert.deepEqual(JSON.parse(JSON.stringify(requests[0][1].experiment_ids)), ['exp-1', 'exp-3'])
  assert.equal(requests[0][2].baseURL, 'http://localhost:8000/api')
})

export async function renderComparisonFixture(componentName = 'ExperimentComparePanel', resultMode = 'compare') {
  const component = strip(read(`features/scientist/components/${componentName}.jsx`))
  const { code } = await transformWithOxc(component, `${componentName}.jsx`, { jsx: { runtime: 'classic' } })
  const icon = () => React.createElement('span', { 'aria-hidden': true }, '◇')
  const context = vm.createContext({ React, useMemo: React.useMemo,
    GitCompareArrows: icon, Trophy: icon, ArrowLeft: icon, Loader2: icon,
    Eye: icon, PlusCircle: icon, Rocket: icon,
  })
  if (componentName === 'ExperimentComparePanel') {
    const child = await transformWithOxc(strip(read('features/scientist/components/BestOverallResult.jsx')),
      'BestOverallResult.jsx', { jsx: { runtime: 'classic' } })
    vm.runInContext(child.code, context)
  }
  vm.runInContext(code, context)
  const experiments = [[17.32, 23.5, 29], [17.42, 22.8, 30.5], [17.53, 24, 31]].map((values, index) => ({
    experiment_id: `exp-${index + 1}`, experiment_name: `Ex-0${index + 1}`, status: 'COMPLETED',
    split_id: 'same-split', dataset_file_id: 'same-file', forecast_horizons: [1, 3, 5],
    evaluation_mode: 'exploratory', evaluation_policy: 'same-policy',
    hyperparameters: { n_estimators: 100 * (index + 1), max_depth: 10 },
    performance_by_model_and_horizon: { RANDOM_FOREST: Object.fromEntries(values.map((rmse, i) => [String([1, 3, 5][i]), { rmse, mae: 12 + i }])) },
  }))
  const props = { experiments, selectedCompareIds: ['exp-1', 'exp-2'], resultMode,
    onUseForPrediction() {}, onSelectBestOverall() {},
    comparisonData: { forecast_horizons: [1, 3, 5], experiments: experiments.slice(0, 2),
      best_overall: { selected_experiment_id: 'exp-1', selected_model_ids: { 1: 'model-1', 3: 'model-3', 5: 'model-5' },
        average_rmse: (17.32 + 23.5 + 29) / 3, average_mae: 13, selection_saved: true,
        scope: 'compared_experiments', ranking: experiments.slice(0, 2).map((exp) => ({
          experiment_id: exp.experiment_id,
          experiment_name: exp.experiment_name,
          average_rmse: [1, 3, 5].reduce((sum, h) => sum + exp.performance_by_model_and_horizon.RANDOM_FOREST[h].rmse, 0) / 3,
          average_mae: 13, prediction_time_ms: 10,
        })),
      },
    },
  }
  return renderToStaticMarkup(React.createElement(context[componentName], componentName === 'BestOverallResult'
    ? { result: props.comparisonData, onUseForPrediction() {} } : props))
}

test('comparison only shows the selected experiments and horizon comparisons even when the API includes an overall score', async () => {
  const html = await renderComparisonFixture()
  assert.ok(html.includes('So sánh đã chọn (2)') && html.includes('RMSE +1'))
  assert.ok(html.includes('Best Overall (2)'))
  assert.ok(!html.includes('aria-label="Best Overall"') && !html.includes('BEST OVERALL'))
  assert.ok(!html.includes('Average Test RMSE') && !html.includes('Average Test MAE'))
  assert.equal((html.match(/<table/g) || []).length, 1)
})

test('the Best Overall result shows the API winner, scores, saved models and ranked rows', async () => {
  const html = await renderComparisonFixture('ExperimentComparePanel', 'overall')
  assert.ok(html.includes('BEST OVERALL') && html.includes('23.27'))
  assert.ok(html.includes('Average Test RMSE') && html.includes('Average Test MAE'))
  assert.ok(html.includes('Đã lưu lựa chọn thí nghiệm và 3 mô hình'))
  assert.ok(html.includes('Dùng Best Overall để dự báo'))
  assert.equal((html.match(/<table/g) || []).length, 1)
  assert.ok(html.includes('Bảng xếp hạng Best Overall'))
  assert.ok(html.includes('So sánh đã chọn (2)') && html.includes('Best Overall (2)'))
  assert.ok(!html.includes('RMSE thấp nhất · Horizon') && !html.includes('role="tablist"'))
  assert.ok(html.indexOf('So sánh đã chọn (2)') < html.indexOf('Best Overall (2)'), 'Best Overall must be to the right of Compare')
})

test('the page shares checkbox selection with Best Overall and has no tabs or separate Split picker', async () => {
  const { code } = await transformWithOxc(strip(read('features/scientist/pages/ScientistExperimentComparisonPage.jsx')),
    'ScientistExperimentComparisonPage.jsx', { jsx: { runtime: 'classic' } })
  let captured, sent
  const icon = () => null
  const context = vm.createContext({ React, useState: React.useState, useMemo: React.useMemo,
    useNavigate: () => () => {}, useParams: () => ({ groupId: 'batch' }),
    useApprovedGroups: () => ({ groups: [] }),
    useScienceExperiments: () => ({ experiments: ['exp-1', 'exp-2', 'exp-3'].map((id) => ({
      experiment_id: id, group_id: 'batch', split_id: 'split-1', status: 'COMPLETED',
    })), loading: false }),
    useScienceExperimentComparison: () => ({ compareExperiments: async (ids, mode, groupId) => { sent = { ids, mode, groupId } } }),
    useComparisonHistory: () => ({ rows: [], loading: false, opening: false, reload: async () => {} }),
    ComparisonHistoryPanel: () => null,
    ScientistBackLink: ({ children }) => React.createElement('a', null, children),
    ExperimentComparePanel: (props) => { captured = props; return React.createElement('p', null, 'Shared selection') },
    GitCompareArrows: icon, Layers3: icon, isTrainTestExperiment,
  })
  vm.runInContext(code, context)
  const html = renderToStaticMarkup(React.createElement(context.ScientistExperimentComparisonPage))
  assert.ok(!html.includes('role="tablist"') && !html.includes('<select'))
  await captured.onSelectBestOverall(['exp-1', 'exp-3'])
  assert.deepEqual(JSON.parse(JSON.stringify(sent)), { ids: ['exp-1', 'exp-3'], mode: 'overall', groupId: 'batch' })
})

