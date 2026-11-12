import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { capability } from '../src/capabilities/browser.js'
import { defineStatusTool } from '../src/index.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Minimal Cordis-shaped context: the seam is the only thing under test. */
function makeContext({ services = {} } = {}) {
  return {
    tools: {
      register() {
        return () => {}
      },
    },
    effect(execute) {
      execute()
      return () => {}
    },
    subprocess: {
      async resolveExecutable() {
        throw new Error('browser checks must not resolve executables')
      },
    },
    get(service) {
      return services[service]
    },
  }
}

test('descriptor invariants hold', () => {
  assert.equal(capability.id, 'browser')
  assert.equal(capability.blastRadius, 'session')
  assert.equal(capability.defaultEnabled, false)
  assert.equal(typeof capability.hint, 'string')
  assert.ok(capability.hint.length > 0)
  assert.equal(capability.checks.length, 2)
  assert.deepEqual(
    capability.checks.map((check) => check.id),
    ['seam', 'chromium'],
  )
})

test('browser_status requires hint in its output schema', () => {
  const tool = defineStatusTool(makeContext(), capability, { timeoutMs: 50 })
  assert.equal(tool.name, 'browser_status')
  assert.ok(tool.output.schema.required.includes('hint'))
})

test('execute reports the seam both ways and never rejects', async () => {
  const mounted = defineStatusTool(makeContext({ services: { browserUse: {} } }), capability, {
    timeoutMs: 50,
  })
  const mountedReport = await mounted.execute({}, {})
  assert.equal(mountedReport.checks[0].ok, true)
  assert.equal(mountedReport.hint, capability.hint)

  const missing = defineStatusTool(makeContext(), capability, { timeoutMs: 50 })
  const missingReport = await missing.execute({}, {})
  assert.equal(missingReport.checks[0].ok, false)

  const broken = defineStatusTool(
    {
      ...makeContext(),
      get() {
        throw new Error('broken context')
      },
    },
    capability,
    { timeoutMs: 50 },
  )
  const brokenReport = await broken.execute({}, {})
  assert.equal(typeof brokenReport.ok, 'boolean')
})

test('Session safety: the provider row ships disabled', () => {
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8').replace(/\r\n?/g, '\n')
  const lines = patch.split('\n')
  const start = lines.findIndex((line) => line.includes('- id: wiring-browser-playwright'))
  assert.ok(start >= 0, 'cordis.patch.yml has no wiring-browser-playwright row')

  let block = []
  for (let index = start; index < lines.length; index += 1) {
    if (index > start && /^\s*- id: /.test(lines[index])) break
    block.push(lines[index])
  }
  assert.ok(
    block.some((line) => /^\s+name:\s*'@deepseek-ai\/dsh-experimental-browser-use-playwright-mcp'\s*$/.test(line)),
    'the browser provider row must mount the Playwright MCP provider',
  )
  assert.ok(
    block.some((line) => /^\s+disabled:\s*true\s*$/.test(line)),
    'the browser provider row must ship disabled: true',
  )
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

test('output schema accepts the browser report', async () => {
  const validator = await loadValidator()
  if (validator === undefined) {
    console.log('skip: validator unavailable')
    return
  }

  const tool = defineStatusTool(makeContext({ services: { browserUse: {} } }), capability, {
    timeoutMs: 50,
  })
  const report = await tool.execute({}, {})

  validator.assertSupportedJsonSchema(tool.parameters)
  validator.assertSupportedJsonSchema(tool.output.schema)
  assert.deepEqual(validator.validateJsonSchemaValue(tool.output.schema, report), [])
})
