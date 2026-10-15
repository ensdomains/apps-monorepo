/**
 * Harness integrity gate — rule 7 of `e2e-build-goal.md` §5.
 *
 *     pnpm e2e:check:addresses
 *
 * > **No contract address literals in `e2e/**`.** Derive every address from the
 * > same config the apps read (`ensL1Contracts[sepolia]` / ensjs) via one
 * > generated file. Address drift caused four separate false-result incidents,
 * > including three different addresses for the same registry across three
 * > files.
 *
 * Two checks, in increasing order of what they have actually caught:
 *
 *   1. **Unaccounted literal** — a 20-byte hex literal with no allowlist entry.
 *      Fails the build. The fix is to derive it, not to add an entry.
 *   2. **Conflicting binding** — one address bound to two different identifier
 *      names. Fails the build. This is the drift incident itself: a literal
 *      cannot be `V1_PUBLIC_RESOLVER` in one file and `DEDICATED_RESOLVER` in
 *      another and be correct in both. An allowlist entry may waive it only
 *      with `conflictAcceptedUntil` — a named owner and a date, per §10.
 *
 * The regex is anchored with `\b` on both sides deliberately. Without the
 * trailing boundary it matches the first 40 characters of every 32-byte Anvil
 * private key in the tree — 23 false positives that make the gate useless.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const e2eRoot = resolve(here, '..')

const ADDRESS_RE = /\b0x[0-9a-fA-F]{40}\b/g

/** Source trees the rule applies to. */
const ROOTS = [
  'fixtures',
  'helpers',
  'projects',
  'specs',
  'scripts',
  'coverage',
]
/**
 * This file is the allowlist, so every address in it appears by definition.
 * Scanning it makes each entry conflict with its own subject.
 */
const SELF = relative(e2eRoot, fileURLToPath(import.meta.url))
const EXTENSIONS = ['.ts', '.mts', '.mjs', '.js']
const SKIP_DIRS = new Set([
  'node_modules',
  'test-results',
  'playwright-report',
  'cache',
  '.cache',
])

interface Allowance {
  /** Why this literal may stay. "It works" is not a reason. */
  reason: string
  /** A person. Required for anything with an expiry. */
  owner?: string
  /**
   * Set when the address is bound to more than one identifier and that has
   * been consciously accepted for now. ISO date. Past the date, the gate
   * fails — a deferred decision must not read as a settled one.
   */
  conflictAcceptedUntil?: string
}

/**
 * Every address literal the tree is currently allowed to contain, keyed
 * lowercase. Adding an entry is a decision; make the reason carry it.
 */
const ALLOWED: Record<string, Allowance> = {
  // ── Anvil's well-known dev accounts. EOAs, not contracts — rule 7 is about
  // contract addresses drifting between deployments. These are fixed by the
  // Anvil mnemonic and cannot drift.
  '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266': {
    reason:
      'Anvil default account #0 — fixed by the dev mnemonic, not a contract',
  },
  '0x70997970c51812dc3a010c7d01b50e0d17dc79c8': {
    reason:
      'Anvil default account #1 — fixed by the dev mnemonic, not a contract',
  },

  // ── Deliberate placeholders. Not deployments.
  '0x0000000000000000000000000000000000000001': {
    reason: 'placeholder sentinel in the indexer mock',
  },
  '0x1234567890abcdef1234567890abcdef12345678': {
    reason: 'placeholder sentinel in the agent-name seed script',
  },
  '0x00000000000000000000000000000000deadbe11': {
    reason:
      'Deliberately unrecognised resolver in migration-subname.spec.ts (GS16). The point is that it is NOT in KNOWN_PUBLIC_RESOLVERS, so it cannot come from a config — sourcing it from ensjs would defeat the fixture. Never called: classification only compares the address against the allowlist.',
  },

  // ── Canonical cross-chain deployments, identical on every network.
  '0xca11bde05977b3631167028862be2a173976ca11': {
    reason:
      'Multicall3 — same address on every chain by construction. Used in transfer.spec.ts as a contract that cannot receive ERC-1155 (F5 / E2E-002), where the point is precisely that it is a known non-receiver.',
  },

  // ── The V1 deployment. `V1_ETH_REGISTRAR_CONTROLLER` / `V1_BASE_REGISTRAR`
  // / `V1_NAME_WRAPPER` / `V1_ENS_REGISTRY` in `makeV1Name.ts` are no longer
  // literals here at all — as of iteration 23 they're imported from
  // `v1-controller-auth.ts`'s `APP_V1_*` (themselves derived from
  // `ensL1Contracts`) or from `ensjsSepolia.ensLegacyRegistry`, the same
  // canonical addresses the apps read. `V1_PUBLIC_RESOLVER` is the one
  // address that genuinely stays a literal — it isn't in ensjs's config at
  // all (see below) — so it's the only entry left in this block.
  '0x8fade66b79cc9f707ab26799354482eb93a5b7dd': {
    reason:
      'V1 PublicResolver used by `makeV1Name`. Absent from ensL1Contracts entirely, so it cannot be derived from a config — but it is NOT arbitrary: it is a member of KNOWN_PUBLIC_RESOLVERS (packages/migration/src/contracts/knownResolvers.ts), which is what makes migration classify it `to-owned-permres` instead of degrading to `keep-v1`. Chosen by measurement on 2026-09-13, not by assumption: simulating `setText` as the registry owner of a real Sepolia name showed the previous pin (0x640294a2…) reverts because its immutable `ens` is the superseded fixture registry, while this one authorises against the canonical registry and stays authorised for a wrapped name called by its NameWrapper owner. See makeV1Name.ts header.',
  },

  // ── HCA account, derived outside the e2e dependency graph.
  '0x48b9c6898bafc8a3d3a495bf7c44cf3351486628': {
    reason:
      'StandaloneHCA — derivation lives in @ens-apps/smart-account, which ships un-built .ts and is not an e2e dependency. infra/scripts/fund-rhinestone-account.sh funds this exact address; the two must stay in sync. See makeV2Name.ts.',
  },

  // ── ENSIP-25 agent-registration key. 20 bytes wide, but an identifier, not
  // an address — it is never used as a call target. The agent *record payloads*
  // that embed it are longer hex strings, so the `\b`-anchored regex correctly
  // does not see them as addresses and they need no entry.
  '0x8004a169fb4a3325136eb29fa0ceb6d2e539a432': {
    reason: 'ENSIP-25 agent identifier, not a contract address',
  },
}

// ── scan ─────────────────────────────────────────────────────────────────

interface Hit {
  address: string
  file: string
  line: number
  /** The identifier the literal is assigned to, when there is one. */
  boundTo?: string
}

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name))
      } else if (EXTENSIONS.some((e) => entry.name.endsWith(e))) {
        out.push(join(dir, entry.name))
      }
    }
  }
  for (const root of ROOTS) walk(join(e2eRoot, root))
  return out.sort()
}

/**
 * `const FOO = '0x…'` / `FOO: '0x…'` / `export const FOO =` — best effort; an
 * unbound literal simply has no name to conflict with.
 *
 * Searches back two lines as well as the current one, because the formatter
 * routinely wraps the literal onto its own line:
 *
 *     export const V1_PUBLIC_RESOLVER =
 *       '0x640294a2…' as Address
 *
 * Looking only at the literal's own line silently misses every wrapped
 * declaration — which is most of the interesting ones, and would have let the
 * conflict this gate exists to catch through unreported.
 */
function bindingFor(lines: string[], index: number): string | undefined {
  for (let i = index; i >= Math.max(0, index - 2); i--) {
    const line = lines[i]
    const named =
      /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=/.exec(line)?.[1] ??
      /^\s*([A-Za-z_$][\w$]*)\s*:\s*(?:'|"|`|$)/.exec(line)?.[1]
    if (named) return named
  }
  return undefined
}

const hits: Hit[] = []
for (const file of sourceFiles()) {
  if (relative(e2eRoot, file) === SELF) continue
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    for (const m of line.matchAll(ADDRESS_RE)) {
      hits.push({
        address: m[0].toLowerCase(),
        file: relative(e2eRoot, file),
        line: i + 1,
        boundTo: bindingFor(lines, i),
      })
    }
  })
}

// ── check 1: unaccounted literals ────────────────────────────────────────

const unaccounted = hits.filter((h) => !ALLOWED[h.address])

// ── check 2: conflicting bindings ────────────────────────────────────────

const namesByAddress = new Map<string, Map<string, string[]>>()
for (const h of hits) {
  if (!h.boundTo) continue
  const names = namesByAddress.get(h.address) ?? new Map<string, string[]>()
  names.set(h.boundTo, [...(names.get(h.boundTo) ?? []), `${h.file}:${h.line}`])
  namesByAddress.set(h.address, names)
}

const today = new Date().toISOString().slice(0, 10)
interface Conflict {
  address: string
  names: Map<string, string[]>
  waived: boolean
  expired: boolean
}
const conflicts: Conflict[] = []
for (const [address, names] of namesByAddress) {
  if (names.size < 2) continue
  const until = ALLOWED[address]?.conflictAcceptedUntil
  conflicts.push({
    address,
    names,
    waived: Boolean(until),
    expired: Boolean(until && until < today),
  })
}

// ── report ───────────────────────────────────────────────────────────────

const fatal: string[] = []

if (unaccounted.length > 0) {
  console.error('✗ Address literals with no allowlist entry (rule 7):')
  for (const h of unaccounted) {
    console.error(`    ${h.file}:${h.line}  ${h.address}`)
  }
  console.error(
    '\n  Derive these from `ensL1Contracts[sepolia]`. Add an allowlist entry only\n' +
      '  when the address genuinely cannot come from the config the apps read,\n' +
      '  and say why in the entry.\n',
  )
  fatal.push(`${unaccounted.length} unaccounted address literal(s)`)
}

for (const c of conflicts) {
  const detail = [...c.names]
    .map(([name, at]) => `      ${name.padEnd(24)} ${at.join(', ')}`)
    .join('\n')
  if (!c.waived) {
    console.error(`✗ ${c.address} is bound to ${c.names.size} different names:`)
    console.error(detail)
    fatal.push(`${c.address} has conflicting bindings`)
  } else if (c.expired) {
    console.error(
      `✗ ${c.address}: conflicting-binding waiver expired ${ALLOWED[c.address]?.conflictAcceptedUntil} (owner: ${ALLOWED[c.address]?.owner ?? 'unassigned'})`,
    )
    console.error(detail)
    fatal.push(`${c.address} waiver expired`)
  } else {
    console.warn(
      `⚠ ${c.address} is bound to ${c.names.size} names — waived until ${ALLOWED[c.address]?.conflictAcceptedUntil} (owner: ${ALLOWED[c.address]?.owner ?? 'unassigned'})`,
    )
    console.warn(detail)
  }
}

const allowedInUse = new Set(hits.map((h) => h.address))
const staleEntries = Object.keys(ALLOWED).filter((a) => !allowedInUse.has(a))
if (staleEntries.length > 0) {
  console.warn(
    `\n⚠ ${staleEntries.length} allowlist entr${staleEntries.length === 1 ? 'y no longer appears' : 'ies no longer appear'} in the tree — delete them:`,
  )
  for (const a of staleEntries) console.warn(`    ${a}`)
}

console.log(
  `\n${hits.length} address literal(s) across ${new Set(hits.map((h) => h.file)).size} file(s); ` +
    `${allowedInUse.size} distinct, all accounted for${conflicts.length > 0 ? `; ${conflicts.length} conflicting binding(s)` : ''}.`,
)

if (fatal.length > 0) {
  console.error(`\n✗ rule 7 gate failed: ${fatal.join('; ')}`)
  process.exit(1)
}
console.log('✓ rule 7 gate passed')
