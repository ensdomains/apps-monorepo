/**
 * Tests for buildRegistrationSessionActions.
 *
 * Smoke-tests the canonical-ABI-derived selectors against the known-good
 * hex values from `cast sig`, plus shape checks on the action set.
 */

import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import { buildRegistrationSessionActions } from './build-registration-session'

const SCA = '0x1111111111111111111111111111111111111111' as Address
const EOA = '0x2222222222222222222222222222222222222222' as Address

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
    const policies = registerAction?.policies
    expect(policies).toHaveLength(1)
    const [policy] = policies ?? []
    expect(policy?.type).toBe('universal-action')
    if (policy?.type !== 'universal-action') throw new Error('unreachable')
    expect(policy.rules).toHaveLength(1)
    expect(policy.rules[0]).toMatchObject({
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
      const [policy] = action.policies ?? []
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
    const [policy] = action?.policies ?? []
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
})
