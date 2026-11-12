import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { capability } from '../src/capabilities/webhook.js'
import { apply } from '../src/rule.js'
import { defineStatusTool } from '../src/index.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const signal = new AbortController().signal

/** Minimal host half: effect runs immediately, register collects rules. */
function makeContext() {
  const rules = []
  return {
    rules,
    ctx: {
      effect(execute) {
        execute()
        return () => {}
      },
      webhookRuntime: {
        register(rule) {
          rules.push(rule)
          return async () => {}
        },
      },
    },
  }
}

function delivery(action, overrides = {}) {
  return {
    kind: 'github',
    source: 'primary-github',
    deliveryId: 'delivery-1',
    receivedAt: '2026-11-12T00:00:00Z',
    event: {
      name: 'pull_request',
      payload: {
        action,
        pull_request: {
          number: 42,
          title: 'Add the widget',
          html_url: 'https://github.com/example/repo/pull/42',
          body: 'Please review.',
          user: { login: 'octocat' },
          base: { ref: 'main' },
          head: { ref: 'widget' },
        },
        repository: { full_name: 'example/repo' },
        ...overrides,
      },
    },
  }
}

test('descriptor invariants hold', () => {
  assert.equal(capability.id, 'webhook')
  assert.equal(capability.blastRadius, 'ingress')
  assert.equal(capability.defaultEnabled, false)
  assert.equal(typeof capability.hint, 'string')
  assert.ok(capability.hint.length > 0)
  assert.equal(capability.checks.length, 1)
  assert.equal(capability.checks[0].id, 'runtime')
})

test('apply() registers exactly one github rule', () => {
  const { rules, ctx } = makeContext()
  apply(ctx)
  assert.equal(rules.length, 1)
  assert.equal(rules[0].kind, 'github')
})

test('a matching pull_request yields a Session request', () => {
  const { rules, ctx } = makeContext()
  apply(ctx)
  const request = rules[0].run(delivery('opened'), signal)

  assert.equal(request.workspacePath, process.cwd())
  assert.equal(request.agentPreset, 'standard')
  assert.equal(request.permissionPreset, 'workspace-write')
  assert.ok(request.title.startsWith('PR #'))
  assert.ok(request.prompt.includes('untrusted data'))
  assert.ok(request.prompt.includes('example/repo'))
})

test('non-matching deliveries are ignored', () => {
  const { rules, ctx } = makeContext()
  apply(ctx)

  assert.equal(rules[0].run(delivery('closed'), signal), null)
  assert.equal(rules[0].run(delivery('push'), signal), null)
  assert.equal(rules[0].run(delivery('opened'), { aborted: true }), null)
})

test('Ingress safety: only the signed ingress row ships disabled', () => {
  const text = readFileSync(join(root, 'cordis.patch.yml'), 'utf8').replace(/\r\n?/g, '\n')
  const lines = text.split('\n')

  function blockOf(id) {
    const start = lines.findIndex((line) => line.includes(`- id: ${id}`))
    assert.ok(start >= 0, `cordis.patch.yml has no ${id} row`)
    const block = []
    for (let index = start; index < lines.length; index += 1) {
      if (index > start && /^\s*- id: /.test(lines[index])) break
      block.push(lines[index])
    }
    return block
  }

  const ingress = blockOf('wiring-webhook-github')
  assert.ok(
    ingress.some((line) => /^\s+disabled:\s*true\s*$/.test(line)),
    'the ingress row must ship disabled: true',
  )
  assert.ok(
    ingress.some((line) => /^\s+secretEnv:\s*GITHUB_WEBHOOK_SECRET\s*$/.test(line)),
    'the ingress row must read its secret from a credential record',
  )
  for (const id of ['wiring-webhook-runtime', 'wiring-webhook-rule']) {
    assert.ok(
      !blockOf(id).some((line) => /^\s+disabled:\s*true\s*$/.test(line)),
      `${id} must stay enabled`,
    )
  }
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

test('output schema accepts the webhook report', async () => {
  const validator = await loadValidator()
  if (validator === undefined) {
    console.log('skip: validator unavailable')
    return
  }

  const ctx = { tools: { register() {} }, effect(f) { f() }, subprocess: {}, get() { return {} } }
  const tool = defineStatusTool(ctx, capability, { timeoutMs: 50 })
  const report = await tool.execute({}, {})

  validator.assertSupportedJsonSchema(tool.parameters)
  validator.assertSupportedJsonSchema(tool.output.schema)
  assert.deepEqual(validator.validateJsonSchemaValue(tool.output.schema, report), [])
})
