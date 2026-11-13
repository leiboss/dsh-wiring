/** dsh-wiring engine: bounded, read-only probes plus one `<capability>_status` tool per capability. */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { capability as browser } from './capabilities/browser.js'
import { capability as lsp } from './capabilities/lsp.js'
import { capability as webhook } from './capabilities/webhook.js'

const DEFAULT_TIMEOUT_MS = 1500
const MAX_DETAIL_CHARS = 160
const TIMEOUT = Symbol('timeout')

// every capability this bundle wires; add a module here to extend the set
const capabilities = [lsp, browser, webhook]

export const name = 'wiring'
export const inject = ['subprocess', 'tools']

// collapse whitespace and bound the detail length
function oneLine(value) {
  return String(value).replace(/\s+/g, ' ').trim().slice(0, MAX_DETAIL_CHARS)
}

function resultOf(check, ok, detail) {
  const install = typeof check.install === 'string' ? check.install : ''
  return { id: check.id, label: check.label, ok, detail: oneLine(detail), install }
}

// recognise the host's executable-miss error without importing it
function isNotFound(error) {
  return error?.name === 'SubprocessExecutableNotFoundError' || error?.code === 'ENOENT'
}

async function probe(ctx, check, signal, cwd) {
  switch (check.kind) {
    case 'service':
      return ctx.get(check.service) === undefined
        ? { ok: false, detail: 'service unavailable' }
        : { ok: true, detail: 'mounted' }
    case 'path':
      return existsSync(check.path)
        ? { ok: true, detail: check.path }
        : { ok: false, detail: 'not found on PATH' }
    case 'paths': {
      const paths = Array.isArray(check.paths) ? check.paths : []
      const found = paths.find((candidate) => existsSync(candidate))
      return found === undefined
        ? { ok: false, detail: 'not found' }
        : { ok: true, detail: found }
    }
    case 'workspacePath': {
      const segments = String(check.path ?? '').split('/')
      const resolved = join(cwd, ...segments)
      return existsSync(resolved)
        ? { ok: true, detail: resolved }
        : { ok: false, detail: 'not found' }
    }
    case 'command': {
      const resolved = await ctx.subprocess.resolveExecutable(check.command, undefined, signal)
      return { ok: true, detail: resolved }
    }
    default:
      throw new Error(`unknown check kind: ${String(check.kind)}`)
  }
}

// never rejects: a failed probe becomes a report row
async function runCheck(ctx, check, timeoutMs, cwd) {
  const controller = new AbortController()
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve(TIMEOUT)
    }, timeoutMs)
  })

  try {
    const outcome = await Promise.race([probe(ctx, check, controller.signal, cwd), timeout])
    if (outcome === TIMEOUT) return resultOf(check, false, 'timeout')
    return resultOf(check, outcome.ok, outcome.detail)
  } catch (error) {
    if (isNotFound(error)) return resultOf(check, false, 'not found on PATH')
    const message = error instanceof Error ? error.message : String(error)
    return resultOf(check, false, `error: ${message}`)
  } finally {
    clearTimeout(timer)
  }
}

/** Run every check concurrently; each has its own timeout budget. */
export async function runChecks(ctx, checks, options = {}) {
  const timeoutMs =
    Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_TIMEOUT_MS
  const cwd = typeof options.cwd === 'string' && options.cwd !== '' ? options.cwd : process.cwd()
  const list = Array.isArray(checks) ? checks : []
  return Promise.all(list.map((check) => runCheck(ctx, check, timeoutMs, cwd)))
}

function buildReport(capability, results) {
  const firstFailure = results.find((result) => !result.ok)
  return {
    capability: capability.id,
    ok: results.every((result) => result.ok),
    checks: results,
    hint: capability.hint ?? '',
    next: firstFailure === undefined ? '' : firstFailure.install,
  }
}

/** Render a report as plain text for the model. */
export function formatReport(capability, report) {
  const title = capability?.title?.en ?? report.capability
  const lines = [`${report.capability} (${title}): ${report.ok ? 'ready' : 'degraded'}`]
  const meta = new Map((capability?.checks ?? []).map((check) => [check.id, check]))
  for (const check of report.checks) {
    lines.push(`${check.ok ? 'ok' : 'FAIL'} ${check.label}: ${check.detail}`)
    if (check.ok) continue
    if (check.install) lines.push(`  install: ${check.install}`)
    const hint = meta.get(check.id)?.hint
    if (typeof hint === 'string' && hint !== '') lines.push(`  ${hint}`)
  }
  if (!report.ok && report.next) lines.push(`next: ${report.next}`)
  const hint = (report.hint ?? '').trim()
  if (hint !== '') lines.push('', hint)
  return lines.join('\n')
}

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    capability: { type: 'string' },
    ok: { type: 'boolean' },
    checks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          ok: { type: 'boolean' },
          detail: { type: 'string' },
          install: { type: 'string' },
        },
        required: ['id', 'label', 'ok', 'detail', 'install'],
        additionalProperties: false,
      },
    },
    next: { type: 'string' },
    hint: { type: 'string' },
  },
  required: ['capability', 'ok', 'checks', 'next', 'hint'],
  additionalProperties: false,
}

/** Build the read-only `<capability>_status` tool; `execute` never rejects. */
export function defineStatusTool(ctx, capability, options = {}) {
  const timeoutMs =
    Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_TIMEOUT_MS
  const title = capability.title?.en ?? capability.id

  return {
    name: `${capability.id}_status`,
    description:
      `Report whether this machine has the ${capability.id} capability (${title}): ` +
      'which checks pass, what is missing, and the exact command that installs it. ' +
      `Call it before depending on ${capability.id}, or after a ${capability.id} failure.`,
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: OUTPUT_SCHEMA,
      render(_args, value) {
        return [{ type: 'text', text: formatReport(capability, value) }]
      },
    },
    async execute(_args, exec) {
      const cwd = exec?.agent?.session?.header?.cwd ?? process.cwd()
      try {
        const results = await runChecks(ctx, capability.checks, { timeoutMs, cwd })
        return buildReport(capability, results)
      } catch {
        return {
          capability: capability.id,
          ok: false,
          checks: [],
          next: '',
          hint: capability.hint ?? '',
        }
      }
    },
  }
}

/** Register one doctor tool per capability in the host effect scope. */
export function apply(ctx) {
  for (const capability of capabilities) {
    ctx.effect(() =>
      ctx.tools.register(defineStatusTool(ctx, capability, { timeoutMs: DEFAULT_TIMEOUT_MS })),
    )
  }
}
