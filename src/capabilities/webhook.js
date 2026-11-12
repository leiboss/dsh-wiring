/**
 * Webhook capability descriptor: the runtime and the pull_request rule mount by
 * default, the signed GitHub ingress row ships disabled until a secret exists.
 * @module @local/dsh-wiring/capabilities/webhook
 */

export const capability = {
  id: 'webhook',
  title: { en: 'GitHub webhooks', zh: 'GitHub Webhook' },
  blastRadius: 'ingress',
  defaultEnabled: false,
  hint: 'The signed ingress row (wiring-webhook-github) ships disabled: it needs a webhook secret and must sit behind TLS. Store the secret as a credential record whose key matches secretEnv, enable the row, and keep /webhook/github unreachable from the public internet without the proxy. A 202 only means "verified and dispatched" — it does not prove a Session was created.',
  checks: [
    { id: 'runtime', label: 'webhook runtime', kind: 'service', service: 'webhookRuntime', install: '' },
  ],
}
