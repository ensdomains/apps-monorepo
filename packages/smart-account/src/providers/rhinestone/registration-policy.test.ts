/**
 * Tests for buildRegistrationSessionActions.
 *
 * Smoke-tests the canonical-ABI-derived selectors against the known-good
 * hex values from `cast sig`, plus shape checks on the action set.
 */

import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  buildRegistrationSessionActions,
  buildRegistrationSessionActionsHash,
} from './registration-policy'

const EOA = '0x2222222222222222222222222222222222222222' as Address
/** Fixed unix-seconds value for deterministic snapshot/equality checks. */
const VALID_UNTIL_SEC = 2_000_000_000 // 2033-05-18

const KNOWN_SELECTORS = {
  commit: '0xf14fcbc8',
  register: '0xcff3e7c2',
  renew: '0x89d779c3',
  approve: '0x095ea7b3',
  deployProxy: '0x5d84121a',
} as const

/**
 * The 7th action (`HCAFactory.setAccountOwner(SCA, EOA)`, selector
 * `0x2dbe1821`) used to be in this set. It is permanently absent now —
 * the real `HCAFactory` writes ownership atomically inside
 * `createAccount`, so the session never has authority over the factory
 * and never needs to call it. Pinning the absence here so a future
 * re-add doesn't silently regress the threat model.
 */
const REMOVED_SETACCOUNTOWNER_SELECTOR = '0x2dbe1821' as const

describe('buildRegistrationSessionActions', () => {
  const actions = buildRegistrationSessionActions({
    eoaAddress: EOA,
    validUntil: VALID_UNTIL_SEC,
  })

  it('emits exactly the expected number of scoped actions', () => {
    // 6 actions remain after dropping the legacy HCAFactory entry:
    // commit, register, renew, USDC.approve, DAI.approve, deployProxy.
    expect(actions).toHaveLength(6)
  })

  it('every action has a target + selector (no FallbackAction in the set)', () => {
    for (const action of actions) {
      expect(action).toHaveProperty('target')
      expect(action).toHaveProperty('selector')
    }
  })

  it('selectors derived from canonical ABIs match the cast-sig values', () => {
    const observedSelectors = actions.map((a) =>
      'selector' in a ? a.selector : null,
    )

    expect(observedSelectors).toContain(KNOWN_SELECTORS.commit)
    expect(observedSelectors).toContain(KNOWN_SELECTORS.register)
    expect(observedSelectors).toContain(KNOWN_SELECTORS.renew)
    expect(observedSelectors).toContain(KNOWN_SELECTORS.approve)
    expect(observedSelectors).toContain(KNOWN_SELECTORS.deployProxy)
  })

  it('no HCAFactory.setAccountOwner action is present', () => {
    const observedSelectors = actions.map((a) =>
      'selector' in a ? a.selector : null,
    )
    expect(observedSelectors).not.toContain(REMOVED_SETACCOUNTOWNER_SELECTOR)
  })

  it('register action pins owner to EOA at calldata offset 32', () => {
    const registerAction = actions.find(
      (a) => 'selector' in a && a.selector === KNOWN_SELECTORS.register,
    )
    expect(registerAction).toBeDefined()
    const policies = registerAction?.policies ?? []
    // Only the universal-action policy today; see
    // `registration-policy.ts` JSDoc for why the on-chain
    // `time-frame` policy is intentionally absent.
    expect(policies).toHaveLength(1)
    const policy = policies[0]
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
      const policy = (action.policies ?? [])[0]
      expect(policy?.type).toBe('universal-action')
      if (policy?.type !== 'universal-action') throw new Error('unreachable')
      expect(policy.rules[0]).toMatchObject({
        condition: 'equal',
        calldataOffset: 0n,
      })
    }
  })

  it('no `time-frame` policy is attached on any action (SDK/contract mismatch)', () => {
    // The Rhinestone SDK 1.5.1 `'time-frame'` encoder produces 12-byte
    // initData but the deployed Sepolia TimeFramePolicy expects 32 bytes
    // (rhinestonewtf/smartsessions fork), so enable-mode simulation
    // reverts inside `initializeWithMultiplexer`. Until upstream is
    // fixed, on-chain expiry enforcement is disabled and this test
    // pins the absence so a future re-add doesn't silently regress.
    for (const action of actions) {
      const policies = action.policies ?? []
      const timeFrame = policies.find((p) => p.type === 'time-frame')
      expect(timeFrame).toBeUndefined()
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
        eoaAddress: EOA,
        validUntil: 0,
      }),
    ).not.toThrow()
    expect(() =>
      buildRegistrationSessionActions({
        eoaAddress: EOA,
        validUntil: Number.MAX_SAFE_INTEGER,
      }),
    ).not.toThrow()
  })
})

describe('buildRegistrationSessionActionsHash', () => {
  it('returns a 0x-prefixed 32-byte keccak digest', () => {
    const hash = buildRegistrationSessionActionsHash({
      eoaAddress: EOA,
      validUntil: VALID_UNTIL_SEC,
    })
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('is deterministic — same params produce the same hash', () => {
    const params = { eoaAddress: EOA, validUntil: VALID_UNTIL_SEC }
    expect(buildRegistrationSessionActionsHash(params)).toBe(
      buildRegistrationSessionActionsHash(params),
    )
  })

  it('produces a different hash for a different eoaAddress', () => {
    // The `register` action pins `owner == eoaAddress`, so changing
    // the EOA must change the digest. If it doesn't, the drift check
    // is silently broken and a session enabled against one EOA could
    // be replayed against another at signer-construction time.
    const otherEOA: Address = '0x3333333333333333333333333333333333333333'
    expect(
      buildRegistrationSessionActionsHash({
        eoaAddress: EOA,
        validUntil: VALID_UNTIL_SEC,
      }),
    ).not.toBe(
      buildRegistrationSessionActionsHash({
        eoaAddress: otherEOA,
        validUntil: VALID_UNTIL_SEC,
      }),
    )
  })

  it('is invariant in EOA casing (EIP-55 normalization)', () => {
    // The address ends up inside UAP `referenceValue` and the on-chain
    // smart-sessions validator reconstructs `PermissionId` from the
    // exact bytes of that field. If casing weren't normalized, a
    // session signed against a checksummed EOA but rebuilt at
    // signer-construction time against a lowercase EOA would produce
    // a different PermissionId — the orchestrator returns "Bundle
    // simulation failed" with no inner reason. `buildRegistrationSessionActions`
    // applies `viem.getAddress(...)` at the top to normalize. Both
    // hashes must agree regardless of input case.
    const checksummed: Address =
      '0x205d2686Da3Bf33f64C17f21462c51B5eaD462CF' as Address
    const lowercase: Address =
      '0x205d2686da3bf33f64c17f21462c51b5ead462cf' as Address
    const uppercase: Address =
      '0x205D2686DA3BF33F64C17F21462C51B5EAD462CF' as Address

    expect(
      buildRegistrationSessionActionsHash({
        eoaAddress: checksummed,
        validUntil: VALID_UNTIL_SEC,
      }),
    ).toBe(
      buildRegistrationSessionActionsHash({
        eoaAddress: lowercase,
        validUntil: VALID_UNTIL_SEC,
      }),
    )
    expect(
      buildRegistrationSessionActionsHash({
        eoaAddress: lowercase,
        validUntil: VALID_UNTIL_SEC,
      }),
    ).toBe(
      buildRegistrationSessionActionsHash({
        eoaAddress: uppercase,
        validUntil: VALID_UNTIL_SEC,
      }),
    )
  })

  it('is invariant in validUntil today (intentional — not in the action set)', () => {
    // `validUntil` currently does not flow into the action set (the
    // `time-frame` policy is disabled — see file header). Two
    // different `validUntil` values must therefore hash to the same
    // digest. Once upstream fixes `time-frame`, this test should
    // flip to "produces a different hash" and `restoreRhinestoneSession`
    // will start refusing sessions whose stored expiry no longer
    // matches the current code. Bake that future change into the
    // failure mode here so we don't forget.
    expect(
      buildRegistrationSessionActionsHash({
        eoaAddress: EOA,
        validUntil: 1,
      }),
    ).toBe(
      buildRegistrationSessionActionsHash({
        eoaAddress: EOA,
        validUntil: VALID_UNTIL_SEC,
      }),
    )
  })
})
