import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import type { V1ParentState, V1TransferSubject } from '../types'
import type { V1NameState } from './getV1NameState'
import {
  canReclaimV1Manager,
  getV1DetachTargets,
  getV1Holder,
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
  owner: Address = ME,
): V1TransferSubject => ({
  kind: 'v1-wrapped',
  owner,
  fuses: { ...NO_FUSES, ...fuses },
  expiry,
})

const registry = (owner: Address = ME): V1TransferSubject => ({
  kind: 'v1-registry',
  owner,
})

const registrar = (
  registrant: Address = ME,
  controller: Address | null = OTHER,
): V1TransferSubject => ({ kind: 'v1-registrar', registrant, controller })

const wrappedParent = (
  owner: Address | null = OTHER,
  cannotCreateSubdomain = false,
): V1ParentState => ({
  owner,
  registrant: null,
  isWrapped: true,
  cannotCreateSubdomain,
})

const unwrappedParent = (
  owner: Address | null = OTHER,
  registrant: Address | null = null,
): V1ParentState => ({
  owner,
  registrant,
  isWrapped: false,
  cannotCreateSubdomain: false,
})

const state = (
  subject: V1TransferSubject | null,
  overrides: Partial<Omit<V1NameState, 'subject'>> = {},
): V1NameState => ({
  subject,
  registration: null,
  resolverAddress: RESOLVER,
  parent: null,
  ancestorRegistration: null,
  ...overrides,
})

describe('getV1TransferGate — as the holder', () => {
  it('lets the wrapper owner transfer an unlocked wrapped name', () => {
    const subject = wrapped()
    expect(getV1TransferGate(state(subject), ME)).toEqual({
      reason: 'ok',
      subject,
      actor: 'owner',
    })
  })

  it('refuses a wrapped name whose CANNOT_TRANSFER fuse is burned', () => {
    expect(
      getV1TransferGate(state(wrapped({ cannotTransfer: true })), ME),
    ).toEqual({ reason: 'cannot-transfer' })
  })

  it('lets only the registrant transfer an unwrapped 2LD', () => {
    const subject: V1TransferSubject = {
      kind: 'v1-registrar',
      registrant: ME,
      controller: OTHER,
    }
    expect(getV1TransferGate(state(subject), ME)).toMatchObject({
      reason: 'ok',
      actor: 'owner',
    })
    expect(getV1TransferGate(state(subject), OTHER)).toEqual({
      reason: 'manager-only',
      registrant: ME,
    })
  })

  it('refuses a stranger to an unwrapped 2LD as not-owner', () => {
    const subject: V1TransferSubject = {
      kind: 'v1-registrar',
      registrant: OTHER,
      controller: OTHER,
    }
    expect(getV1TransferGate(state(subject), ME)).toEqual({
      reason: 'not-owner',
    })
  })

  it('treats a lapsed 2LD as in grace or expired from the registrar status', () => {
    expect(
      getV1TransferGate(state(null, { registration: 'gracePeriod' }), ME),
    ).toEqual({ reason: 'grace' })
    expect(
      getV1TransferGate(state(null, { registration: 'expired' }), ME),
    ).toEqual({ reason: 'expired' })
  })

  it('blocks a wrapped 2LD in grace even for its owner', () => {
    expect(
      getV1TransferGate(state(wrapped(), { registration: 'gracePeriod' }), ME),
    ).toEqual({ reason: 'grace' })
  })

  it('treats a wrapped subname with no live owner as expired', () => {
    expect(
      getV1TransferGate(state(null, { parent: wrappedParent() }), ME),
    ).toEqual({ reason: 'expired' })
  })

  it('lets the registry owner transfer a registry-only name', () => {
    const subject = registry()
    expect(getV1TransferGate(state(subject), ME)).toEqual({
      reason: 'ok',
      subject,
      actor: 'owner',
    })
    expect(getV1TransferGate(state(subject), OTHER)).toEqual({
      reason: 'not-owner',
    })
  })

  // NameWrapper `_beforeTransfer` skips the CANNOT_TRANSFER check once a
  // non-emancipated name is past its expiry, and `getData` reads its fuses as
  // zero — so the derived subject already has no fuses and the gate agrees
  // with the contract. This pins that down so nobody "fixes" it.
  it('still lets an expired non-emancipated wrapped subname move', () => {
    const subject = wrapped({}, 1n)
    expect(getV1TransferGate(state(subject), ME)).toMatchObject({
      reason: 'ok',
    })
  })
})

describe('getV1TransferGate — the .eth ancestor', () => {
  it('blocks any move once the 2LD above has lapsed past grace', () => {
    const s = state(wrapped(), {
      parent: wrappedParent(ME),
      ancestorRegistration: 'expired',
    })
    expect(getV1TransferGate(s, ME)).toEqual({ reason: 'ancestor-expired' })
    expect(getV1TransferGate(s, OTHER)).toEqual({ reason: 'ancestor-expired' })
  })

  it('reports the ancestor rather than a bare expiry when both have lapsed', () => {
    expect(
      getV1TransferGate(
        state(null, {
          parent: wrappedParent(null),
          ancestorRegistration: 'expired',
        }),
        ME,
      ),
    ).toEqual({ reason: 'ancestor-expired' })
  })

  it('lets the holder move while the ancestor is only in grace', () => {
    expect(
      getV1TransferGate(
        state(wrapped(), { ancestorRegistration: 'gracePeriod' }),
        ME,
      ),
    ).toMatchObject({ reason: 'ok', actor: 'owner' })
  })

  it('blocks a wrapped parent’s reassignment while the ancestor is in grace', () => {
    expect(
      getV1TransferGate(
        state(wrapped({}, null, OTHER), {
          parent: wrappedParent(ME),
          ancestorRegistration: 'gracePeriod',
        }),
        ME,
      ),
    ).toEqual({ reason: 'ancestor-grace' })
  })

  // The registry doesn't know about expiry, so the write itself goes through;
  // the form warns instead.
  it('lets an unwrapped parent reassign during the ancestor’s grace', () => {
    expect(
      getV1TransferGate(
        state(registry(OTHER), {
          parent: unwrappedParent(ME),
          ancestorRegistration: 'gracePeriod',
        }),
        ME,
      ),
    ).toMatchObject({ reason: 'ok', actor: 'parent' })
  })
})

describe('getV1TransferGate — as the parent', () => {
  it('lets a wrapped parent reassign a wrapped subname it still controls', () => {
    const subject = wrapped({}, null, OTHER)
    expect(
      getV1TransferGate(state(subject, { parent: wrappedParent(ME) }), ME),
    ).toEqual({ reason: 'ok', subject, actor: 'parent' })
  })

  it('lets an unwrapped parent reassign an unwrapped subname', () => {
    const subject = registry(OTHER)
    expect(
      getV1TransferGate(state(subject, { parent: unwrappedParent(ME) }), ME),
    ).toEqual({ reason: 'ok', subject, actor: 'parent' })
  })

  it('prefers the holder role when the wallet is both holder and parent', () => {
    expect(
      getV1TransferGate(state(wrapped(), { parent: wrappedParent(ME) }), ME),
    ).toMatchObject({ reason: 'ok', actor: 'owner' })
  })

  it('refuses the parent once the subname is emancipated', () => {
    expect(
      getV1TransferGate(
        state(wrapped({ parentCannotControl: true }, null, OTHER), {
          parent: wrappedParent(ME),
        }),
        ME,
      ),
    ).toEqual({ reason: 'parent-cannot-reassign', why: 'emancipated' })
  })

  it('refuses a wrapped parent over an unwrapped subname (would wrap it)', () => {
    expect(
      getV1TransferGate(
        state(registry(OTHER), { parent: wrappedParent(ME) }),
        ME,
      ),
    ).toEqual({ reason: 'parent-cannot-reassign', why: 'wrapper-mismatch' })
  })

  it('refuses an unwrapped parent over a wrapped subname (would unwrap it)', () => {
    expect(
      getV1TransferGate(
        state(wrapped({}, null, OTHER), { parent: unwrappedParent(ME) }),
        ME,
      ),
    ).toEqual({ reason: 'parent-cannot-reassign', why: 'wrapper-mismatch' })
  })

  it('tells the parent’s registrant to reclaim first', () => {
    expect(
      getV1TransferGate(
        state(registry(OTHER), { parent: unwrappedParent(OTHER, ME) }),
        ME,
      ),
    ).toEqual({ reason: 'parent-cannot-reassign', why: 'registrant-only' })
  })

  it('refuses a stranger to both the subname and its parent', () => {
    expect(
      getV1TransferGate(
        state(registry(OTHER), { parent: unwrappedParent(OTHER) }),
        ME,
      ),
    ).toEqual({ reason: 'not-owner' })
  })

  it('refuses when the parent has no holder at all', () => {
    expect(
      getV1TransferGate(
        state(wrapped({}, null, OTHER), { parent: wrappedParent(null) }),
        ME,
      ),
    ).toEqual({ reason: 'not-owner' })
  })
})

describe('getV1DetachTargets', () => {
  const targets = (
    subject: V1TransferSubject,
    overrides: Partial<{
      actor: 'owner' | 'parent'
      resolverAddress: Address | null
      hasEthAddress: boolean
    }> = {},
  ) =>
    getV1DetachTargets({
      subject,
      actor: 'owner',
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
    expect(targets(wrapped(), { hasEthAddress: false })).toMatchObject({
      setEthAddress: false,
      detachResolver: true,
    })
  })

  it('hides both when the name has no resolver of its own', () => {
    expect(targets(wrapped(), { resolverAddress: null })).toMatchObject({
      setEthAddress: false,
      detachResolver: false,
    })
  })

  it('keeps the ETH step but hides the detach when CANNOT_SET_RESOLVER is burned', () => {
    expect(targets(wrapped({ cannotSetResolver: true }))).toMatchObject({
      setEthAddress: true,
      detachResolver: false,
    })
  })

  it('hides record options from a registrant who is not the controller', () => {
    expect(
      targets({ kind: 'v1-registrar', registrant: ME, controller: OTHER }),
    ).toMatchObject({ setEthAddress: false, detachResolver: false })
  })

  it('offers record options to a registrant who is also the controller', () => {
    expect(
      targets({ kind: 'v1-registrar', registrant: ME, controller: ME }),
    ).toMatchObject({ setEthAddress: true, detachResolver: true })
  })

  // PublicResolver authorises the subname's registry owner (or wrapper owner);
  // the parent is neither, so its writes would revert.
  it('hides every option from a parent reassigning a subname', () => {
    expect(targets(wrapped({}, null, OTHER), { actor: 'parent' })).toEqual({
      setEthAddress: false,
      detachResolver: false,
      detachRegistry: false,
    })
  })
})

describe('getV1ParentPowers', () => {
  it('claims nothing for a .eth 2LD', () => {
    expect(getV1ParentPowers('alice.eth', wrapped(), null)).toEqual([])
    expect(
      getV1ParentPowers(
        'alice.eth',
        { kind: 'v1-registrar', registrant: ME, controller: ME },
        null,
      ),
    ).toEqual([])
  })

  it('claims nothing for a DNS 2LD — that exposure is a notice, not a parent', () => {
    expect(getV1ParentPowers('alice.xyz', registry(), null)).toEqual([])
  })

  it('warns that an unwrapped subname can be taken back at any time', () => {
    expect(
      getV1ParentPowers('sub.alice.eth', registry(), unwrappedParent()),
    ).toEqual(['replace it or take it back at any time'])
    expect(
      getV1ParentPowers('sub.alice.eth', registry(), wrappedParent()),
    ).toEqual(['replace it or take it back at any time'])
  })

  it('warns the same for a wrapped subname the parent still controls', () => {
    expect(
      getV1ParentPowers('sub.alice.eth', wrapped(), wrappedParent()),
    ).toEqual(['replace it or take it back at any time'])
  })

  it('limits an emancipated subname to re-issue after expiry', () => {
    expect(
      getV1ParentPowers(
        'sub.alice.eth',
        wrapped({ parentCannotControl: true }, 1_900_000_000n),
        wrappedParent(),
      ),
    ).toEqual(['issue it to someone else once it expires'])
  })

  it('still lists the re-issue power when an emancipated expiry is unknown', () => {
    expect(
      getV1ParentPowers(
        'sub.alice.eth',
        wrapped({ parentCannotControl: true }),
        wrappedParent(),
      ),
    ).toEqual(['issue it to someone else once it expires'])
  })

  // `_checkCanCallSetSubnodeOwner` refuses to recreate a lapsed emancipated
  // subname under a parent that burned CANNOT_CREATE_SUBDOMAIN.
  it('claims nothing over an emancipated subname when the parent can’t create subdomains', () => {
    expect(
      getV1ParentPowers(
        'sub.alice.eth',
        wrapped({ parentCannotControl: true }),
        wrappedParent(OTHER, true),
      ),
    ).toEqual([])
  })
})

describe('getV1Holder', () => {
  it('names the registrant for an unwrapped 2LD and the owner otherwise', () => {
    expect(
      getV1Holder({ kind: 'v1-registrar', registrant: ME, controller: OTHER }),
    ).toBe(ME)
    expect(getV1Holder(wrapped({}, null, OTHER))).toBe(OTHER)
    expect(getV1Holder(registry(OTHER))).toBe(OTHER)
  })
})

describe('canReclaimV1Manager', () => {
  const live = { registration: 'active' } as const

  it('lets the registrant reclaim a manager role held by someone else', () => {
    expect(canReclaimV1Manager(state(registrar(), live), ME)).toBe(true)
  })

  it('offers the reclaim when the registry slot has no owner at all', () => {
    expect(canReclaimV1Manager(state(registrar(ME, null), live), ME)).toBe(true)
  })

  it('has nothing to reclaim when the registrant already manages it', () => {
    expect(canReclaimV1Manager(state(registrar(ME, ME), live), ME)).toBe(false)
  })

  it('refuses the manager, who holds no token to reclaim with', () => {
    expect(canReclaimV1Manager(state(registrar(OTHER, ME), live), ME)).toBe(
      false,
    )
  })

  it('refuses a stranger', () => {
    expect(canReclaimV1Manager(state(registrar(OTHER), live), ME)).toBe(false)
  })

  // `reclaim` is `live(id)`: grace has already passed `expiries[id]`, so the
  // call reverts. `ownerOf` reverts first in practice — belt as well as braces.
  it('refuses once the registration has lapsed', () => {
    expect(
      canReclaimV1Manager(
        state(registrar(), { registration: 'gracePeriod' }),
        ME,
      ),
    ).toBe(false)
    expect(
      canReclaimV1Manager(state(registrar(), { registration: 'expired' }), ME),
    ).toBe(false)
  })

  it('refuses a wrapped name, whose registrant is the wrapper itself', () => {
    expect(canReclaimV1Manager(state(wrapped({}, null, ME), live), ME)).toBe(
      false,
    )
  })

  it('refuses a plain registry name, which has no registrant at all', () => {
    expect(canReclaimV1Manager(state(registry(ME), live), ME)).toBe(false)
  })

  it('refuses with no state or no connected wallet', () => {
    expect(canReclaimV1Manager(null, ME)).toBe(false)
    expect(canReclaimV1Manager(state(registrar(), live), undefined)).toBe(false)
  })
})
