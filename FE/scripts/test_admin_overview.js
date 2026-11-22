import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'

const source = fs.readFileSync(new URL('../src/services/adminService.js', import.meta.url), 'utf8')
  .replace(/^import .*\r?\n/gm, '')
  .replace('export const adminService =', 'globalThis.adminService =')

function harness(failedPaths = []) {
  const requests = []
  const context = vm.createContext({
    localStorage: { getItem: () => null, setItem() {} },
    apiClient: {
      defaults: { baseURL: '/api/v1' },
      async get(url, options) {
        requests.push({ url, options })
        if (failedPaths.includes(url)) throw new Error(`Request failed: ${url}`)
        const responses = {
          '/admin/stats': { total_users: 2 },
          '/health/db': { status: 'connected' },
          '/admin/users': [{ id: 'user' }],
          '/admin/datasets': [{ id: 'dataset', approval_status: 'APPROVED' }],
          '/admin/datasets/groups': [{ group_id: 'batch', submitted_datasets: 2, total_datasets: 3 }],
          '/admin/experiments/overview': { stats: {}, experiments: [] },
          '/admin/portal/access-grants': { items: [{ id: 'grant', dataset_id: 'dataset', user_id: 'user' }], total: 1 },
        }
        assert.ok(Object.hasOwn(responses, url), `Unexpected API route: ${url}`)
        return { data: responses[url] }
      },
    },
  })
  vm.runInContext(source, context)
  return { service: context.adminService, requests }
}

test('overview reads the existing paged grants API and has no warning when all requests succeed', async () => {
  const { service, requests } = harness()
  const controller = new AbortController()
  const result = await service.getOverviewData({}, controller.signal)
  assert.equal(result.partialWarning, null)
  assert.equal(result.accessGrants[0].id, 'grant')
  assert.equal(requests.length, 7)
  assert.equal(result.reviewGroups[0].group_id, 'batch')
  assert.equal(result.reviewGroupsError, false)
  const grants = requests.find(({ url }) => url === '/admin/portal/access-grants')
  assert.deepEqual(JSON.parse(JSON.stringify(grants.options.params)), { page: 1, page_size: 50 })
  assert.ok(requests.every(({ options }) => options.signal === controller.signal))
})

test('a real grants failure still warns and retains the other overview data', async () => {
  const { service } = harness(['/admin/portal/access-grants'])
  const result = await service.getOverviewData({})
  assert.ok(result.partialWarning)
  assert.equal(result.accessGrants.length, 0)
  assert.equal(result.stats.total_users, 2)
  assert.equal(result.users.length, 1)
  assert.equal(result.dbStatus.status, 'connected')
})

test('an unavailable overview reports the failure instead of a successful empty dashboard', async () => {
  const { service } = harness([
    '/admin/stats', '/health/db', '/admin/users', '/admin/datasets',
    '/admin/experiments/overview', '/admin/portal/access-grants',
    '/admin/datasets/groups',
  ])
  await assert.rejects(service.getOverviewData({}), /Request failed: \/admin\/stats/)
})
