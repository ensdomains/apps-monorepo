/**
 * Seed .eth names carrying ENSIP-25 `agent-registration` text records on the
 * local Anvil fork, for MANUAL QA of the manager profile "Agents" card
 * (WEB-569 / PR #933). Reuses the SAME `createMakeV2Name` on-chain flow as the
 * e2e tests (register + setText via PermissionedResolver), but runs standalone
 * and relies on the real panoptes indexer for record discovery (NOT the
 * Playwright route mock the e2e spec uses).
 *
 * Prereqs:
 *   - Local stack up:  pnpm --filter @ens-apps/e2e infra:up
 *   - ANVIL_RPC_URL default http://127.0.0.1:8545
 *
 * Usage:
 *   pnpm --filter @ens-apps/e2e exec tsx scripts/seed-agent-names.ts
 *   ONLY=known pnpm --filter @ens-apps/e2e exec tsx scripts/seed-agent-names.ts
 */
import { createMakeV2Name } from '../fixtures/makeV2Name.js'
import { publicClient } from '../helpers/anvil-client.js'

const KNOWN_8004 = '0x8004a169fb4a3325136eb29fa0ceb6d2e539a432'
const UNKNOWN_REGISTRY = '0x1234567890abcdef1234567890abcdef12345678'

/**
 * Encode an ERC-7930 binary interoperable address for an EVM chain.
 * Layout: version(0001) chainType(0000, EVM) chainRefLen(1B) chainRef(nB)
 *         addressLen(0x14=20) address(20B).
 */
function encodeErc7930(chainId: number, address: string): string {
  const addr = address.toLowerCase().replace(/^0x/, '')
  let ref = chainId.toString(16)
  if (ref.length % 2) ref = `0${ref}`
  const refLen = (ref.length / 2).toString(16).padStart(2, '0')
  return `0x0001${'0000'}${refLen}${ref}14${addr}`
}

const agentKey = (chainId: number, registry: string, agentId: string) =>
  `agent-registration[${encodeErc7930(chainId, registry)}][${agentId}]`

type Fixture = {
  id: string
  label: string
  records: { key: string; value: string }[]
  expect: string
}

const FIXTURES: Fixture[] = [
  {
    id: 'known',
    label: 'agentknown',
    records: [{ key: agentKey(1, KNOWN_8004, '19151'), value: '1' }],
    expect: 'Agents card → Registry "8004.eth", Agent ID 19151, chain ethereum',
  },
  {
    id: 'unknownreg',
    label: 'agentunknownreg',
    records: [{ key: agentKey(1, UNKNOWN_REGISTRY, '42'), value: '1' }],
    expect:
      'Agents card → Registry "0x1234...5678" (truncated fallback), Agent ID 42',
  },
  {
    id: 'unknownchain',
    label: 'agentunknownchain',
    records: [{ key: agentKey(424242, KNOWN_8004, '7'), value: '1' }],
    expect:
      'Agents card → Registry truncated (known-map is chain-1 only), chain "chain:424242"',
  },
  {
    id: 'base',
    label: 'agentbasechain',
    records: [{ key: agentKey(8453, UNKNOWN_REGISTRY, '99'), value: '1' }],
    expect: 'Agents card → chain "base", truncated registry, Agent ID 99',
  },
  {
    id: 'invalid',
    label: 'agentinvalid',
    // Version bytes 0002 (not 0001) → ERC-7930 decode fails → NOT an agent card.
    records: [
      {
        key: `agent-registration[0x000200000101148004a169fb4a3325136eb29fa0ceb6d2e539a432][500]`,
        value: '1',
      },
    ],
    expect: 'NO Agents card (invalid ERC-7930) — must not crash; falls through',
  },
  {
    id: 'multi',
    label: 'agentmulti',
    records: [
      { key: agentKey(1, KNOWN_8004, '1001'), value: '1' },
      { key: agentKey(1, KNOWN_8004, '1002'), value: '1' },
    ],
    expect: 'Two Agents cards (1001, 1002)',
  },
  {
    id: 'mixed',
    label: 'agentmixed',
    records: [
      { key: agentKey(1, KNOWN_8004, '2024'), value: '1' },
      { key: 'com.twitter', value: 'ensdomains' },
      { key: 'url', value: 'https://ens.domains' },
      { key: 'description', value: 'Agent + normal records coexist' },
    ],
    expect: 'Agents card (2024) AND Social/links sections render together',
  },

  // ── Adversarial: over-permissive parse/decode (bigint / charliecreates review) ──
  // Per ENSIP-25 these are MALFORMED and should be REJECTED (fall through to
  // unknown → no agent card). The current parser (lastIndexOf) + decoder
  // (no exact-consumption / hex-only check) accept several of them, so these
  // tests document the bug and flip to PASS once strict validation lands.
  {
    id: 'adv-trailing-chars',
    label: 'agentadvtrailchars',
    // Junk after the final ']' — parser's lastIndexOf(']') ignores it → agentId "19151".
    records: [
      {
        key: `${agentKey(1, KNOWN_8004, '19151')}TRAILING`,
        value: '1',
      },
    ],
    expect: 'SHOULD reject (no card). BUG: currently renders card 19151',
  },
  {
    id: 'adv-trailing-bytes',
    label: 'agentadvtrailbytes',
    // 4 extra bytes (deadbeef) after the 20-byte address — decoder ignores the tail.
    records: [
      {
        key: `agent-registration[0x000100000101148004a169fb4a3325136eb29fa0ceb6d2e539a432deadbeef][777]`,
        value: '1',
      },
    ],
    expect:
      'SHOULD reject (no card). BUG: currently renders card 777 (registry 8004.eth)',
  },
  {
    id: 'adv-nonhex',
    label: 'agentadvnonhex',
    // 40 non-hex chars where the address should be — decoder never checks hex-only.
    records: [
      {
        key: `agent-registration[0x00010000010114zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz][888]`,
        value: '1',
      },
    ],
    expect:
      'SHOULD reject (no card). BUG: currently renders card 888 with a 0xzzzz… registry',
  },
  {
    id: 'adv-extra-brackets',
    label: 'agentadvbrackets',
    // Extra [..] section — parser accepts agentId "1][2".
    records: [
      {
        key: `agent-registration[0x000100000101148004a169fb4a3325136eb29fa0ceb6d2e539a432][1][2]`,
        value: '1',
      },
    ],
    expect:
      'SHOULD reject (no card). BUG: currently renders card with agentId "1][2"',
  },
  {
    id: 'adv-empty-id',
    label: 'agentadvemptyid',
    // Empty agent id — parser's agentIdEnd<=agentIdStart guard rejects this one.
    records: [
      {
        key: `agent-registration[0x000100000101148004a169fb4a3325136eb29fa0ceb6d2e539a432][]`,
        value: '1',
      },
    ],
    expect:
      'CONTROL: correctly rejected today (no card) — parser guards empty id',
  },
]

async function main() {
  const only = process.env.ONLY?.trim()
  const selected = only ? FIXTURES.filter((f) => f.id === only) : FIXTURES
  if (selected.length === 0) {
    throw new Error(
      `ONLY="${only}" matched no fixture. Ids: ${FIXTURES.map((f) => f.id).join(', ')}`,
    )
  }

  // Active names (~1y), owned by the connected Para EOA. Owner is irrelevant to
  // the public "Agents" card, which is not owner-gated.
  const makeV2Name = createMakeV2Name({})
  const results: { name: string; expect: string; records: string[] }[] = []

  for (const f of selected) {
    console.log(`\n=== seeding ${f.label} ===`)
    const name = await makeV2Name({
      label: f.label,
      duration: 365 * 24 * 60 * 60,
      owner: 'user',
      records: f.records,
    })
    results.push({
      name,
      expect: f.expect,
      records: f.records.map((r) => r.key),
    })
  }

  const block = await publicClient.getBlock()
  console.log('\n════════════════════ SEEDED ════════════════════')
  for (const r of results) {
    console.log(`\n  Profile:  /${r.name}`)
    console.log(`  Expect:   ${r.expect}`)
    for (const k of r.records) console.log(`    key: ${k}`)
  }
  console.log(
    `\n  Anvil block time: ${new Date(Number(block.timestamp) * 1000).toISOString()}`,
  )
  console.log('═════════════════════════════════════════════════\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
