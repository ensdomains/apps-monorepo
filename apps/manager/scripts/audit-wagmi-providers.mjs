#!/usr/bin/env node
/**
 * Privy wagmi-takeover guardrail (Constraint #1).
 *
 * Privy is usable in our architecture ONLY if it stays signer-only and never
 * owns the wagmi connection layer. The takeover lives in a SEPARATE package,
 * `@privy-io/wagmi`, whose `createConfig`/`WagmiProvider` are drop-in
 * replacements for wagmi's own — and Privy's docs actively recommend it. This
 * script is the tripwire that keeps the omission honest:
 *
 *   - FAILS if `@privy-io/wagmi` is referenced anywhere in the workspace
 *     lockfile (someone added it as a dep), or symlinked into this app's
 *     node_modules.
 *   - FAILS if any installed vendor package (`@privy-io/*`, `@reown/*`,
 *     `@walletconnect/*`) imports `wagmi` or ships a `WagmiProvider`.
 *
 * Must run in CI as a required, merge-blocking check (see
 * .github/workflows/test.yml) and locally via `pnpm audit:wagmi-providers`.
 * Defense-in-depth pairs with the runtime `WagmiBootAssertion` in
 * src/lib/RootProviders.tsx.
 *
 * Exit code: 0 if clean, non-zero on any hit.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// scripts/ -> apps/manager
const APP_DIR = fileURLToPath(new URL('..', import.meta.url))
const ROOT = join(APP_DIR, 'node_modules')
// apps/manager -> repo root (pnpm workspace)
const WORKSPACE_LOCKFILE = fileURLToPath(
  new URL('../../../pnpm-lock.yaml', import.meta.url),
)

const NEEDLES = [/from\s+["']wagmi["']/, /WagmiProvider/]
const VENDOR_PREFIXES = ['@privy-io', '@reown', '@walletconnect']

let problems = 0

function walk(dir) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (name === 'node_modules') continue
    const full = join(dir, name)
    let s
    try {
      s = statSync(full)
    } catch {
      continue
    }
    if (s.isDirectory()) {
      walk(full)
      continue
    }
    if (!/\.(m?js|cjs|ts|tsx)$/.test(name)) continue
    if (name.endsWith('.d.ts')) continue
    let body
    try {
      body = readFileSync(full, 'utf8')
    } catch {
      continue
    }
    for (const re of NEEDLES) {
      if (re.test(body)) {
        console.log(`  hit: ${full.replace(ROOT, 'node_modules')}  (${re})`)
        problems++
        break
      }
    }
  }
}

// Belt and braces 1: fail if @privy-io/wagmi is referenced in the workspace
// lockfile at all. In a pnpm monorepo this catches the package being added as
// a dependency to ANY workspace package, before it can ever be imported.
try {
  const lock = readFileSync(WORKSPACE_LOCKFILE, 'utf8')
  if (/@privy-io\/wagmi/.test(lock)) {
    console.error(
      'FAIL: @privy-io/wagmi is present in pnpm-lock.yaml. This app must not ' +
        "use Privy's wagmi integration — it replaces our wagmi config (the " +
        'takeover Constraint #1 forbids). Remove it; use ' +
        'src/lib/privy/privy-connector.ts instead.',
    )
    process.exit(1)
  }
} catch (e) {
  if (e?.code !== 'ENOENT') throw e
  // No lockfile resolved (unexpected layout) — fall through to the dir checks.
}

// Belt and braces 2: fail if it's symlinked directly into this app.
if (existsSync(join(ROOT, '@privy-io', 'wagmi'))) {
  console.error(
    'FAIL: node_modules/@privy-io/wagmi is installed for the manager app. ' +
      'Remove it and use src/lib/privy/privy-connector.ts.',
  )
  process.exit(1)
}

for (const prefix of VENDOR_PREFIXES) {
  const dir = join(ROOT, prefix)
  console.log(`scanning ${prefix} ...`)
  walk(dir)
}

if (problems > 0) {
  console.error(
    `\nFAIL: ${problems} file(s) inside vendor packages reference wagmi. ` +
      'Inspect each hit — a vendor-shipped WagmiProvider violates Constraint #1.',
  )
  process.exit(1)
}

console.log('\nOK: no vendor package imports wagmi or ships a WagmiProvider.')
