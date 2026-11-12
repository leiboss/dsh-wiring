/**
 * dsh-wiring engine: bounded, read-only capability probes plus one
 * `<capability>_status` doctor tool per capability.
 *
 * Zero runtime dependencies. The host supplies every service through the
 * plugin context; this module never imports `@deepseek-ai/*`.
 * @module @local/dsh-wiring
 */

import { existsSync } from 'node:fs'
import { capability as browser } from './capabilities/browser.js'
import { capability as lsp } from './capabilities/lsp.js'

const DEFAULT_TIMEOUT_MS = 1500
const MAX_DETAIL_CHARS = 160
const TIMEOUT = Symbol('timeout')

/** Every capability this bundle wires. Add a module here to extend the set. */
const capabilities = [lsp, browser]

export const name = 'wiring'
export const inject = ['subprocess', 'tools']

/**
 * @typedef {object} Check
 * @property {string} id Stable report key.
 * @property {string} label Human-readable label.
 * @property {'command'|'path'|'paths'|'service'} kind Probe strategy.
 * @property {string} [command] Executable to resolve on PATH.
 * @property {string} [path] Absolute path to test for existence.
 * @property {string[]} [paths] kind=paths: candidate absolute paths; any hit passes.
 * @property {string} [service] Context service name to look up.
 * @property {string} [install] Copy-pasteable install command.
 * @property {string} [hint] Extra non-command guidance.
 */

/**
 * @typedef {object} CheckResult
 * @property {string} id
 * @property {string} label
 * @property {boolean} ok
 * @property {string} detail Single line, at most 160 characters.
 * @property {string} install
 */

/**
 * @typedef {object} Report
 * @property {string} capability
 * @property {boolean} ok
 * @property {CheckResult[]} checks
 * @property {string} next
 */

/** Collapse whitespace to one line and bound the detail length. */
function oneLine(value) {
  return String(value).replace(/\s+/g, ' ').trim().slice(0, MAX_DETAIL_CHARS)
}

/** @returns {CheckResult} */
function resultOf(check, ok, detail) {
  const install = typeof check.install === 'string' ? check.install : ''
  return { id: check.id, label: check.label, ok, detail: oneLine(detail), install }
}

/** Recognise the host's stable executable-miss error without importing it. */
function isNotFound(error) {
  return error?.name === 'SubprocessExecutableNotFoundError' || error?.code === 'ENOENT'
}

/** Run one probe; `command` is the only asynchronous kind. @returns {Promise<{ok: boolean, detail: string}>} */
async function probe(ctx, check, signal) {
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
    case 'command': {
      const resolved = await ctx.subprocess.resolveExecutable(check.command, undefined, signal)
      return { ok: true, detail: resolved }
    }
    default:
      throw new Error(`unknown check kind: ${String(check.kind)}`)
  }
}

/**
 * Probe one check under its own timeout. Never rejects: every failure becomes
 * a report row, so a broken probe cannot take down the tool call.
 * @returns {Promise<CheckResult>}
 */
async function runCheck(ctx, check, timeoutMs) {
  const controller = new AbortController()
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve(TIMEOUT)
    }, timeoutMs)
  })

  try {
    const outcome = await Promise.race([probe(ctx, check, controller.signal), timeout])
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

/**
 * Run every check concurrently; each has its own budget, so one slow probe
 * never starves the rest.
 * @param {object} ctx
 * @param {Check[]} checks
 * @param {{timeoutMs?: number}} [options]
 * @returns {Promise<CheckResult[]>}
 */
export async function runChecks(ctx, checks, options = {}) {
  const timeoutMs =
    Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_TIMEOUT_MS
  const list = Array.isArray(checks) ? checks : []
  return Promise.all(list.map((check) => runCheck(ctx, check, timeoutMs)))
}

/** Fold raw results into the stable, schema-shaped report. @returns {Report} */
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

/**
 * Render a report as plain text for the model.
 * @param {object} capability
 * @param {Report} report
 * @returns {string}
 */
export function formatReport(capability, report) {
  const title = capability?.title?.en ?? report.capability
  const lines = [`${report.capability} (${title}): ${report.ok ? 'ready' : 'degraded'}`]
  for (const check of report.checks) {
    lines.push(`${check.ok ? 'ok' : 'FAIL'} ${check.label}: ${check.detail}`)
    if (!check.ok && check.install) lines.push(`  install: ${check.install}`)
  }
  if (!report.ok && report.next) lines.push(`next: ${report.next}`)
  const hint = (report.hint ?? '').trim()
  if (hint !== '') lines.push('', hint)
  return lines.join('\n')
}

/** The exact canonical output contract every doctor shares. */
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

/**
 * Build the read-only `<capability>_status` tool. Probing starts only when the
 * model calls `execute`, and `execute` never rejects.
 * @param {object} ctx
 * @param {object} capability
 * @param {{timeoutMs?: number}} [options]
 * @returns {object} A hand-written ToolDefinition.
 */
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
    async execute() {
      try {
        const results = await runChecks(ctx, capability.checks, { timeoutMs })
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

/**
 * Register one doctor tool per capability inside the host effect scope, so a
 * plugin reload disposes and re-registers exactly once.
 * @param {object} ctx
 */
export function apply(ctx) {
  for (const capability of capabilities) {
    ctx.effect(() =>
      ctx.tools.register(defineStatusTool(ctx, capability, { timeoutMs: DEFAULT_TIMEOUT_MS })),
    )
  }
}
