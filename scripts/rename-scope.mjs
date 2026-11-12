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
import { dirname, join, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const OLD = '@local/dsh-wiring'

/** Archived verification records are historical: never rewrite them. */
const EXCLUDED_DOCS = new Set(['VERIFICATION.md'])

/** Compare on file names, not joined paths: `join` yields `\` on Windows. */
function toPosix(id) {
  return id.split(sep).join('/')
}

/** package.json: only the top-level name field. */
function renamePackageJson(line, target) {
  return /^\s*"name"\s*:/.test(line) ? line.replaceAll(OLD, target) : line
}

/** cordis.patch.yml: only the two `name:` row values owned by this package. */
function renamePatch(line, target) {
  return /^\s*name:\s*'@local\/dsh-wiring(\/rule)?'\s*$/.test(line) ? line.replaceAll(OLD, target) : line
}

/** Markdown: every occurrence. */
function renameMarkdown(line, target) {
  return line.includes(OLD) ? line.replaceAll(OLD, target) : line
}

function collect(root, id, transform, target) {
  const path = join(root, id)
  if (!existsSync(path)) return []
  const file = toPosix(id)
  const lines = readFileSync(path, 'utf8').split('\n')
  const changes = []
  for (let index = 0; index < lines.length; index += 1) {
    const next = transform(lines[index], target)
    if (next !== lines[index]) changes.push({ file, line: index + 1, before: lines[index], after: next })
  }
  return changes
}

/**
 * Build the rename plan. Pure: reads files, writes nothing, prints nothing.
 * @param {string} root repository root
 * @param {string} scope target npm scope, with or without `@`
 * @returns {{ file: string, line: number, before: string, after: string }[]}
 */
export function planRename(root, scope) {
  const target = `@${String(scope).replace(/^@/, '')}/dsh-wiring`
  const plan = [
    ...collect(root, 'package.json', renamePackageJson, target),
    ...collect(root, 'cordis.patch.yml', renamePatch, target),
    ...collect(root, 'README.md', renameMarkdown, target),
  ]
  const docs = join(root, 'docs')
  if (existsSync(docs)) {
    for (const entry of readdirSync(docs)) {
      if (!entry.endsWith('.md') || EXCLUDED_DOCS.has(entry)) continue
      plan.push(...collect(root, join('docs', entry), renameMarkdown, target))
    }
  }
  return plan
}

const TRANSFORMS = {
  'package.json': renamePackageJson,
  'cordis.patch.yml': renamePatch,
}

function main() {
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

  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const plan = planRename(root, scope)

  if (plan.length === 0) {
    console.log('no changes')
    return
  }

  const target = `@${scope}/dsh-wiring`
  console.log(`${apply ? 'apply' : 'dry-run'}: ${OLD} -> ${target}`)
  for (const change of plan) {
    console.log(`${change.file}:${change.line}  ${change.before.trim()}`)
    console.log(`${change.file}:${change.line}  ${change.after.trim()}`)
  }
  const files = new Set(plan.map((change) => change.file))
  console.log(`${files.size} file(s), ${plan.length} line(s) would change`)

  if (!apply) return

  for (const file of files) {
    const path = join(root, file)
    const transform = TRANSFORMS[file] ?? renameMarkdown
    const lines = readFileSync(path, 'utf8').split('\n')
    writeFileSync(path, lines.map((line) => transform(line, target)).join('\n'), 'utf8')
  }

  try {
    execFileSync(process.execPath, [join(root, 'scripts', 'check.mjs')], {
      cwd: root,
      stdio: 'inherit',
    })
    console.log(`applied: ${OLD} -> ${target}`)
  } catch {
    console.error('check.mjs failed after rename; roll back with: git checkout -- .')
    process.exit(1)
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main()
}
