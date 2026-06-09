#!/usr/bin/env node
/**
 * Privy wagmi-takeover guardrail (Constraint #1). Privy must stay signer-only
 * and never own the wagmi layer — but `@privy-io/wagmi` (which Privy's docs
 * recommend) is a drop-in replacement for wagmi's createConfig/WagmiProvider.
 * This merge-blocking CI check (test.yml; `pnpm audit:wagmi-providers`) fails if:
 *   - `@privy-io/wagmi` is in the workspace lockfile or this app's node_modules
 *   - any installed @privy-io/* / @reown/* / @walletconnect/* package imports
 *     wagmi or ships a WagmiProvider
 * Pairs with the runtime WagmiBootAssertion. Exit 0 clean, non-zero on a hit.
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

// Match genuine takeover signals, not incidental prose/strings (a bare
// /WagmiProvider/ matched comments/examples): real imports, requires, and
// WagmiProvider symbol definitions / (re-)exports.
const NEEDLES = [
  // a vendor module importing wagmi (the takeover re-exports wagmi internals)
  /\bfrom\s+["']wagmi["']/,
  /\brequire\(\s*["']wagmi["']\s*\)/,
  // importing the takeover package itself
  /\bfrom\s+["']@privy-io\/wagmi["']/,
  // declaring, importing, or (re-)exporting a WagmiProvider symbol — i.e. the
  // identifier inside an import/export/declaration statement, not free text
  /\b(?:import|export|const|let|var|function|class)\b[^;\n]*\bWagmiProvider\b/,
  /\bWagmiProvider\s*[=:]/,
]
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
