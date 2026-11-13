// Webhook capability descriptor. Runtime and rule mount by default; the signed ingress row ships disabled until a secret exists.

export const capability = {
  id: 'webhook',
  title: { en: 'GitHub webhooks', zh: 'GitHub Webhook' },
  blastRadius: 'ingress',
  defaultEnabled: false,
  hint: 'The signed ingress is off by default: store the webhook secret as a credential, then enable wiring-webhook-github behind TLS.',
  checks: [
    { id: 'runtime', label: 'webhook runtime', kind: 'service', service: 'webhookRuntime', install: '' },
  ],
}
