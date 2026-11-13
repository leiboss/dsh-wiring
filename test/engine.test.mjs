import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { apply, defineStatusTool, formatReport, runChecks } from '../src/index.js'
import { capability as lsp } from '../src/capabilities/lsp.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Minimal Cordis-shaped context: tool registration is collected, effects run
 * immediately, and executable resolution is injected per test.
 */
function makeContext({ resolve, services = {} } = {}) {
  const registered = new Map()
  const disposers = []
  const calls = []
  const ctx = {
    tools: {
      register(definition) {
        registered.set(definition.name, definition)
        return () => {
          if (registered.get(definition.name) === definition) registered.delete(definition.name)
        }
      },
    },
    effect(execute) {
      const dispose = execute()
      if (typeof dispose === 'function') disposers.push(dispose)
      return () => {}
    },
    subprocess: {
      async resolveExecutable(command, env, signal) {
        calls.push({ command, env, signal })
        return resolve(command, env, signal)
      },
    },
    get(service) {
      return services[service]
    },
  }
  return {
    ctx,
    registered,
    calls,
    disposeAll() {
      while (disposers.length > 0) disposers.pop()()
    },
  }
}

const okResolver = async () => '/usr/local/bin/typescript-language-server'

/** A two-check capability used to observe ordering and timeout isolation. */
const demo = {
  id: 'demo',
  title: { en: 'Demo' },
  checks: [
    { id: 'slow', label: 'Slow tool', kind: 'command', command: 'slow-tool', install: 'npm i -g slow-tool' },
    { id: 'fast', label: 'Fast service', kind: 'service', service: 'fast', install: '' },
  ],
}

test('apply() performs no probes', () => {
  const harness = makeContext({ resolve: okResolver })
  apply(harness.ctx)
  assert.equal(harness.calls.length, 0)
  assert.deepEqual([...harness.registered.keys()], ['lsp_status', 'browser_status', 'webhook_status'])
})

test('a hung probe times out without affecting siblings', async () => {
  const harness = makeContext({
    resolve: () => new Promise(() => {}),
    services: { fast: {} },
  })
  const tool = defineStatusTool(harness.ctx, demo, { timeoutMs: 50 })
  const report = await tool.execute({}, {})

  assert.equal(report.checks[0].detail, 'timeout')
  assert.equal(report.checks[0].ok, false)
  assert.equal(report.checks[1].ok, true)
  assert.equal(report.checks[1].detail, 'mounted')
})

test('a throwing resolver still yields a complete report', async () => {
  const harness = makeContext({
    resolve: () => {
      throw new Error('boom')
    },
    services: { fast: {} },
  })
  const tool = defineStatusTool(harness.ctx, demo, { timeoutMs: 50 })
  const report = await tool.execute({}, {})

  assert.equal(report.checks.length, 2)
  assert.equal(report.checks[0].ok, false)
  assert.equal(report.checks[0].detail, 'error: boom')
  assert.equal(report.checks[1].ok, true)
})

test('disposal followed by apply() leaves exactly one registration per capability', () => {
  const harness = makeContext({ resolve: okResolver })
  apply(harness.ctx)
  assert.equal(harness.registered.size, 3)

  harness.disposeAll()
  assert.equal(harness.registered.size, 0)

  apply(harness.ctx)
  assert.equal(harness.registered.size, 3)
})

test('a missing seam service degrades instead of throwing', async () => {
  const harness = makeContext({ resolve: okResolver })
  const tool = defineStatusTool(harness.ctx, demo, { timeoutMs: 50 })
  const report = await tool.execute({}, {})

  assert.equal(report.checks[1].ok, false)
  assert.equal(report.checks[1].detail, 'service unavailable')
})

test('report shape: ok is the AND of checks and next is the first failing install', async () => {
  const failing = makeContext({
    resolve: async () => '/usr/local/bin/slow-tool',
    services: {},
  })
  const failedReport = await defineStatusTool(failing.ctx, demo, { timeoutMs: 50 }).execute({}, {})
  assert.equal(failedReport.ok, false)
  assert.equal(failedReport.next, '')
  assert.equal(failedReport.checks.every((check) => check.ok) === false, true)

  const passing = makeContext({
    resolve: async () => '/usr/local/bin/slow-tool',
    services: { fast: {} },
  })
  const okReport = await defineStatusTool(passing.ctx, demo, { timeoutMs: 50 }).execute({}, {})
  assert.equal(okReport.ok, true)
  assert.equal(okReport.next, '')
  assert.equal(okReport.checks.every((check) => check.ok), true)

  const withInstall = {
    ...demo,
    checks: [{ id: 'missing', label: 'Missing tool', kind: 'command', command: 'nope', install: 'npm i -g nope' }],
  }
  const missing = makeContext({
    resolve: () => {
      const error = new Error('no executable')
      error.name = 'SubprocessExecutableNotFoundError'
      throw error
    },
  })
  const missingReport = await defineStatusTool(missing.ctx, withInstall, { timeoutMs: 50 }).execute({}, {})
  assert.equal(missingReport.ok, false)
  assert.equal(missingReport.next, 'npm i -g nope')
  assert.equal(missingReport.checks[0].detail, 'not found on PATH')
})

test('formatReport lists every label and failing install command', () => {
  const report = {
    capability: 'demo',
    ok: false,
    checks: [
      { id: 'seam', label: 'Seam', ok: true, detail: 'mounted', install: '' },
      { id: 'tool', label: 'Tool', ok: false, detail: 'not found on PATH', install: 'npm i -g tool' },
    ],
    next: 'npm i -g tool',
  }
  const text = formatReport(demo, report)
  assert.match(text, /Seam/)
  assert.match(text, /Tool/)
  assert.match(text, /npm i -g tool/)
})

test('runChecks tolerates a non-array check list', async () => {
  const harness = makeContext({ resolve: okResolver })
  assert.deepEqual(await runChecks(harness.ctx, undefined, { timeoutMs: 10 }), [])
})

test('paths checks pass on any candidate and report the first hit', async () => {
  const harness = makeContext({ resolve: okResolver })
  const present = {
    ...demo,
    checks: [
      {
        id: 'runtime',
        label: 'Runtime',
        kind: 'paths',
        paths: [join(root, 'definitely-missing'), process.execPath],
        install: '',
      },
    ],
  }
  const hitReport = await defineStatusTool(harness.ctx, present, { timeoutMs: 50 }).execute({}, {})
  assert.equal(hitReport.checks[0].ok, true)
  assert.equal(hitReport.checks[0].detail, process.execPath)

  const absent = {
    ...demo,
    checks: [
      {
        id: 'runtime',
        label: 'Runtime',
        kind: 'paths',
        paths: [join(root, 'definitely-missing-a'), join(root, 'definitely-missing-b')],
        install: '',
      },
    ],
  }
  const missReport = await defineStatusTool(harness.ctx, absent, { timeoutMs: 50 }).execute({}, {})
  assert.equal(missReport.checks[0].ok, false)
  assert.equal(missReport.checks[0].detail, 'not found')
})

test('hint is carried in the report and rendered only when present', async () => {
  const harness = makeContext({ resolve: okResolver, services: { fast: {} } })
  const hintText = 'Enable the provider row and start a new Session.'
  const hinted = { ...demo, hint: hintText }
  const report = await defineStatusTool(harness.ctx, hinted, { timeoutMs: 50 }).execute({}, {})

  assert.equal(report.hint, hintText)
  assert.deepEqual(Object.keys(report).sort(), ['capability', 'checks', 'hint', 'next', 'ok'])
  const hintedText = formatReport(hinted, report)
  assert.ok(hintedText.endsWith(`\n\n${hintText}`))

  const plain = await defineStatusTool(harness.ctx, demo, { timeoutMs: 50 }).execute({}, {})
  assert.equal(plain.hint, '')
  const plainText = formatReport(demo, plain)
  assert.ok(!plainText.includes('\n\n'))
  assert.ok(!plainText.endsWith('\n'))
})

test('workspacePath resolves against the session working directory', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'wiring-cwd-'))
  const nested = join(workspace, 'node_modules', 'typescript', 'lib')
  mkdirSync(nested, { recursive: true })
  writeFileSync(join(nested, 'tsserver.js'), '')

  const capability = {
    ...demo,
    checks: [
      {
        id: 'typescript-lib',
        label: 'workspace typescript (tsserver)',
        kind: 'workspacePath',
        path: 'node_modules/typescript/lib/tsserver.js',
        install: 'npm install --save-dev typescript@5',
      },
    ],
  }
  const harness = makeContext({ resolve: okResolver })

  const hit = await runChecks(harness.ctx, capability.checks, { timeoutMs: 50, cwd: workspace })
  assert.equal(hit[0].ok, true)
  assert.equal(hit[0].detail, join(workspace, 'node_modules', 'typescript', 'lib', 'tsserver.js'))

  const miss = await runChecks(harness.ctx, capability.checks, { timeoutMs: 50, cwd: tmpdir() })
  assert.equal(miss[0].ok, false)
  assert.equal(miss[0].detail, 'not found')

  rmSync(workspace, { recursive: true, force: true })
})

test('execute reads the working directory from the tool execution context', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'wiring-exec-'))
  const nested = join(workspace, 'node_modules', 'typescript', 'lib')
  mkdirSync(nested, { recursive: true })
  writeFileSync(join(nested, 'tsserver.js'), '')

  const capability = {
    ...demo,
    checks: [
      {
        id: 'typescript-lib',
        label: 'workspace typescript (tsserver)',
        kind: 'workspacePath',
        path: 'node_modules/typescript/lib/tsserver.js',
        install: 'npm install --save-dev typescript@5',
      },
    ],
  }
  const harness = makeContext({ resolve: okResolver })
  const tool = defineStatusTool(harness.ctx, capability, { timeoutMs: 50 })

  const fromAgent = await tool.execute({}, { agent: { session: { header: { cwd: workspace } } } })
  assert.equal(fromAgent.checks[0].ok, true)

  const fallback = await tool.execute({}, {})
  const direct = await runChecks(harness.ctx, capability.checks, { timeoutMs: 50, cwd: process.cwd() })
  assert.equal(fallback.checks[0].ok, direct[0].ok)
  assert.equal(fallback.checks[0].detail, direct[0].detail)

  rmSync(workspace, { recursive: true, force: true })
})

test('check hints render only for the checks that fail', () => {
  const capability = {
    ...demo,
    checks: [
      { id: 'broken', label: 'Broken tool', kind: 'command', command: 'nope', install: 'npm i -g nope' },
      { id: 'fine', label: 'Fine tool', kind: 'command', command: 'yep', install: '' },
    ],
  }
  const report = {
    capability: 'demo',
    ok: false,
    checks: [
      { id: 'broken', label: 'Broken tool', ok: false, detail: 'not found on PATH', install: 'npm i -g nope' },
      { id: 'fine', label: 'Fine tool', ok: true, detail: '/usr/local/bin/yep', install: '' },
    ],
    next: 'npm i -g nope',
    hint: '',
  }
  const withHints = {
    ...capability,
    checks: [
      { ...capability.checks[0], hint: 'the broken tool needs a rebuild after install' },
      { ...capability.checks[1], hint: 'this hint must never show up' },
    ],
  }

  const text = formatReport(withHints, report)
  assert.ok(text.includes('the broken tool needs a rebuild after install'))
  assert.ok(!text.includes('this hint must never show up'))
  assert.ok(text.includes('  install: npm i -g nope'))
})

test('a capability hint renders even when every check passes', () => {
  const hintText = 'Enable the provider row and start a new Session.'
  const report = {
    capability: 'demo',
    ok: true,
    checks: [{ id: 'fast', label: 'Fast service', ok: true, detail: 'mounted', install: '' }],
    next: '',
    hint: hintText,
  }

  const text = formatReport({ ...demo, hint: hintText }, report)
  assert.ok(text.endsWith(`\n\n${hintText}`))
})

/** Try the local install, then the Windows global DSH layout. */
async function loadValidator() {
  try {
    return await import('@deepseek-ai/dsh-tools')
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
      '@deepseek-ai',
      'dsh-tools',
      'lib',
      'index.js',
    )
    if (existsSync(candidate)) {
      try {
        return await import(pathToFileURL(candidate).href)
      } catch {
        // Fall through to the skip path.
      }
    }
  }
  return undefined
}

test('output schema accepts every produced report', async () => {
  const validator = await loadValidator()
  if (validator === undefined) {
    console.log('skip: validator unavailable')
    return
  }

  const harness = makeContext({
    resolve: async () => '/usr/local/bin/typescript-language-server',
    services: { lsp: {} },
  })
  const tool = defineStatusTool(harness.ctx, demo, { timeoutMs: 50 })
  const report = await tool.execute({}, {})

  validator.assertSupportedJsonSchema(tool.parameters)
  validator.assertSupportedJsonSchema(tool.output.schema)
  assert.deepEqual(validator.validateJsonSchemaValue(tool.output.schema, report), [])
})
