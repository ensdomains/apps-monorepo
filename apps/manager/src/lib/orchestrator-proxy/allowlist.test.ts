/**
 * Tests for the orchestrator-proxy allowlist + call validation.
 * This is the security boundary that ensures the proxy only sponsors gas
 * for allowlisted ENS operations.
 */

import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { getAddress, toFunctionSelector } from 'viem'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  ALLOWED_SELECTORS,
  buildAnySelectorAllowlist,
  buildContractAllowlist,
  extractAccount,
  extractCalls,
  validateCalls,
} from './allowlist'

const sepolia = ensL1Contracts[supportedL1Chains.sepolia]
const REGISTRAR = sepolia.ensEthRegistrar.address
const REGISTRAR_CHECKSUMMED = getAddress(REGISTRAR)
const COMMIT = toFunctionSelector('function commit(bytes32 commitment)')

let contracts: Awaited<ReturnType<typeof buildContractAllowlist>>
let anySelectorContracts: Awaited<ReturnType<typeof buildAnySelectorAllowlist>>
let opts: {
  contracts: typeof contracts
  selectors: typeof ALLOWED_SELECTORS
  anySelectorContracts?: typeof anySelectorContracts
}

beforeAll(async () => {
  ;[contracts, anySelectorContracts] = await Promise.all([
    buildContractAllowlist('sepolia'),
    buildAnySelectorAllowlist('sepolia'),
  ])
  opts = { contracts, selectors: ALLOWED_SELECTORS }
})

describe('ALLOWED_SELECTORS', () => {
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
  ])('includes %s', (_label, sig) => {
    expect(ALLOWED_SELECTORS.has(toFunctionSelector(sig))).toBe(true)
  })

  it('does not include removed addOwner/removeOwner selectors', () => {
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

describe('buildContractAllowlist', () => {
  it('builds the sepolia allowlist', async () => {
    const list = await buildContractAllowlist('sepolia')
    expect(list.length).toBeGreaterThan(0)
    // Sanity: the registrar (static, ensjs-derived) is present + checksummed.
    expect(list).toContain(REGISTRAR_CHECKSUMMED)
  })

  it('throws for mainnet until V2 mainnet addresses exist (no silent mixed allowlist)', async () => {
    // The Sepolia-only DefaultReverseRegistrar / ENS_HCA_MODULE constants must
    // not leak into a mainnet allowlist — fail loudly instead.
    await expect(buildContractAllowlist('mainnet')).rejects.toThrow(
      /only supports 'sepolia'/,
    )
  })
})

describe('extractCalls', () => {
  it('reads the `calls` array', () => {
    expect(extractCalls({ calls: [{ to: '0xabc' }] })).toEqual([
      { to: '0xabc' },
    ])
  })

  it('falls back to `destinationExecutions`', () => {
    expect(extractCalls({ destinationExecutions: [{ to: '0xdef' }] })).toEqual([
      { to: '0xdef' },
    ])
  })

  it('returns [] when absent', () => {
    expect(extractCalls({})).toEqual([])
    expect(extractCalls(undefined)).toEqual([])
    expect(extractCalls(null)).toEqual([])
  })
})

describe('extractAccount', () => {
  it('checksums the account address', () => {
    expect(extractAccount({ account: REGISTRAR })).toBe(REGISTRAR_CHECKSUMMED)
  })

  it('returns null when absent or malformed', () => {
    expect(extractAccount({})).toBeNull()
    expect(extractAccount(undefined)).toBeNull()
    expect(extractAccount({ account: '0xABCDEF' })).toBeNull()
  })
})

describe('validateCalls', () => {
  it('allows allowlisted contract + selector', () => {
    expect(
      validateCalls([{ to: REGISTRAR, data: `${COMMIT}deadbeef` }], opts),
    ).toEqual({ ok: true })
  })

  it('allows call with no data (plain value transfer)', () => {
    expect(validateCalls([{ to: REGISTRAR }], opts)).toEqual({ ok: true })
  })

  it('rejects non-allowlisted contract', () => {
    const r = validateCalls(
      [{ to: '0x000000000000000000000000000000000000dead', data: COMMIT }],
      opts,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/Contract not allowlisted/)
  })

  it('rejects disallowed selector on allowlisted contract', () => {
    const r = validateCalls([{ to: REGISTRAR, data: '0xdeadbeef' }], opts)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/Selector not allowlisted/)
  })

  it('rejects empty `to`', () => {
    expect(validateCalls([{ to: '' }], opts).ok).toBe(false)
  })

  it('rejects malformed `to`', () => {
    const r = validateCalls([{ to: '0xnot-an-address', data: COMMIT }], opts)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/Invalid "to" address/)
  })

  it('matches checksummed vs lowercase addresses', () => {
    expect(
      validateCalls([{ to: REGISTRAR_CHECKSUMMED, data: COMMIT }], opts),
    ).toEqual({ ok: true })
  })

  it('allows any selector for HCA factory (opaque SDK calldata)', () => {
    expect(
      validateCalls(
        [{ to: sepolia.ensHcaFactory.address, data: '0xdeadbeef' }],
        { ...opts, anySelectorContracts },
      ),
    ).toEqual({ ok: true })
  })

  it('rejects unknown selector on HCA factory without anySelectorContracts', () => {
    expect(
      validateCalls(
        [{ to: sepolia.ensHcaFactory.address, data: '0xdeadbeef' }],
        opts,
      ).ok,
    ).toBe(false)
  })

  it('rejects bogus OwnableValidator 0x..fffe', () => {
    expect(
      validateCalls(
        [{ to: '0x000000000000000000000000000000000000fffe' }],
        opts,
      ).ok,
    ).toBe(false)
  })

  it('allows updateConfig on ENS_HCA_MODULE', () => {
    const selector = toFunctionSelector(
      'function updateConfig(uint256 t, (address addr, uint48 expiration)[] add, address[] rm)',
    )
    expect(
      validateCalls(
        [{ to: '0x5049ecBd4d961aE6DFEED9b7ccCe7f026454970E', data: selector }],
        opts,
      ),
    ).toEqual({ ok: true })
  })
})
