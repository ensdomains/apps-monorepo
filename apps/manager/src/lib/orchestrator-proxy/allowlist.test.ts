/**
 * Tests for the orchestrator-proxy allowlist + call validation. This is the
 * security boundary that ensures the proxy only sponsors gas for allowlisted
 * ENS operations, so it is worth covering directly.
 */

import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { getAddress, toFunctionSelector } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  ALLOWED_SELECTORS,
  buildAnySelectorAllowlist,
  buildContractAllowlist,
  extractAccount,
  extractCalls,
  validateCalls,
} from './allowlist'

const sepolia = ensL1Contracts[supportedL1Chains.sepolia]
// ensjs returns this lowercased; the checksummed form is what wallets send.
const REGISTRAR = sepolia.ensEthRegistrar.address
const REGISTRAR_CHECKSUMMED = getAddress(REGISTRAR)
// `commit(bytes32)` is in ALLOWED_SELECTORS (derived from the same snippet in
// allowlist.ts). Using the human-readable signature here keeps the test simple.
const COMMIT_SELECTOR = toFunctionSelector(
  'function commit(bytes32 commitment)',
)

describe('ALLOWED_SELECTORS', () => {
  // Every sponsored call path the manager emits must be allowlisted, or the
  // proxy 403s legitimate intents. See the audit in PR #914.
  it.each([
    ['commit', 'function commit(bytes32 c)'],
    [
      'register',
      'function register(string n, address o, bytes32 s, address r, address sr, uint64 d, address rf, bytes32 e)',
    ],
    ['renew (v2)', 'function renew(string n, uint64 d, address r, bytes32 e)'],
    ['renew (V1)', 'function renew(string n, uint256 d)'],
    ['approve', 'function approve(address s, uint256 a)'],
    [
      'permit',
      'function permit(address o, address s, uint256 v, uint256 dl, uint8 vv, bytes32 r, bytes32 ss)',
    ],
    ['deployProxy', 'function deployProxy(address i, uint256 s, bytes d)'],
    ['setResolver', 'function setResolver(uint256 id, address r)'],
    ['setName', 'function setName(string n)'],
    [
      'setNameForAddrWithSignature',
      'function setNameForAddrWithSignature(address a, uint256 ct, string n, uint256[] cts, bytes sig)',
    ],
    [
      'updateConfig',
      'function updateConfig(uint256 t, (address addr, uint48 expiration)[] add, address[] rm)',
    ],
  ])('includes the %s selector', (_label, sig) => {
    expect(ALLOWED_SELECTORS.has(toFunctionSelector(sig))).toBe(true)
  })

  it('does NOT include removed selectors (addOwner/removeOwner/makeCommitment)', () => {
    expect(
      ALLOWED_SELECTORS.has(
        toFunctionSelector('function addOwner(address o, uint48 e)'),
      ),
    ).toBe(false)
    expect(
      ALLOWED_SELECTORS.has(
        toFunctionSelector('function removeOwner(address o)'),
      ),
    ).toBe(false)
  })
})

describe('extractCalls', () => {
  it('reads the `calls` array', () => {
    expect(extractCalls({ calls: [{ to: '0xabc' }] })).toEqual([
      { to: '0xabc' },
    ])
  })

  it('reads `destinationExecutions` as a fallback', () => {
    expect(extractCalls({ destinationExecutions: [{ to: '0xdef' }] })).toEqual([
      { to: '0xdef' },
    ])
  })

  it('returns [] for bodies without calls', () => {
    expect(extractCalls({})).toEqual([])
    expect(extractCalls(undefined)).toEqual([])
    expect(extractCalls(null)).toEqual([])
  })
})

describe('extractAccount', () => {
  it('returns the checksummed account address', () => {
    expect(extractAccount({ account: REGISTRAR })).toBe(REGISTRAR_CHECKSUMMED)
  })

  it('returns null when absent or malformed', () => {
    expect(extractAccount({})).toBeNull()
    expect(extractAccount(undefined)).toBeNull()
    expect(extractAccount({ account: '0xABCDEF' })).toBeNull()
  })
})

describe('validateCalls', () => {
  it('allows an allowlisted contract + selector', async () => {
    const contracts = await buildContractAllowlist('sepolia')
    const result = validateCalls(
      [{ to: REGISTRAR, data: `${COMMIT_SELECTOR}deadbeef` }],
      { contracts, selectors: ALLOWED_SELECTORS },
    )
    expect(result).toEqual({ ok: true })
  })

  it('allows a call with no data (plain value transfer to allowlisted)', async () => {
    const contracts = await buildContractAllowlist('sepolia')
    const result = validateCalls([{ to: REGISTRAR }], {
      contracts,
      selectors: ALLOWED_SELECTORS,
    })
    expect(result).toEqual({ ok: true })
  })

  it('rejects a non-allowlisted contract', async () => {
    const contracts = await buildContractAllowlist('sepolia')
    const result = validateCalls(
      [
        {
          to: '0x000000000000000000000000000000000000dead',
          data: COMMIT_SELECTOR,
        },
      ],
      { contracts, selectors: ALLOWED_SELECTORS },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/Contract not allowlisted/)
  })

  it('rejects an allowlisted contract with a disallowed selector', async () => {
    const contracts = await buildContractAllowlist('sepolia')
    const result = validateCalls([{ to: REGISTRAR, data: '0xdeadbeef' }], {
      contracts,
      selectors: ALLOWED_SELECTORS,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/Selector not allowlisted/)
  })

  it('rejects a call missing a `to` address', async () => {
    const contracts = await buildContractAllowlist('sepolia')
    const result = validateCalls([{ to: '' }], {
      contracts,
      selectors: ALLOWED_SELECTORS,
    })
    expect(result.ok).toBe(false)
  })

  it('rejects a malformed `to` address', async () => {
    const contracts = await buildContractAllowlist('sepolia')
    const result = validateCalls(
      [{ to: '0xnot-an-address', data: COMMIT_SELECTOR }],
      {
        contracts,
        selectors: ALLOWED_SELECTORS,
      },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/Invalid "to" address/)
  })

  it('matches regardless of address casing (checksummed vs lowercase)', async () => {
    const contracts = await buildContractAllowlist('sepolia')
    // ensjs sources the allowlist lowercased; a checksummed incoming address
    // must still match (and vice-versa) via isAddressEqual.
    const result = validateCalls(
      [{ to: REGISTRAR_CHECKSUMMED, data: COMMIT_SELECTOR }],
      { contracts, selectors: ALLOWED_SELECTORS },
    )
    expect(result).toEqual({ ok: true })
  })

  it('allows any selector for the HCA factory (opaque deploy calldata)', async () => {
    const [contracts, anySelectorContracts] = await Promise.all([
      buildContractAllowlist('sepolia'),
      buildAnySelectorAllowlist('sepolia'),
    ])
    const factory = sepolia.ensHcaFactory.address
    // Arbitrary SDK-generated factoryData selector — must pass.
    const result = validateCalls([{ to: factory, data: '0xdeadbeef' }], {
      contracts,
      selectors: ALLOWED_SELECTORS,
      anySelectorContracts,
    })
    expect(result).toEqual({ ok: true })
  })

  it('still rejects an unknown selector on the HCA factory when not in anySelector set', async () => {
    const contracts = await buildContractAllowlist('sepolia')
    const factory = sepolia.ensHcaFactory.address
    // Without anySelectorContracts, the factory isn't a regular allowlisted
    // contract, so it's rejected — guards against accidentally widening it.
    const result = validateCalls([{ to: factory, data: '0xdeadbeef' }], {
      contracts,
      selectors: ALLOWED_SELECTORS,
    })
    expect(result.ok).toBe(false)
  })

  it('rejects the bogus OwnableValidator 0x..fffe (removed)', async () => {
    const contracts = await buildContractAllowlist('sepolia')
    const result = validateCalls(
      [{ to: '0x000000000000000000000000000000000000fffe' }],
      { contracts, selectors: ALLOWED_SELECTORS },
    )
    expect(result.ok).toBe(false)
  })

  it('allows the session-enable updateConfig on the HCA module', async () => {
    const contracts = await buildContractAllowlist('sepolia')
    const result = validateCalls(
      [
        {
          to: '0x5049ecBd4d961aE6DFEED9b7ccCe7f026454970E',
          data: toFunctionSelector(
            'function updateConfig(uint256 t, (address addr, uint48 expiration)[] add, address[] rm)',
          ),
        },
      ],
      { contracts, selectors: ALLOWED_SELECTORS },
    )
    expect(result).toEqual({ ok: true })
  })
})
