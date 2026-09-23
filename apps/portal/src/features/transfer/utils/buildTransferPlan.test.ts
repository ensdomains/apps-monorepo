import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import type { NameRoleGrant } from '../types'
import {
  buildTransferPlan,
  describeTransferStep,
  isRecordAheadOfMove,
  type TransferOptions,
  transferStepKey,
} from './buildTransferPlan'

const NO_OPTIONS: TransferOptions = {
  setEthAddress: false,
  detachResolver: false,
  detachRegistry: false,
  revokeRoles: false,
}

/**
 * The plan's kinds in order. Every step but `revoke-roles` is fully described
 * by its kind, so the ordering tests read against this and the revoke tests
 * assert the full steps.
 */
const planKinds = (...args: Parameters<typeof buildTransferPlan>) =>
  buildTransferPlan(...args).map((step) => step.kind)

const DELEGATE = '0x1111111111111111111111111111111111111111' as Address
const OTHER_DELEGATE = '0x2222222222222222222222222222222222222222' as Address

const grant = (account: Address, roles: NameRoleGrant['roles']) => ({
  account,
  roles,
})

describe('buildTransferPlan (v2)', () => {
  it('always ends with the token transfer', () => {
    expect(planKinds(NO_OPTIONS, 'v2')).toEqual(['transfer-token'])
  })

  it('repoints the ETH address before transferring', () => {
    const plan = planKinds({ ...NO_OPTIONS, setEthAddress: true }, 'v2')
    expect(plan).toEqual(['set-eth-addr', 'transfer-token'])
  })

  it('skips the ETH step when the resolver is detached (redundant)', () => {
    const plan = planKinds(
      { ...NO_OPTIONS, setEthAddress: true, detachResolver: true },
      'v2',
    )
    expect(plan).toEqual(['detach-resolver', 'transfer-token'])
  })

  it('detaches the resolver (setResolver 0x0) before transferring', () => {
    const plan = planKinds({ ...NO_OPTIONS, detachResolver: true }, 'v2')
    expect(plan).toEqual(['detach-resolver', 'transfer-token'])
  })

  it('detaches the registry (setSubregistry 0x0) before transferring', () => {
    const plan = planKinds({ ...NO_OPTIONS, detachRegistry: true }, 'v2')
    expect(plan).toEqual(['detach-registry', 'transfer-token'])
  })

  it('orders the ETH step before the registry detach', () => {
    const plan = planKinds(
      { ...NO_OPTIONS, setEthAddress: true, detachRegistry: true },
      'v2',
    )
    expect(plan).toEqual(['set-eth-addr', 'detach-registry', 'transfer-token'])
  })

  it('combines detaching the resolver and the registry', () => {
    const plan = planKinds(
      { ...NO_OPTIONS, detachResolver: true, detachRegistry: true },
      'v2',
    )
    expect(plan).toEqual([
      'detach-resolver',
      'detach-registry',
      'transfer-token',
    ])
  })
})

describe('buildTransferPlan (v1)', () => {
  it('moves a wrapped name with one ERC-1155 transfer', () => {
    expect(planKinds(NO_OPTIONS, 'v1-wrapped')).toEqual(['transfer-erc1155'])
  })

  // After `safeTransferFrom` the sender is no longer the registrant and so can
  // no longer `reclaim`; the controller slot would stay with them for good.
  it('hands over the controller before the registrant for an unwrapped 2LD', () => {
    expect(planKinds(NO_OPTIONS, 'v1-registrar')).toEqual([
      'reclaim',
      'transfer-erc721',
    ])
  })

  it('moves a registry-only name with setOwner', () => {
    expect(planKinds(NO_OPTIONS, 'v1-registry')).toEqual(['set-registry-owner'])
  })

  it('runs config steps before the move', () => {
    const plan = planKinds(
      { ...NO_OPTIONS, setEthAddress: true },
      'v1-registrar',
    )
    expect(plan).toEqual(['set-eth-addr', 'reclaim', 'transfer-erc721'])
  })

  it('never detaches a registry — a v1 name has no subregistry', () => {
    const plan = planKinds(
      { ...NO_OPTIONS, detachRegistry: true },
      'v1-wrapped',
    )
    expect(plan).toEqual(['transfer-erc1155'])
  })

  it('moves a subname with one setSubnodeOwner when the parent acts', () => {
    expect(planKinds(NO_OPTIONS, 'v1-wrapped', 'parent')).toEqual([
      'set-subnode-owner',
    ])
    expect(planKinds(NO_OPTIONS, 'v1-registry', 'parent')).toEqual([
      'set-subnode-owner',
    ])
  })

  // The parent holds neither the subname's registry slot nor its wrapper
  // token, so every record write would revert.
  it('drops config steps when the parent acts, whatever was asked', () => {
    expect(
      planKinds(
        {
          setEthAddress: true,
          detachResolver: true,
          detachRegistry: true,
          revokeRoles: true,
        },
        'v1-wrapped',
        'parent',
      ),
    ).toEqual(['set-subnode-owner'])
  })
})

// Immunefi #93008: the record update and the move are separate transactions,
// so a recipient that refuses the token after `set-eth-addr` confirmed leaves
// the sender owning a name that resolves to the recipient.
describe('isRecordAheadOfMove', () => {
  const plan = buildTransferPlan({ ...NO_OPTIONS, setEthAddress: true }, 'v2')

  it('flags a repointed record whose move never confirmed', () => {
    expect(isRecordAheadOfMove(plan, new Set(['set-eth-addr']))).toBe(true)
  })

  it('is clear once the move confirms', () => {
    expect(
      isRecordAheadOfMove(plan, new Set(['set-eth-addr', 'transfer-token'])),
    ).toBe(false)
  })

  it('is clear when the record was never written', () => {
    expect(isRecordAheadOfMove(plan, new Set())).toBe(false)
  })

  it('flags a record that landed on-chain without a confirmed receipt', () => {
    expect(
      isRecordAheadOfMove(plan, new Set(), { isRecordRepointedOnChain: true }),
    ).toBe(true)
  })

  it('is clear once the move confirms, even if the record’s receipt was lost', () => {
    expect(
      isRecordAheadOfMove(plan, new Set(['transfer-token']), {
        isRecordRepointedOnChain: true,
      }),
    ).toBe(false)
  })

  it('is clear when a move with a lost receipt may have landed', () => {
    expect(
      isRecordAheadOfMove(plan, new Set(['set-eth-addr']), {
        mayHaveMoved: true,
      }),
    ).toBe(false)
  })

  it('keys off the last step of a two-step V1 move', () => {
    const v1 = buildTransferPlan(
      { ...NO_OPTIONS, setEthAddress: true },
      'v1-registrar',
    )
    // `reclaim` alone doesn't hand over the registrant.
    expect(isRecordAheadOfMove(v1, new Set(['set-eth-addr', 'reclaim']))).toBe(
      true,
    )
  })
})

/**
 * Registry roles are keyed on the label while the token is keyed on its id, so
 * a grant made from the roles page outlives the transfer: without these steps a
 * seller's delegate keeps write authority over the buyer's name.
 */
describe('buildTransferPlan (role revocations)', () => {
  const grants = [
    grant(DELEGATE, ['ROLE_SET_RESOLVER']),
    grant(OTHER_DELEGATE, ['ROLE_RENEW', 'ROLE_SET_SUBREGISTRY']),
  ]

  it('revokes every third-party grant before the token moves', () => {
    const plan = buildTransferPlan(
      { ...NO_OPTIONS, revokeRoles: true },
      'v2',
      'owner',
      grants,
    )

    expect(plan).toEqual([
      { kind: 'revoke-roles', grant: grants[0] },
      { kind: 'revoke-roles', grant: grants[1] },
      { kind: 'transfer-token' },
    ])
  })

  it('leaves the grants alone when the option is off', () => {
    expect(planKinds(NO_OPTIONS, 'v2', 'owner', grants)).toEqual([
      'transfer-token',
    ])
  })

  it('runs the revokes after the detaches, still before the move', () => {
    expect(
      planKinds(
        {
          setEthAddress: false,
          detachResolver: true,
          detachRegistry: true,
          revokeRoles: true,
        },
        'v2',
        'owner',
        grants,
      ),
    ).toEqual([
      'detach-resolver',
      'detach-registry',
      'revoke-roles',
      'revoke-roles',
      'transfer-token',
    ])
  })

  // An empty bitmap is a call that does nothing and costs gas, and a grant can
  // be emptied by filtering out roles the sender can't revoke.
  it('drops a grant with no roles left in it', () => {
    expect(
      planKinds({ ...NO_OPTIONS, revokeRoles: true }, 'v2', 'owner', [
        grant(DELEGATE, []),
      ]),
    ).toEqual(['transfer-token'])
  })

  // A V1 name has no EAC resource, so there is nothing a revoke could name.
  it('never revokes for a v1 name', () => {
    expect(
      planKinds(
        { ...NO_OPTIONS, revokeRoles: true },
        'v1-wrapped',
        'owner',
        grants,
      ),
    ).toEqual(['transfer-erc1155'])
  })

  it('gives each account its own step id, so two revokes never collide', () => {
    const plan = buildTransferPlan(
      { ...NO_OPTIONS, revokeRoles: true },
      'v2',
      'owner',
      grants,
    )
    const ids = plan.map(transferStepKey)

    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual([
      `revoke-roles-${DELEGATE.toLowerCase()}`,
      `revoke-roles-${OTHER_DELEGATE.toLowerCase()}`,
      'transfer-token',
    ])
  })

  it('names the account in the step title', () => {
    expect(
      describeTransferStep({
        kind: 'revoke-roles',
        grant: grants[0],
      }),
    ).toContain('0x1111')
  })
})
