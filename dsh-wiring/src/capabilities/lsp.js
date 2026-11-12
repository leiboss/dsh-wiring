/**
 * LSP capability descriptor: what to probe before the `lsp` tool is trusted.
 * @module @local/dsh-wiring/capabilities/lsp
 */

export const capability = {
  id: 'lsp',
  title: { en: 'Language servers', zh: '语言服务器' },
  blastRadius: 'tool',
  defaultEnabled: true,
  checks: [
    {
      id: 'seam',
      label: 'LSP seam',
      kind: 'service',
      service: 'lsp',
      install: '',
      hint: 'the wiring-lsp row did not activate',
    },
    {
      id: 'typescript',
      label: 'typescript-language-server',
      kind: 'command',
      command: 'typescript-language-server',
      install: 'npm install -g typescript-language-server typescript',
    },
  ],
}
