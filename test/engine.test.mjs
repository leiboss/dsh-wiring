import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { apply, defineStatusTool, formatReport, runChecks } from '../src/index.js'

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

test('R1 apply() performs no probes', () => {
  const harness = makeContext({ resolve: okResolver })
  apply(harness.ctx)
  assert.equal(harness.calls.length, 0)
  assert.deepEqual([...harness.registered.keys()], ['lsp_status'])
})

test('R2 a hung probe times out without affecting siblings', async () => {
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

test('R3 a throwing resolver still yields a complete report', async () => {
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

test('R4 disposal followed by apply() leaves exactly one registration', () => {
  const harness = makeContext({ resolve: okResolver })
  apply(harness.ctx)
  assert.equal(harness.registered.size, 1)

  harness.disposeAll()
  assert.equal(harness.registered.size, 0)

  apply(harness.ctx)
  assert.equal(harness.registered.size, 1)
})

test('R7 a missing seam service degrades instead of throwing', async () => {
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
