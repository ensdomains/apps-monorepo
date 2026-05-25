/**
 * Tests for buildRegistrationSessionActions.
 *
 * Smoke-tests the canonical-ABI-derived selectors against the known-good
 * hex values from `cast sig`, plus shape checks on the action set.
 */

import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import { buildRegistrationSessionActions } from './registration-policy'

const SCA = '0x1111111111111111111111111111111111111111' as Address
const EOA = '0x2222222222222222222222222222222222222222' as Address
/** Fixed unix-seconds values for deterministic snapshot/equality checks. */
const VALID_AFTER_SEC = 1_700_000_000 // 2023-11-14
const VALID_UNTIL_SEC = 2_000_000_000 // 2033-05-18

const KNOWN_SELECTORS = {
  commit: '0xf14fcbc8',
  register: '0xcff3e7c2',
  renew: '0x89d779c3',
  approve: '0x095ea7b3',
  deployProxy: '0x5d84121a',
  setAccountOwner: '0x2dbe1821',
} as const

describe('buildRegistrationSessionActions', () => {
  const actions = buildRegistrationSessionActions({
    smartAccountAddress: SCA,
    eoaAddress: EOA,
    validAfter: VALID_AFTER_SEC,
    validUntil: VALID_UNTIL_SEC,
  })

  it('emits exactly the expected number of scoped actions', () => {
    expect(actions).toHaveLength(7)
  })

  it('every action has a target + selector (no FallbackAction in the set)', () => {
    for (const action of actions) {
      expect(action).toHaveProperty('target')
      expect(action).toHaveProperty('selector')
    }
  })

  it('selectors derived from canonical ABIs match the cast-sig values', () => {
    // Build a {target,selector} → selector-name reverse index for assertion
    // clarity. Each (target, selector) pair must correspond to a known
    // function from KNOWN_SELECTORS.
    const observedSelectors = actions.map((a) =>
      'selector' in a ? a.selector : null,
    )

    expect(observedSelectors).toContain(KNOWN_SELECTORS.commit)
    expect(observedSelectors).toContain(KNOWN_SELECTORS.register)
    expect(observedSelectors).toContain(KNOWN_SELECTORS.renew)
    expect(observedSelectors).toContain(KNOWN_SELECTORS.approve)
    expect(observedSelectors).toContain(KNOWN_SELECTORS.deployProxy)
    expect(observedSelectors).toContain(KNOWN_SELECTORS.setAccountOwner)
  })

  it('register action pins owner to EOA at calldata offset 32', () => {
    const registerAction = actions.find(
      (a) => 'selector' in a && a.selector === KNOWN_SELECTORS.register,
    )
    expect(registerAction).toBeDefined()
    const policies = registerAction?.policies ?? []
    // time-frame + universal-action
    // time-frame + universal-action
    expect(policies).toHaveLength(2)
    const uaPolicy = policies[1]
    expect(uaPolicy?.type).toBe('universal-action')
    if (uaPolicy?.type !== 'universal-action') throw new Error('unreachable')
    expect(uaPolicy.rules).toHaveLength(1)
    expect(uaPolicy.rules[0]).toMatchObject({
      condition: 'equal',
      calldataOffset: 32n,
      referenceValue: EOA,
    })
  })

  it('approve action(s) pin spender to ETHRegistrar at calldata offset 0', () => {
    const approveActions = actions.filter(
      (a) => 'selector' in a && a.selector === KNOWN_SELECTORS.approve,
    )
    // USDC + DAI → 2 approve actions
    expect(approveActions).toHaveLength(2)
    for (const action of approveActions) {
      expect(action.policies).toHaveLength(2)
      const policy = (action.policies ?? [])[1]
      expect(policy?.type).toBe('universal-action')
      if (policy?.type !== 'universal-action') throw new Error('unreachable')
      expect(policy.rules[0]).toMatchObject({
        condition: 'equal',
        calldataOffset: 0n,
      })
    }
  })

  it('setAccountOwner action pins both args to (SCA, EOA)', () => {
    const action = actions.find(
      (a) => 'selector' in a && a.selector === KNOWN_SELECTORS.setAccountOwner,
    )
    expect(action).toBeDefined()
    expect(action?.policies).toHaveLength(2)
    const policy = (action?.policies ?? [])[1]
    expect(policy?.type).toBe('universal-action')
    if (policy?.type !== 'universal-action') throw new Error('unreachable')
    expect(policy.rules).toHaveLength(2)
    expect(policy.rules[0]).toMatchObject({
      calldataOffset: 0n,
      referenceValue: SCA,
    })
    expect(policy.rules[1]).toMatchObject({
      calldataOffset: 32n,
      referenceValue: EOA,
    })
  })

  it('every action carries a `time-frame` policy with correct timestamps', () => {
    for (const action of actions) {
      const policies = action.policies ?? []
      const timeFrame = policies.find((p) => p.type === 'time-frame')
      expect(timeFrame).toBeDefined()
      if (timeFrame?.type !== 'time-frame') throw new Error('unreachable')
      // SDK expects ms, params are in seconds; verify conversion.
      expect(timeFrame.validAfter).toBe(VALID_AFTER_SEC * 1000)
      expect(timeFrame.validUntil).toBe(VALID_UNTIL_SEC * 1000)
    }
  })

  it('accepts validUntil at the API level even when not used on-chain', () => {
    // `validUntil` still has to round-trip from session-create to
    // signer-rebuild so the client-side staleness check
    // (`isSessionExpired`) and the future on-chain re-enablement both
    // see the same value. The function must accept the param without
    // throwing regardless of value, since today it is unused.
    expect(() =>
      buildRegistrationSessionActions({
        smartAccountAddress: SCA,
        eoaAddress: EOA,
        validAfter: 0,
        validUntil: 0,
      }),
    ).not.toThrow()
    expect(() =>
      buildRegistrationSessionActions({
        smartAccountAddress: SCA,
        eoaAddress: EOA,
        validAfter: Number.MAX_SAFE_INTEGER,
        validUntil: Number.MAX_SAFE_INTEGER,
      }),
    ).not.toThrow()
  })
})
