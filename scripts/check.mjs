#!/usr/bin/env node
/**
 * Dependency-free static acceptance checks for dsh-wiring.
 * Prints one `ok <check>` line per passing check; prints every failure and
 * exits 1 when anything fails.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

function ok(label) {
  console.log(`ok ${label}`)
}

function fail(label, message) {
  failures.push(`${label}: ${message}`)
  console.log(`FAIL ${label}: ${message}`)
}

function check(label, condition, message) {
  if (condition) ok(label)
  else fail(label, message ?? 'assertion failed')
}

function read(relative) {
  // Strip a UTF-8 BOM: PowerShell's Set-Content -Encoding UTF8 writes one, and
  // JSON.parse rejects it with "Unexpected token '\uFEFF'".
  return readFileSync(join(root, relative), 'utf8').replace(/^\uFEFF/, '')
}

function walk(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walk(full))
    else files.push(full)
  }
  return files
}

const pkg = JSON.parse(read('package.json'))
const srcFiles = walk(join(root, 'src')).filter((file) => file.endsWith('.js'))
const source = srcFiles.map((file) => readFileSync(file, 'utf8')).join('\n')

// 1. package.json contract -----------------------------------------------------
{
  const problems = []
  if (typeof pkg.name !== 'string' || !/^@[a-z0-9][a-z0-9._-]*\/dsh-wiring$/.test(pkg.name)) {
    problems.push(`name is ${String(pkg.name)}`)
  }
  if (pkg.type !== 'module') problems.push('type must be module')
  if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml') problems.push('dsh.bundle.patch must be ./cordis.patch.yml')
  if (typeof pkg.exports?.['./icon'] !== 'string') problems.push('missing exports["./icon"]')
  if (typeof pkg.exports?.['./locale/*.json'] !== 'string') problems.push('missing exports["./locale/*.json"]')
  if (typeof pkg.engines?.dsh !== 'string' || pkg.engines.dsh.length === 0) problems.push('missing engines.dsh')
  const files = Array.isArray(pkg.files) ? pkg.files : []
  if (!files.includes('src')) problems.push('files must include src')
  if (!files.includes('cordis.patch.yml')) problems.push('files must include cordis.patch.yml')
  check('package.json', problems.length === 0, problems.join('; '))
}

// 2. locales -------------------------------------------------------------------
{
  const problems = []
  const capabilityDir = join(root, 'src', 'capabilities')
  const capabilityFiles = existsSync(capabilityDir)
    ? readdirSync(capabilityDir).filter((file) => file.endsWith('.js'))
    : []
  const ids = []
  for (const file of capabilityFiles) {
    try {
      const module = await import(pathToFileURL(join(capabilityDir, file)).href)
      if (typeof module.capability?.id === 'string') ids.push(module.capability.id)
      else problems.push(`${file} exports no capability`)
    } catch (error) {
      problems.push(`${file}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  for (const locale of ['en', 'zh']) {
    try {
      const parsed = JSON.parse(read(`locale/${locale}.json`))
      if (typeof parsed.meta?.title !== 'string' || parsed.meta.title.trim() === '') {
        problems.push(`${locale}: meta.title is empty`)
      }
      if (typeof parsed.meta?.description !== 'string' || parsed.meta.description.trim() === '') {
        problems.push(`${locale}: meta.description is empty`)
      }
      for (const id of ids) {
        const title = parsed.capabilities?.[id]?.title
        if (typeof title !== 'string' || title.trim() === '') {
          problems.push(`${locale}: capabilities.${id}.title is empty`)
        }
      }
    } catch (error) {
      problems.push(`${locale}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  check('locale', problems.length === 0, problems.join('; '))
}

// 3. icon ----------------------------------------------------------------------
{
  const problems = []
  const iconPath = join(root, 'icon.svg')
  if (!existsSync(iconPath)) {
    problems.push('icon.svg is missing')
  } else {
    const bytes = statSync(iconPath).size
    const svg = readFileSync(iconPath, 'utf8').trim()
    if (bytes >= 8 * 1024) problems.push(`icon.svg is ${bytes} bytes (must be < 8192)`)
    if (!svg.startsWith('<svg')) problems.push('icon.svg must start with <svg')
    if (!svg.endsWith('</svg>')) problems.push('icon.svg must end with </svg>')
  }
  check('icon.svg', problems.length === 0, problems.join('; '))
}

// 4. bundle patch --------------------------------------------------------------
let patchText = ''
{
  const problems = []
  // Normalize newlines: a Windows checkout yields CRLF, and comparing raw
  // line endings made this check fail on the windows-latest CI runner.
  patchText = read('cordis.patch.yml').replace(/\r\n?/g, '\n')
  if (patchText.includes('\t')) problems.push('patch contains a tab character')

  const active = patchText
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')
  const firstLine = active.split('\n').find((line) => line.trim() !== '')
  if (firstLine?.trim() !== '- insert:') problems.push(`first non-comment line is "${String(firstLine)}"`)

  const ids = [...active.matchAll(/^\s*- id:\s*(\S+)\s*$/gm)].map((match) => match[1])
  if (ids.length < 4) problems.push(`found ${ids.length} rows, expected at least 4`)
  if (new Set(ids).size !== ids.length) problems.push('row ids are not unique')
  for (const id of ids) {
    if (!id.startsWith('wiring-')) problems.push(`row id "${id}" does not start with wiring-`)
  }

  const yaml = await loadYaml()
  if (yaml !== undefined) {
    try {
      const doc = yaml.load(patchText)
      if (!Array.isArray(doc)) problems.push('parsed patch is not an array')
      else {
        const rows = doc.flatMap((layer) => layer?.insert ?? [])
        if (rows.length < 4) problems.push(`parsed ${rows.length} rows, expected at least 4`)
        for (const row of rows) {
          if (typeof row?.id !== 'string' || typeof row?.name !== 'string') {
            problems.push('parsed row is missing id/name')
          }
        }
      }
    } catch (error) {
      problems.push(`parse failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  check('cordis.patch.yml', problems.length === 0, problems.join('; '))
}

// 5. R5: the doctor never writes ----------------------------------------------
{
  const forbidden = ['configEditor', 'writeFile', 'appendFile', 'mkdir']
  const hits = forbidden.filter((token) => source.includes(token))
  check('R5 source writes', hits.length === 0, `forbidden token(s): ${hits.join(', ')}`)
}

// 6. R6: no host imports and only the seven pinned dependencies ---------------
{
  const problems = []
  const importPattern = /(?:from\s+['"]@deepseek-ai\/|import\(\s*['"]@deepseek-ai\/)/
  for (const file of srcFiles) {
    const text = readFileSync(file, 'utf8')
    if (importPattern.test(text)) problems.push(`host import in ${file.slice(root.length + 1)}`)
  }

  const allowed = [
    '@deepseek-ai/dsh-browser-use',
    '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp',
    '@deepseek-ai/dsh-lsp',
    '@deepseek-ai/dsh-lsp-stdio',
    '@deepseek-ai/dsh-tool-lsp',
    '@deepseek-ai/dsh-webhook',
    '@deepseek-ai/dsh-webhook-github',
  ]
  const declared = Object.keys(pkg.dependencies ?? {})
  if (declared.length !== allowed.length) problems.push(`dependencies must be exactly ${allowed.join(', ')}`)
  for (const dependency of declared) {
    if (!allowed.includes(dependency)) problems.push(`unexpected dependency ${dependency}`)
  }
  if (Object.keys(pkg.devDependencies ?? {}).length > 0) problems.push('devDependencies must be empty')

  check('R6 boundaries', problems.length === 0, problems.join('; '))
}

// 7. R8: dangerous blast radii are opt-in -------------------------------------
{
  const problems = []
  const capabilityDir = join(root, 'src', 'capabilities')
  const files = existsSync(capabilityDir)
    ? readdirSync(capabilityDir).filter((file) => file.endsWith('.js'))
    : []
  if (files.length === 0) problems.push('no capability modules found')

  for (const file of files) {
    const module = await import(pathToFileURL(join(capabilityDir, file)).href)
    const capability = module.capability
    if (capability === undefined) {
      problems.push(`${file} exports no capability`)
      continue
    }
    if (capability.blastRadius !== 'tool') {
      if (capability.defaultEnabled !== false) problems.push(`${capability.id} must default to disabled`)
      if (!patchText.includes('disabled: true')) problems.push(`${capability.id} needs a disabled: true row`)
    }
  }

  check('R8 blast radius', problems.length === 0, problems.join('; '))
}

function finish() {
  if (failures.length === 0) {
    console.log('PASS')
    return
  }
  console.log('')
  for (const failure of failures) console.log(`FAIL ${failure}`)
  process.exitCode = 1
}

/** Load js-yaml when it ships with an installed DSH, without declaring a dependency. */
async function loadYaml() {
  try {
    return await import('js-yaml')
  } catch {
    // Fall through to the documented installed layout.
  }
  const appData = process.env.APPDATA
  if (appData) {
    const candidate = join(
      appData,
      'npm',
      'node_modules',
      '@deepseek-ai',
      'dsh',
      'node_modules',
      'js-yaml',
      'index.js',
    )
    if (existsSync(candidate)) {
      try {
        return await import(pathToFileURL(candidate).href)
      } catch {
        // Fall through to the no-parser path.
      }
    }
  }
  return undefined
}

finish()
