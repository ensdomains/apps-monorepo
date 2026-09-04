import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import type { V1TransferSubject } from '../types'
import type { V1NameState } from './getV1NameState'
import {
  getV1DetachTargets,
  getV1ParentPowers,
  getV1TransferGate,
} from './rules'

const ME = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const OTHER = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address
const RESOLVER = '0x3333333333333333333333333333333333333333' as Address

const NO_FUSES = {
  cannotTransfer: false,
  cannotSetResolver: false,
  cannotUnwrap: false,
  parentCannotControl: false,
}

const wrapped = (
  fuses: Partial<typeof NO_FUSES> = {},
  expiry: bigint | null = null,
): V1TransferSubject => ({
  kind: 'v1-wrapped',
  owner: ME,
  fuses: { ...NO_FUSES, ...fuses },
  expiry,
})

const state = (
  subject: V1TransferSubject | null,
  registration: V1NameState['registration'] = null,
): V1NameState => ({
  subject,
  registration,
  resolverAddress: RESOLVER,
  parentOwner: null,
})

describe('getV1TransferGate', () => {
  it('lets the wrapper owner transfer an unlocked wrapped name', () => {
    expect(getV1TransferGate(state(wrapped()), ME)).toEqual({
      reason: 'ok',
      subject: wrapped(),
    })
    expect(getV1TransferGate(state(wrapped()), OTHER)).toEqual({
      reason: 'not-owner',
    })
  })

  it('refuses a wrapped name whose CANNOT_TRANSFER fuse is burned', () => {
    expect(
      getV1TransferGate(state(wrapped({ cannotTransfer: true })), ME),
    ).toEqual({ reason: 'cannot-transfer' })
  })

  it('lets only the registrant transfer an unwrapped 2LD', () => {
    const s = state({
      kind: 'v1-registrar',
      registrant: ME,
      controller: OTHER,
    })
    expect(getV1TransferGate(s, ME).reason).toBe('ok')
  })

  // The controller can change records and subnames but not move the token;
  // offering them a transfer would either revert or leave the registrant able
  // to reclaim it straight back.
  it('names the registrant when only the controller is connected', () => {
    const s = state({
      kind: 'v1-registrar',
      registrant: OTHER,
      controller: ME,
    })
    expect(getV1TransferGate(s, ME)).toEqual({
      reason: 'manager-only',
      registrant: OTHER,
    })
  })

  it('treats a lapsed 2LD as in grace or expired from the registrar status', () => {
    expect(getV1TransferGate(state(null, 'gracePeriod'), ME)).toEqual({
      reason: 'grace',
    })
    expect(getV1TransferGate(state(null, 'expired'), ME)).toEqual({
      reason: 'expired',
    })
  })

  // A wrapped 2LD in grace still reads a live wrapper owner (the wrapper's
  // expiry includes the grace period) but `_beforeTransfer` refuses it.
  it('blocks a wrapped 2LD in grace even for its owner', () => {
    expect(
      getV1TransferGate(state(wrapped({}, 1n), 'gracePeriod'), ME),
    ).toEqual({ reason: 'grace' })
  })

  it('treats a wrapped subname with no live owner as expired', () => {
    expect(getV1TransferGate(state(null), ME)).toEqual({ reason: 'expired' })
  })

  it('lets the registry owner transfer a registry-only name', () => {
    const s = state({ kind: 'v1-registry', owner: ME })
    expect(getV1TransferGate(s, ME).reason).toBe('ok')
    expect(getV1TransferGate(s, OTHER)).toEqual({ reason: 'not-owner' })
  })
})

describe('getV1DetachTargets', () => {
  const targets = (
    subject: V1TransferSubject,
    overrides: {
      resolverAddress?: Address | null
      hasEthAddress?: boolean
    } = {},
  ) =>
    getV1DetachTargets({
      subject,
      resolverAddress: RESOLVER,
      account: ME,
      hasEthAddress: true,
      ...overrides,
    })

  it('offers both resolver options to a wrapped owner with a resolver', () => {
    expect(targets(wrapped())).toEqual({
      setEthAddress: true,
      detachResolver: true,
      detachRegistry: false,
    })
  })

  it('hides the ETH step when the name has no ETH address', () => {
    expect(targets(wrapped(), { hasEthAddress: false }).setEthAddress).toBe(
      false,
    )
  })

  it('hides both when the name has no resolver of its own', () => {
    expect(targets(wrapped(), { resolverAddress: null })).toEqual({
      setEthAddress: false,
      detachResolver: false,
      detachRegistry: false,
    })
  })

  it('keeps the ETH step but hides the detach when CANNOT_SET_RESOLVER is burned', () => {
    expect(targets(wrapped({ cannotSetResolver: true }))).toEqual({
      setEthAddress: true,
      detachResolver: false,
      detachRegistry: false,
    })
  })

  // PublicResolver authorises the *registry* owner. A registrant who isn't
  // also the controller can't touch records, so the steps would revert before
  // the move.
  it('hides record options from a registrant who is not the controller', () => {
    expect(
      targets({ kind: 'v1-registrar', registrant: ME, controller: OTHER }),
    ).toEqual({
      setEthAddress: false,
      detachResolver: false,
      detachRegistry: false,
    })
  })

  it('offers record options to a registrant who is also the controller', () => {
    expect(
      targets({ kind: 'v1-registrar', registrant: ME, controller: ME }),
    ).toEqual({
      setEthAddress: true,
      detachResolver: true,
      detachRegistry: false,
    })
  })
})

describe('getV1ParentPowers', () => {
  it('claims nothing for a .eth 2LD', () => {
    expect(
      getV1ParentPowers('alice.eth', {
        kind: 'v1-registrar',
        registrant: ME,
        controller: ME,
      }),
    ).toEqual([])
  })

  it('claims nothing for a DNS 2LD — that exposure is a notice, not a parent', () => {
    expect(
      getV1ParentPowers('alice.xyz', { kind: 'v1-registry', owner: ME }),
    ).toEqual([])
  })

  it('warns that an unwrapped subname can be taken back at any time', () => {
    expect(
      getV1ParentPowers('sub.alice.eth', { kind: 'v1-registry', owner: ME }),
    ).toEqual(['replace it or take it back at any time'])
  })

  it('warns the same for a wrapped subname the parent still controls', () => {
    expect(getV1ParentPowers('sub.alice.eth', wrapped({}, 1n))).toEqual([
      'replace it or take it back at any time',
    ])
  })

  it('limits an emancipated subname to re-issue after expiry', () => {
    expect(
      getV1ParentPowers(
        'sub.alice.eth',
        wrapped({ parentCannotControl: true }, 1n),
      ),
    ).toEqual(['issue it to someone else once it expires'])
  })

  it('still lists the re-issue power when an emancipated expiry is unknown', () => {
    expect(
      getV1ParentPowers(
        'sub.alice.eth',
        wrapped({ parentCannotControl: true }),
      ),
    ).toEqual(['issue it to someone else once it expires'])
  })
})
