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
  buildContractAllowlist,
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
  it('includes the eth-registrar commit selector', () => {
    expect(ALLOWED_SELECTORS.has(COMMIT_SELECTOR)).toBe(true)
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
})
