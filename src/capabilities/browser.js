/**
 * Browser capability descriptor: the Playwright MCP provider ships disabled
 * because a startup failure rejects Session creation.
 * @module @local/dsh-wiring/capabilities/browser
 */

import { join } from 'node:path'

const env = process.env

function windowsPaths() {
  const bases = [env['PROGRAMFILES'], env['PROGRAMFILES(X86)'], env['LOCALAPPDATA']]
    .filter((base) => typeof base === 'string' && base.length > 0)
  const paths = []
  for (const base of bases) {
    paths.push(join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'))
    paths.push(join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))
    paths.push(join(base, 'Chromium', 'Application', 'chrome.exe'))
  }
  return paths
}

const CHROMIUM_PATHS = process.platform === 'win32'
  ? windowsPaths()
  : process.platform === 'darwin'
    ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
      ]
    : [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/microsoft-edge',
      ]

export const capability = {
  id: 'browser',
  title: { en: 'Browser use', zh: '浏览器' },
  blastRadius: 'session',
  defaultEnabled: false,
  hint: 'The provider row ships disabled because a startup failure rejects Session creation. Install a Chromium (or run the command below), then enable the row with plugin_manager set_plugin on include:wiring-browser-playwright, and start a new Session — existing Sessions are never adopted.',
  checks: [
    { id: 'seam', label: 'browser-use seam', kind: 'service', service: 'browserUse', install: '' },
    { id: 'chromium', label: 'Chromium-family browser', kind: 'paths', paths: CHROMIUM_PATHS, install: 'npx playwright install chromium' },
  ],
}
