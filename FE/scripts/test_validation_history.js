import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'

test('saved Validation details stay hidden until selection and reload preserves that selection', async () => {
  const slots = [], effects = []
  let cursor = 0, effectCursor = 0
  const saved = { id: 'saved-study', status: 'COMPLETED' }
  const context = vm.createContext({
    validationService: { list: async () => [saved] }, extractErrorMessage: error => error.message,
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value }] },
    useRef: initial => { const i = cursor++; return slots[i] ??= { current: initial } },
    useCallback: callback => callback,
    useEffect: (callback, deps) => { const i = effectCursor++, key = JSON.stringify(deps)
      if (effects[i]?.key === key) return
      effects[i]?.cleanup?.(); effects[i] = { key, cleanup: callback() } },
  })
  const source = fs.readFileSync(new URL('../src/hooks/useValidationStudy.js', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '').replace('export function', 'function')
  vm.runInContext(source, context)
  const render = () => { cursor = 0; effectCursor = 0; return context.useValidationStudy('generation') }
  render(); await new Promise(resolve => setImmediate(resolve))
  assert.equal(render().studies.length, 1)
  assert.equal(render().selectedId, '')
  assert.equal(render().study, null)
  await render().reload()
  assert.equal(render().study, null)
  render().setSelectedId(saved.id)
  assert.equal(render().study.id, saved.id)
  await render().reload()
  assert.equal(render().study.id, saved.id)
})
