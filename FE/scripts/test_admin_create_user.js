import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const read = (path) => fs.readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8').replaceAll('\r\n', '\n')
const stripImports = (source) => source.replace(/^import .*\n/gm, '')

// Exercise the actual service without creating an account or sending an email.
const requests = []
const serviceContext = vm.createContext({
  apiClient: { post: async (url, payload) => { requests.push({ url, payload }); return { data: { id: 'created-user' } } } },
})
vm.runInContext(stripImports(read('../src/services/adminService.js')).replace('export const adminService =', 'globalThis.adminService ='), serviceContext)
await serviceContext.adminService.createUser({
  full_name: '  Nguyen Van A  ', email: '  user@example.com  ', role_id: 'data_engineer', password: 'must-not-be-sent',
})
assert.equal(requests[0].url, '/admin/users')
assert.deepEqual(JSON.parse(JSON.stringify(requests[0].payload)), {
  full_name: 'Nguyen Van A', email: 'user@example.com', role_id: 'data_engineer',
})

const roles = ['admin', 'data_engineer', 'data_scientist', 'business_user'].map((id) => ({ id }))
function harness(createUser) {
  const slots = new Map()
  const created = []
  let cursor = 0
  const scope = vm.createContext({
    adminService: { createUser },
    useState(initial) {
      const key = cursor++
      if (!slots.has(key)) slots.set(key, initial)
      return [slots.get(key), (value) => slots.set(key, typeof value === 'function' ? value(slots.get(key)) : value)]
    },
    useRef(initial) {
      const key = cursor++
      if (!slots.has(key)) slots.set(key, { current: initial })
      return slots.get(key)
    },
  })
  vm.runInContext(stripImports(read('../src/hooks/useAdminData.js')).replace(/^export /gm, ''), scope)
  vm.runInContext(stripImports(read('../src/hooks/useAdminCreateUser.js')).replace('export function useAdminCreateUser', 'function useAdminCreateUser'), scope)
  return {
    created,
    render() { cursor = 0; return scope.useAdminCreateUser(roles, (user) => created.push(user)) },
  }
}

const event = { preventDefault() {} }
const populate = (state) => {
  state.updateField('full_name', '  Nguyen Van A  ')
  state.updateField('email', '  user@example.com  ')
}

// Invalid input never reaches the API, including a manipulated Admin role.
let attempted = 0
const validation = harness(async () => { attempted++; return {} })
await validation.render().submit(event)
assert.equal(attempted, 0)
assert.ok(validation.render().error)
populate(validation.render())
validation.render().updateField('role_id', 'admin')
await validation.render().submit(event)
assert.equal(attempted, 0)
assert.ok(validation.render().availableRoles.every((role) => role.id !== 'admin'))

// A repeated submit while email delivery is pending must create only one account.
let finish
const pendingCalls = []
const pending = harness((payload) => { pendingCalls.push(payload); return new Promise((resolve) => { finish = resolve }) })
populate(pending.render())
const first = pending.render().submit(event)
await pending.render().submit(event)
assert.equal(pendingCalls.length, 1)
assert.equal(pending.render().submitting, true)
assert.equal(pending.created.length, 0)
pending.render().updateField('email', 'changed@example.com')
assert.equal(pending.render().form.email.trim(), 'user@example.com')
const newUser = { id: 'created-user', full_name: 'Nguyen Van A', email: 'user@example.com', role_id: 'data_engineer' }
finish(newUser)
await first
assert.equal(pending.render().submitting, false)
assert.deepEqual(pending.created, [newUser])

// Email errors preserve the draft, produce no success, and allow an explicit retry.
let fail = true
const retry = harness(async () => {
  if (fail) throw { response: { status: 503, data: { detail: 'Email unavailable. Account not created.' } } }
  return newUser
})
populate(retry.render())
await retry.render().submit(event)
assert.equal(retry.render().error, 'Email unavailable. Account not created.')
assert.equal(retry.render().form.email.trim(), 'user@example.com')
assert.equal(retry.render().submitting, false)
assert.equal(retry.created.length, 0)
fail = false
await retry.render().submit(event)
assert.deepEqual(retry.created, [newUser])
assert.equal(retry.render().error, '')

console.log('PASS create-user payload, validation, duplicate-submit guard, email failure and retry')
