#!/usr/bin/env node
/**
 * Sign a GitHub webhook payload for a local DSH profile.
 * Usage: node scripts/sign.mjs <payload.json> <secret>
 * Prints the three GitHub headers plus a copy-pasteable curl command.
 */

import { createHmac, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

const [file, secret] = process.argv.slice(2)

if (file === undefined || secret === undefined) {
  console.error('usage: node scripts/sign.mjs <payload.json> <secret>')
  process.exit(1)
}

const body = readFileSync(file)
const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
const delivery = randomUUID()

console.log(`X-Hub-Signature-256: ${signature}`)
console.log(`X-GitHub-Delivery: ${delivery}`)
console.log('X-GitHub-Event: pull_request')
console.log('')
console.log('curl.exe -X POST http://127.0.0.1:3080/webhook/github \\')
console.log('  -H "Content-Type: application/json" \\')
console.log(`  -H "X-Hub-Signature-256: ${signature}" \\`)
console.log(`  -H "X-GitHub-Delivery: ${delivery}" \\`)
console.log('  -H "X-GitHub-Event: pull_request" \\')
console.log(`  --data-binary "@${file}"`)
