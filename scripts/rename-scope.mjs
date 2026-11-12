#!/usr/bin/env node
/**
 * Rename the package scope from @local/dsh-wiring to a real npm scope.
 * Usage: node scripts/rename-scope.mjs --scope <name> [--apply]
 *
 * Dry-run by default: prints the files and lines that would change.
 * --apply writes the files, then runs scripts/check.mjs. No git commands.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OLD = '@local/dsh-wiring'

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const scopeIndex = argv.indexOf('--scope')
const rawScope = scopeIndex >= 0 ? argv[scopeIndex + 1] : undefined

if (rawScope === undefined || rawScope.startsWith('--')) {
  console.error('usage: node scripts/rename-scope.mjs --scope <name> [--apply]')
  process.exit(1)
}

const scope = rawScope.replace(/^@/, '')
if (!/^[a-z0-9][a-z0-9._-]*$/i.test(scope)) {
  console.error(`invalid scope: ${rawScope}`)
  process.exit(1)
}

const TARGET = `@${scope}/dsh-wiring`

/** package.json: only the top-level name field. */
function renamePackageJson(line) {
  return /^\s*"name"\s*:/.test(line) ? line.replaceAll(OLD, TARGET) : line
}

/** cordis.patch.yml: only the two `name:` row values owned by this package. */
function renamePatch(line) {
  return /^\s*name:\s*'@local\/dsh-wiring(\/rule)?'\s*$/.test(line) ? line.replaceAll(OLD, TARGET) : line
}

/** Markdown: every occurrence. */
function renameMarkdown(line) {
  return line.includes(OLD) ? line.replaceAll(OLD, TARGET) : line
}

function collect(file, transform) {
  const path = join(root, file)
  if (!existsSync(path)) return []
  const lines = readFileSync(path, 'utf8').split('\n')
  const changes = []
  for (let index = 0; index < lines.length; index += 1) {
    const next = transform(lines[index])
    if (next !== lines[index]) changes.push({ file, line: index + 1, before: lines[index], after: next })
  }
  return changes
}

/** Archived verification records are historical: never rewrite them. */
const EXCLUDED = new Set(['docs/VERIFICATION.md'])

const changes = [
  ...collect('package.json', renamePackageJson),
  ...collect('cordis.patch.yml', renamePatch),
  ...collect('README.md', renameMarkdown),
  ...readdirSync(join(root, 'docs'))
    .filter((entry) => entry.endsWith('.md'))
    .filter((entry) => !EXCLUDED.has(join('docs', entry)))
    .flatMap((entry) => collect(join('docs', entry), renameMarkdown)),
]

if (changes.length === 0) {
  console.log('no changes')
  process.exit(0)
}

console.log(`${apply ? 'apply' : 'dry-run'}: ${OLD} -> ${TARGET}`)
for (const change of changes) {
  console.log(`${change.file}:${change.line}  ${change.before.trim()}`)
  console.log(`${change.file}:${change.line}  ${change.after.trim()}`)
}
const files = new Set(changes.map((change) => change.file))
console.log(`${files.size} file(s), ${changes.length} line(s) would change`)

if (!apply) process.exit(0)

for (const file of files) {
  const path = join(root, file)
  const lines = readFileSync(path, 'utf8').split('\n')
  const transform = file === 'package.json'
    ? renamePackageJson
    : file === 'cordis.patch.yml'
      ? renamePatch
      : renameMarkdown
  writeFileSync(path, lines.map(transform).join('\n'), 'utf8')
}

try {
  execFileSync(process.execPath, [join(root, 'scripts', 'check.mjs')], {
    cwd: root,
    stdio: 'inherit',
  })
  console.log(`applied: ${OLD} -> ${TARGET}`)
} catch {
  console.error('check.mjs failed after rename; roll back with: git checkout -- .')
  process.exit(1)
}
