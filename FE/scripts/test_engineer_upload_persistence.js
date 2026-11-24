import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transformWithOxc } from 'vite'

const read = (path) => fs.readFileSync(new URL('../src/' + path, import.meta.url), 'utf8')
  .replace(/^import .*\r?\n/gm, '').replace(/^export default /gm, '').replace(/^export /gm, '')
const file = { name: '20181024_d1_0830_0900.csv', size: 100 }
const event = { preventDefault() {} }

function session() {
  const slots = [], effects = [], listeners = new Map(), calls = [], tracked = []
  let cursor = 0, resolve, reject, report, descriptor = null
  const state = (initial) => {
    const index = cursor++
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
    return [slots[index], (next) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next }]
  }
  const context = vm.createContext({
    useState: state,
    useRef: (initial) => {
      const index = cursor++
      return slots[index] ??= { current: initial }
    },
    useMemo: (fn) => fn(), useLanguage: () => ({ t: (value) => value }),
    useEffect: (fn, deps) => {
      const index = cursor++
      const previous = slots[index]
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
        effects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: fn() } })
      }
    },
    window: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name) },
    MAX_UPLOAD_SIZE_BYTES: 5 * 1024 ** 3 / 2,
    useEngineerMutation: () => {
      const [busy, setBusy] = state(false), [error, setError] = state('')
      return { busy, error, clear: () => setError(''),
        run: async (action) => {
          setBusy(true); setError('')
          try { await action(); return true }
          catch (error) { setError(error.message); return false }
          finally { setBusy(false) }
        } }
    },
    useEngineerJob: () => ({ running: Boolean(descriptor), data: null,
      track: (value) => { descriptor = value; tracked.push(value) } }),
    engineerService: { upload: (payload, progress) => {
      calls.push(payload); report = progress
      return new Promise((yes, no) => { resolve = yes; reject = no })
    } },
  })
  vm.runInContext(read('hooks/useEngineerUploadState.js'), context)
  return { calls, tracked, listeners,
    render() {
      cursor = 0
      const value = context.useEngineerUploadState()
      effects.splice(0).forEach((effect) => effect())
      return value
    },
    report: (value) => report(value), finish: (value) => resolve(value), fail: (error) => reject(error),
    dispose: () => slots.forEach((slot) => slot?.cleanup?.()),
  }
}

test('leaving the upload route keeps File objects, metadata and live progress without duplicate requests', async () => {
  const upload = session()
  upload.render().handleSelectFiles([file])
  upload.render().setMetadata({ group_name: 'My batch', source: 'pneuma', location_name: 'Athens', description: 'Notes' })
  const transfer = upload.render().handleUploadSubmit(event)
  assert.equal(upload.render().busy, true)
  assert(upload.listeners.has('beforeunload'))
  // The page has left the route; only the workspace owns this session now.
  upload.report({ loaded: 47, total: 100, phase: 's3' })
  const returningPage = upload.render()
  assert.equal(returningPage.files[0], file)
  assert.equal(returningPage.metadata.group_name, 'My batch')
  assert.equal(returningPage.progress, 47)
  assert.equal(returningPage.uploadPhase, 's3')
  assert.equal(returningPage.busy, true)
  await returningPage.handleUploadSubmit(event)
  returningPage.reset()
  returningPage.handleClearAllFiles()
  assert.equal(upload.calls.length, 1)
  assert.equal(upload.render().files[0], file)
  upload.finish({ uploaded_count: 1, failed_count: 0, files: [] })
  await transfer
  assert.equal(upload.render().finalResult.uploaded_count, 1)
  assert.equal(upload.render().busy, false)
  assert.equal(upload.render().files.length, 0)
  assert(!upload.listeners.has('beforeunload'))
})

test('backend registration is tracked even when its response arrives while the upload page is away', async () => {
  const upload = session()
  upload.render().handleSelectFiles([file])
  const transfer = upload.render().handleUploadSubmit(event)
  upload.report({ loaded: 100, total: 100, phase: 'confirming' })
  upload.finish({ job_id: 'registration-job', status: 'QUEUED' })
  await transfer
  assert.equal(upload.render().job.running, true)
  assert.equal(upload.tracked.at(-1).job_id, 'registration-job')
  assert.equal(upload.calls.length, 1)
  upload.dispose()
})

test('upload failure preserves selected files and metadata for retry after returning', async () => {
  const upload = session()
  upload.render().handleSelectFiles([file])
  upload.render().setMetadata({ group_name: 'Retry me' })
  const transfer = upload.render().handleUploadSubmit(event)
  upload.fail(new Error('Connection lost'))
  await transfer
  const page = upload.render()
  assert.equal(page.files[0], file)
  assert.equal(page.metadata.group_name, 'Retry me')
  assert.equal(page.mutation.error, 'Connection lost')
  assert.equal(page.busy, false)
  assert(!upload.listeners.has('beforeunload'))
})

test('discarding the workspace prevents late upload results from tracking jobs for a signed-out user', async () => {
  const upload = session()
  upload.render().handleSelectFiles([file])
  const transfer = upload.render().handleUploadSubmit(event)
  upload.render()
  upload.dispose()
  upload.finish({ job_id: 'late-job', status: 'QUEUED' })
  await transfer
  assert(!upload.tracked.some((job) => job?.job_id === 'late-job'))
  assert.equal(session().render().files.length, 0)
})

const statusCode = await transformWithOxc(read('features/engineer/components/EngineerUploadStatus.jsx'),
  'EngineerUploadStatus.jsx', { jsx: { runtime: 'classic' } })
function banner(pathname, busy = true) {
  const navigation = []
  const context = vm.createContext({ React, Upload: () => null,
    useLocation: () => ({ pathname }), useNavigate: () => (path) => navigation.push(path),
    useLanguage: () => ({ t: (value) => value }),
    useEngineerUpload: () => ({ busy, progress: 47, mutation: { busy: true } }),
  })
  vm.runInContext(statusCode.code, context)
  return { element: context.EngineerUploadStatus(), navigation }
}
test('other sections show progress and a return button, while upload and idle pages do not duplicate it', () => {
  const away = banner('/engineer/datasets')
  assert(renderToStaticMarkup(away.element).includes('47%'))
  React.Children.toArray(away.element.props.children)[1].props.onClick()
  assert.deepEqual(away.navigation, ['/engineer/upload'])
  assert.equal(banner('/engineer/upload').element, null)
  assert.equal(banner('/engineer/datasets', false).element, null)
})

const pageSource = fs.readFileSync(new URL('../src/features/engineer/pages/EngineerUploadPage.jsx', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\r?\n/gm, '')
  .replace(/^import ['"][^'"]+['"];?\r?\n/gm, '').replace('export default ', '')
const pageCode = await transformWithOxc(pageSource, 'EngineerUploadPage.jsx', { jsx: { runtime: 'classic' } })
function renderUploadPage(upload) {
  const empty = () => null
  const context = vm.createContext({ React,
    useEngineerUpload: () => upload, useLanguage: () => ({ t: (value) => value }),
    useNavigate: () => () => {}, useRef: () => ({ current: null }),
    useState: () => [false, () => {}], useEffect: () => {}, formatBytes: (value) => `${value} bytes`,
    Upload: empty, Workflow: empty, FolderOpen: empty, FileSpreadsheet: empty, AlertTriangle: empty,
    CheckCircle2: empty, X: empty, RefreshCw: empty, Info: empty,
    EngineerBadge: empty, EngineerFeedback: empty, EngineerHeader: empty, EngineerJob: empty,
  })
  vm.runInContext(pageCode.code, context)
  return renderToStaticMarkup(React.createElement(context.EngineerUploadPage))
}
test('a freshly mounted upload page displays the workspace files, metadata and current progress', async () => {
  const upload = session()
  upload.render().handleSelectFiles([file])
  upload.render().setMetadata({ group_name: 'Retained batch', source: '', location_name: '', description: '' })
  const transfer = upload.render().handleUploadSubmit(event)
  upload.report({ loaded: 47, total: 100, phase: 's3' })
  const html = renderUploadPage(upload.render())
  assert(html.includes(file.name))
  assert(html.includes('value="Retained batch"'))
  assert(html.includes('47%'))
  assert(html.includes('Uploading recordings directly to S3...'))
  upload.finish({ uploaded_count: 1, failed_count: 0, files: [] })
  await transfer
  assert(renderUploadPage(upload.render()).includes('Upload More Files'))
  upload.dispose()
})
