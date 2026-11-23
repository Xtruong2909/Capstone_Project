import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transformWithOxc } from 'vite'

const source = fs.readFileSync(new URL('../src/services/directS3UploadService.js', import.meta.url), 'utf8')
  .replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '')

function setup({ failOnce = false, failAlways = false, acceptedDespiteTimeout = false, bytes = 11 } = {}) {
  const calls = [], signedCalls = [], attempts = new Map(), progress = []
  let active = 0, maxActive = 0
  const apiClient = {
    async post(url, payload) {
      calls.push({ url, payload })
      if (url === '/datasets/direct-upload') return { data: {
        job_id: 'job', files: [{ file_id: 'file', part_size: 4 }],
      } }
      if (url.endsWith('/parts')) return { data: { parts: payload.part_numbers.map((number) => ({
        part_number: number, url: 'https://private-s3.invalid/' + number,
      })) } }
      if (url === '/datasets/direct-upload/job/complete') {
        if (acceptedDespiteTimeout) throw new Error('response lost')
        return { data: { job_id: 'job', status: 'QUEUED' } }
      }
      return { data: {} }
    },
    async get() { return { data: { job_id: 'job', status: acceptedDespiteTimeout ? 'QUEUED' : 'UPLOADING' } } },
    async delete(url) { calls.push({ url, method: 'DELETE' }) },
  }
  const s3Client = {
    async put(url, body, options) {
      const number = Number(url.split('/').at(-1))
      signedCalls.push({ url, options })
      attempts.set(number, (attempts.get(number) || 0) + 1)
      active += 1
      maxActive = Math.max(active, maxActive)
      try {
        await new Promise((resolve) => setTimeout(resolve, 2))
        if (failAlways || (failOnce && number === 1 && attempts.get(number) === 1)) throw new Error('network failure')
        options.onUploadProgress({ loaded: body.size })
        return { headers: { etag: 'etag-' + number } }
      } finally { active -= 1 }
    },
  }
  const context = vm.createContext({ axios: { create: (options) => {
    assert.equal(options.withCredentials, false)
    return s3Client
  }, isCancel: () => false }, apiClient, AbortController, setTimeout, Promise })
  vm.runInContext(source, context)
  const file = new Blob(['a'.repeat(bytes)])
  file.name = '20181024_d1_0830_0900.csv'
  return { run: () => context.uploadDirectToS3([file], { group_name: '  Demo  ' }, (event) => progress.push(event)),
    calls, signedCalls, attempts, progress, maxActive: () => maxActive }
}

test('uploads Blob parts directly without app JWT, reports bytes and completes in order', async () => {
  const flow = setup()
  assert.equal((await flow.run()).status, 'QUEUED')
  assert.equal(flow.maxActive(), 3)
  assert.equal(flow.calls[0].payload.group_name, 'Demo')
  assert.deepEqual(flow.signedCalls.map((call) => call.url), [1, 2, 3].map((n) => 'https://private-s3.invalid/' + n))
  for (const { options } of flow.signedCalls) assert.equal(options.headers.Authorization, undefined)
  const completion = flow.calls.find((call) => call.url.endsWith('/files/file/complete'))
  assert.deepEqual(Array.from(completion.payload.parts, (part) => part.part_number), [1, 2, 3])
  assert.equal(flow.progress.at(-1).loaded, 11)
  assert.equal(flow.progress.at(-1).phase, 'confirming')
  assert(!flow.calls.some((call) => call.method === 'DELETE'))
})

test('a failed part is retried without re-uploading successful parts', async () => {
  const flow = setup({ failOnce: true })
  await flow.run()
  assert.equal(flow.attempts.get(1), 2)
  assert.equal(flow.attempts.get(2), 1)
  assert.equal(flow.attempts.get(3), 1)
  const signing = flow.calls.filter((call) => call.url.endsWith('/parts'))
  assert.equal(signing.length, 2)
  assert.deepEqual(Array.from(signing[1].payload.part_numbers), [1])
})

test('large files use at most four concurrent transfers and share bounded URL batches', async () => {
  const flow = setup({ bytes: 133 })
  await flow.run()
  assert.equal(flow.maxActive(), 4)
  const signing = flow.calls.filter((call) => call.url.endsWith('/parts'))
  assert.deepEqual(signing.map((call) => call.payload.part_numbers.length), [16, 16, 2])
  const completion = flow.calls.find((call) => call.url.endsWith('/files/file/complete'))
  assert.deepEqual(Array.from(completion.payload.parts, (part) => part.part_number), Array.from({ length: 34 }, (_, i) => i + 1))
  assert.equal(flow.progress.at(-1).loaded, 133)
})

test('exhausted retries cancel outstanding requests and abort the multipart session', async () => {
  const flow = setup({ failAlways: true })
  await assert.rejects(flow.run(), /S3/)
  assert(flow.signedCalls.every((call) => call.options.signal.aborted))
  assert.equal(flow.calls.filter((call) => call.method === 'DELETE').length, 1)
  assert(!flow.calls.some((call) => call.url.endsWith('/files/file/complete')))
})

test('lost final response does not abort a batch already accepted by backend', async () => {
  const flow = setup({ acceptedDespiteTimeout: true })
  assert.equal((await flow.run()).status, 'QUEUED')
  assert(!flow.calls.some((call) => call.method === 'DELETE'))
})

const jobUiSource = fs.readFileSync(new URL('../src/features/engineer/components/EngineerUi.jsx', import.meta.url), 'utf8')
  .replace(/^import .*\r?\n/gm, '').replace(/^export \{.*\} from .*\r?\n/gm, '').replace(/^export /gm, '')
const jobUi = await transformWithOxc(jobUiSource, 'EngineerUi.jsx', { jsx: { runtime: 'classic' } })
function renderJob(job) {
  const context = vm.createContext({ React, useLanguage: () => ({ t: (value) => value }),
    AdminState: ({ children }) => children, AdminBadge: ({ value }) => React.createElement('span', null, value) })
  vm.runInContext(jobUi.code, context)
  return renderToStaticMarkup(React.createElement(context.EngineerJob, { resource: { data: job } }))
}

test('after direct transfer, the job only registers files already on S3', () => {
  const html = renderJob({ status: 'RUNNING', stage: 'SAVING', total_files: 5, processed_files: 0 })
  assert(html.includes('Saving dataset information'))
  assert(html.includes('Files are on S3.'))
  assert(html.includes('Files registered'))
  assert(!html.includes('Checking CSV'))
  assert(!html.includes('Verify files on S3'))
  assert(!html.includes('Upload Dataset'))
})

test('saving and completed stages use their actual purpose', () => {
  const saving = renderJob({ status: 'RUNNING', stage: 'SAVING', total_files: 5, processed_files: 5 })
  assert(saving.includes('Saving dataset information'))
  assert(!saving.includes('Upload Dataset'))
  const completed = renderJob({ status: 'COMPLETED', stage: 'DONE', total_files: 5, processed_files: 5 })
  assert(completed.includes('Upload Results'))
  assert(!completed.includes('Checking CSV'))
})

test('normalization job retains its operation and dataset progress', () => {
  const html = renderJob({ status: 'RUNNING', operation: 'NORMALIZE', total_datasets: 4, processed_datasets: 2 })
  assert(html.includes('NORMALIZE'))
  assert(html.includes('2 / 4'))
  assert(!html.includes('Files are already on S3.'))
})
