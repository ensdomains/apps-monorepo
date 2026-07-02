import { getAddress, toFunctionSelector } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  ALLOWED_SELECTORS,
  ALLOWLIST_BY_CHAIN_ID,
  type ResolvedAllowlist,
  resolveAllowlist,
  validateCalls,
} from './allowlist'

const SEPOLIA = 11155111
const DEFAULT_REVERSE_REGISTRAR = '0xeb8269fb39290f31c4c29cec548807ca2133abb4'

// Synthetic allowlist for the pure-logic cases: one gated contract, one
// any-selector contract, one allowed selector.
const GATED = '0x1111111111111111111111111111111111111111'
const ANY = '0x2222222222222222222222222222222222222222'
const OUTSIDE = '0x3333333333333333333333333333333333333333'
const SETNAME = toFunctionSelector('function setName(string name)')
const TRANSFER = toFunctionSelector(
  'function transfer(address to, uint256 amount)',
)

const synthetic: ResolvedAllowlist = {
  contracts: [getAddress(GATED)],
  anySelectorContracts: [getAddress(ANY)],
  selectors: new Set([SETNAME]),
}

describe('validateCalls', () => {
  it('allows an empty call list', () => {
    expect(validateCalls([], synthetic).ok).toBe(true)
  })

  it('allows a gated contract with an allowlisted selector', () => {
    expect(validateCalls([{ to: GATED, data: SETNAME }], synthetic).ok).toBe(
      true,
    )
  })

  it('matches the contract regardless of address casing', () => {
    // GATED here is lowercase; the allowlist entry is checksummed.
    expect(
      validateCalls([{ to: GATED.toLowerCase(), data: SETNAME }], synthetic).ok,
    ).toBe(true)
  })

  it('rejects a contract that is not on the allowlist', () => {
    const r = validateCalls([{ to: OUTSIDE, data: SETNAME }], synthetic)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('Contract not allowlisted')
  })

  it('rejects an allowlisted contract with a non-allowlisted selector', () => {
    const r = validateCalls([{ to: GATED, data: TRANSFER }], synthetic)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('Selector not allowlisted')
  })

  it('allows any selector on an any-selector contract (opaque calldata)', () => {
    expect(validateCalls([{ to: ANY, data: TRANSFER }], synthetic).ok).toBe(
      true,
    )
  })

  it('allows a gated call with no calldata (no selector to check)', () => {
    expect(validateCalls([{ to: GATED }], synthetic).ok).toBe(true)
    expect(validateCalls([{ to: GATED, data: '0x' }], synthetic).ok).toBe(true)
  })

  it('rejects a call with a missing "to"', () => {
    const r = validateCalls([{ to: '' }], synthetic)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('missing "to"')
  })

  it('rejects a call with an invalid "to" address', () => {
    const r = validateCalls([{ to: '0xnothex' }], synthetic)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('Invalid "to"')
  })

  it('rejects the whole intent if any call is disallowed', () => {
    const r = validateCalls(
      [
        { to: GATED, data: SETNAME },
        { to: OUTSIDE, data: SETNAME },
      ],
      synthetic,
    )
    expect(r.ok).toBe(false)
  })
})

describe('ALLOWED_SELECTORS', () => {
  it('is derived from the sponsored signatures', () => {
    expect(ALLOWED_SELECTORS.has(SETNAME)).toBe(true)
    expect(ALLOWED_SELECTORS.has(TRANSFER)).toBe(false)
  })
})

describe('resolveAllowlist', () => {
  it('returns checksummed Sepolia contracts for the Sepolia chain', () => {
    const a = resolveAllowlist(new Set([SEPOLIA]))
    expect(a.contracts.length).toBeGreaterThan(0)
    expect(a.contracts).toContain(getAddress(DEFAULT_REVERSE_REGISTRAR))
    expect(a.selectors).toBe(ALLOWED_SELECTORS)
  })

  it('denies by default for an unsupported chain (empty allowlist)', () => {
    const a = resolveAllowlist(new Set([1]))
    expect(a.contracts.length).toBe(0)
    expect(a.anySelectorContracts.length).toBe(0)
  })

  it('unions only the supported chains when several are configured', () => {
    const sepoliaOnly = resolveAllowlist(new Set([SEPOLIA]))
    const withMainnet = resolveAllowlist(new Set([SEPOLIA, 1]))
    // Mainnet contributes nothing, so the union equals Sepolia's set.
    expect(withMainnet.contracts.length).toBe(sepoliaOnly.contracts.length)
  })

  it('registers Sepolia in the per-chain map', () => {
    expect(ALLOWLIST_BY_CHAIN_ID.has(SEPOLIA)).toBe(true)
  })
})
