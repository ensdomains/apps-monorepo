import { expect } from '@playwright/test'

/**
 * Asserts a running dev server was built against the local Anvil RPC.
 *
 * "The app is serving" is not "the app is on the right chain": an app built
 * against public Sepolia answers HTTP 200, cannot see a single fixture name,
 * and turns every "not found" into a false negative. This reads the dev
 * server's own transformed modules, so it reflects what the running app was
 * built with, not what a file on disk currently says. The RPC is inlined
 * wherever a module reads `import.meta.env`: the portal's wagmi module does,
 * the manager's reads it through config.ts.
 */
export async function expectAppOnLocalFork(
  appName: 'portal' | 'manager',
  baseUrl: string,
) {
  let source = ''
  for (const path of ['/src/lib/wagmi.ts', '/src/config.ts']) {
    const res = await fetch(`${baseUrl}${path}`)
    expect(
      res.ok,
      `could not read ${appName}'s ${path} from ${baseUrl} — is the dev server running?`,
    ).toBe(true)
    source += await res.text()
  }
  expect(
    source,
    `${appName} is not configured with the local Anvil RPC. It is serving, but against a different chain, so every fixture this suite creates is invisible to it and every "not found" it reports is a false negative. Check apps/${appName}/.env{,.local} and restart the dev server.`,
  ).toContain('127.0.0.1:8545')
}
