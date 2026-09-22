import { describe, expect, it } from 'vitest'
import {
  buildTransferPlan,
  isRecordAheadOfMove,
  type TransferOptions,
} from './buildTransferPlan'

const NO_OPTIONS: TransferOptions = {
  setEthAddress: false,
  detachResolver: false,
  detachRegistry: false,
}

describe('buildTransferPlan (v2)', () => {
  it('always ends with the token transfer', () => {
    expect(buildTransferPlan(NO_OPTIONS, 'v2')).toEqual(['transfer-token'])
  })

  it('repoints the ETH address before transferring', () => {
    const plan = buildTransferPlan({ ...NO_OPTIONS, setEthAddress: true }, 'v2')
    expect(plan).toEqual(['set-eth-addr', 'transfer-token'])
  })

  it('skips the ETH step when the resolver is detached (redundant)', () => {
    const plan = buildTransferPlan(
      { ...NO_OPTIONS, setEthAddress: true, detachResolver: true },
      'v2',
    )
    expect(plan).toEqual(['detach-resolver', 'transfer-token'])
  })

  it('detaches the resolver (setResolver 0x0) before transferring', () => {
    const plan = buildTransferPlan(
      { ...NO_OPTIONS, detachResolver: true },
      'v2',
    )
    expect(plan).toEqual(['detach-resolver', 'transfer-token'])
  })

  it('detaches the registry (setSubregistry 0x0) before transferring', () => {
    const plan = buildTransferPlan(
      { ...NO_OPTIONS, detachRegistry: true },
      'v2',
    )
    expect(plan).toEqual(['detach-registry', 'transfer-token'])
  })

  it('orders the ETH step before the registry detach', () => {
    const plan = buildTransferPlan(
      { setEthAddress: true, detachResolver: false, detachRegistry: true },
      'v2',
    )
    expect(plan).toEqual(['set-eth-addr', 'detach-registry', 'transfer-token'])
  })

  it('combines detaching the resolver and the registry', () => {
    const plan = buildTransferPlan(
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
    expect(buildTransferPlan(NO_OPTIONS, 'v1-wrapped')).toEqual([
      'transfer-erc1155',
    ])
  })

  // After `safeTransferFrom` the sender is no longer the registrant and so can
  // no longer `reclaim`; the controller slot would stay with them for good.
  it('hands over the controller before the registrant for an unwrapped 2LD', () => {
    expect(buildTransferPlan(NO_OPTIONS, 'v1-registrar')).toEqual([
      'reclaim',
      'transfer-erc721',
    ])
  })

  it('moves a registry-only name with setOwner', () => {
    expect(buildTransferPlan(NO_OPTIONS, 'v1-registry')).toEqual([
      'set-registry-owner',
    ])
  })

  it('runs config steps before the move', () => {
    const plan = buildTransferPlan(
      { ...NO_OPTIONS, setEthAddress: true },
      'v1-registrar',
    )
    expect(plan).toEqual(['set-eth-addr', 'reclaim', 'transfer-erc721'])
  })

  it('never detaches a registry — a v1 name has no subregistry', () => {
    const plan = buildTransferPlan(
      { ...NO_OPTIONS, detachRegistry: true },
      'v1-wrapped',
    )
    expect(plan).toEqual(['transfer-erc1155'])
  })

  it('moves a subname with one setSubnodeOwner when the parent acts', () => {
    expect(buildTransferPlan(NO_OPTIONS, 'v1-wrapped', 'parent')).toEqual([
      'set-subnode-owner',
    ])
    expect(buildTransferPlan(NO_OPTIONS, 'v1-registry', 'parent')).toEqual([
      'set-subnode-owner',
    ])
  })

  // The parent holds neither the subname's registry slot nor its wrapper
  // token, so every record write would revert.
  it('drops config steps when the parent acts, whatever was asked', () => {
    expect(
      buildTransferPlan(
        { setEthAddress: true, detachResolver: true, detachRegistry: true },
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
