import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { capability } from '../src/capabilities/lsp.js'
import { defineStatusTool, formatReport } from '../src/index.js'

function makeContext({ resolve, services = {} } = {}) {
  const ctx = {
    tools: {
      register() {
        return () => {}
      },
    },
    effect(execute) {
      execute()
      return () => {}
    },
    subprocess: { resolveExecutable: resolve },
    get(service) {
      return services[service]
    },
  }
  return ctx
}

const lspSeam = { lsp: {} }

test('descriptor invariants hold', () => {
  assert.equal(capability.id, 'lsp')
  assert.equal(capability.blastRadius, 'tool')
  assert.equal(capability.defaultEnabled, true)
  assert.ok(capability.checks.length > 0)
  for (const check of capability.checks) {
    assert.equal(typeof check.id, 'string')
    assert.equal(typeof check.label, 'string')
    assert.equal(typeof check.kind, 'string')
  }
})

test('the doctor is named lsp_status with an object parameter root', () => {
  const ctx = makeContext({ resolve: async () => '/usr/local/bin/typescript-language-server', services: lspSeam })
  const tool = defineStatusTool(ctx, capability, { timeoutMs: 50 })
  assert.equal(tool.name, 'lsp_status')
  assert.equal(tool.parameters.type, 'object')
})

test('the descriptor also probes the workspace tsserver', () => {
  const check = capability.checks.find((entry) => entry.id === 'typescript-lib')
  assert.equal(check.kind, 'workspacePath')
  assert.equal(check.path, 'node_modules/typescript/lib/tsserver.js')
})

test('execute reports ready when both probes pass', async () => {
  const workspace = mkdtempSync(join(tmpdir(), 'wiring-lsp-'))
  mkdirSync(join(workspace, 'node_modules', 'typescript', 'lib'), { recursive: true })
  writeFileSync(join(workspace, 'node_modules', 'typescript', 'lib', 'tsserver.js'), '')

  const ctx = makeContext({
    resolve: async () => '/usr/local/bin/typescript-language-server',
    services: lspSeam,
  })
  const tool = defineStatusTool(ctx, capability, { timeoutMs: 50 })
  const report = await tool.execute({}, { agent: { session: { header: { cwd: workspace } } } })
  assert.equal(report.ok, true)
  assert.equal(report.next, '')
  assert.equal(report.capability, 'lsp')
  assert.equal(report.checks[1].detail, '/usr/local/bin/typescript-language-server')

  rmSync(workspace, { recursive: true, force: true })
})

test('execute reports the install command when the server is missing', async () => {
  const ctx = makeContext({
    resolve: () => {
      const error = new Error('typescript-language-server not found')
      error.name = 'SubprocessExecutableNotFoundError'
      throw error
    },
    services: lspSeam,
  })
  const tool = defineStatusTool(ctx, capability, { timeoutMs: 50 })
  const report = await tool.execute({}, {})
  assert.equal(report.ok, false)
  assert.equal(report.next, 'npm install -g typescript-language-server typescript')
  assert.equal(report.checks[1].detail, 'not found on PATH')
})

test('execute never rejects when the context is broken', async () => {
  const ctx = makeContext({
    resolve: () => {
      throw new Error('unexpected')
    },
  })
  const tool = defineStatusTool(ctx, capability, { timeoutMs: 50 })
  const report = await tool.execute({}, {})
  assert.equal(typeof report.ok, 'boolean')
  assert.equal(report.checks.length, capability.checks.length)
})

test('formatReport contains labels and the failing install command', () => {
  const report = {
    capability: 'lsp',
    ok: false,
    checks: [
      { id: 'seam', label: 'LSP seam', ok: true, detail: 'mounted', install: '' },
      {
        id: 'typescript',
        label: 'typescript-language-server',
        ok: false,
        detail: 'not found on PATH',
        install: 'npm install -g typescript-language-server typescript',
      },
    ],
    next: 'npm install -g typescript-language-server typescript',
  }
  const text = formatReport(capability, report)
  for (const check of report.checks) assert.ok(text.includes(check.label))
  assert.ok(text.includes('npm install -g typescript-language-server typescript'))
})
