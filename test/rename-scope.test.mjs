import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { planRename } from '../scripts/rename-scope.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const currentScope = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name.slice(1).split('/')[0]

test('archived verification records are never renamed', () => {
  const plan = planRename(root, 'example')
  assert.equal(plan.some((change) => change.file === 'docs/VERIFICATION.md'), false)
})

test('the current scope is a no-op', () => {
  assert.deepEqual(planRename(root, currentScope), [])
})

test('the plan covers package.json, the patch, the README, and the sources', () => {
  const plan = planRename(root, 'example')
  const files = new Set(plan.map((change) => change.file))
  for (const file of ['package.json', 'cordis.patch.yml', 'README.md', 'src/rule.js']) {
    assert.equal(files.has(file), true, `${file} is missing from the plan`)
  }
  for (const change of plan) {
    assert.notEqual(change.before, change.after)
  }
})

test('every planned path is relative and POSIX-shaped', () => {
  for (const change of planRename(root, 'example')) {
    assert.match(change.file, /^[^\\/]/)
    assert.equal(change.file.includes('\\'), false)
    assert.match(change.file, /^(package\.json|cordis\.patch\.yml|README\.md|docs\/[^\\/]+\.md|src\/[^\\]+\.js)$/)
  }
})
