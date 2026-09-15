import { ChildFuses, decodeFuses, ParentFuses } from '@ensdomains/ensjs/utils'
import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import { deriveV1NameState, type V1NameReads } from './getV1NameState'

const ME = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const OTHER = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address
const WRAPPER = '0x0635513f179D50A207757E05759CbD106d7dFcE8' as Address
const RESOLVER = '0x3333333333333333333333333333333333333333' as Address
const ZERO = '0x0000000000000000000000000000000000000000' as Address

/** The ensjs `getWrapperData` shape, from a raw fuse bitmap. */
const wrapperData = (
  owner: Address,
  fuses = 0n,
  expiry: bigint | null = 1_821_784_092_000n,
): V1NameReads['wrapped'] => ({
  owner,
  expiry,
  fuses: { ...decodeFuses(Number(fuses)), value: Number(fuses) },
})

const reads = (overrides: Partial<V1NameReads>): V1NameReads => ({
  nameWrapper: WRAPPER,
  owner: null,
  wrapped: null,
  resolver: RESOLVER,
  expiry: null,
  parentOwner: null,
  parentWrapped: null,
  ancestorExpiry: null,
  ...overrides,
})

const wrappedOwner = (owner: Address) =>
  ({ owner, ownershipLevel: 'nameWrapper' }) as const

describe('deriveV1NameState — the subject', () => {
  it('is null for a name nobody owns', () => {
    expect(deriveV1NameState(reads({}))).toBeNull()
  })

  // Real Sepolia shapes from the vintagelabel.eth fixtures (2026-09-04).
  it('reads a wrapped subname with its fuses and expiry in seconds', () => {
    const state = deriveV1NameState(
      reads({
        owner: wrappedOwner(ME),
        wrapped: wrapperData(
          ME,
          ParentFuses.PARENT_CANNOT_CONTROL | ChildFuses.CANNOT_UNWRAP,
        ),
      }),
    )
    expect(state?.subject).toEqual({
      kind: 'v1-wrapped',
      owner: ME,
      fuses: {
        cannotTransfer: false,
        cannotSetResolver: false,
        cannotUnwrap: true,
        parentCannotControl: true,
      },
      expiry: 1_821_784_092n,
    })
  })

  // The wrapper clears the owner of an emancipated name past its expiry;
  // ensjs then reads it as "not wrapped" even though the registry says it is.
  it('treats a wrapped name with a zero wrapper owner as lapsed', () => {
    const state = deriveV1NameState(
      reads({ owner: wrappedOwner(ME), wrapped: null }),
    )
    expect(state?.subject).toBeNull()
  })

  it('treats a registry slot held by the wrapper with nobody behind it as lapsed', () => {
    const state = deriveV1NameState(
      reads({ owner: { owner: WRAPPER, ownershipLevel: 'registry' } }),
    )
    expect(state?.subject).toBeNull()
  })

  it('reads an unwrapped subname as a registry-only subject', () => {
    const state = deriveV1NameState(
      reads({ owner: { owner: ME, ownershipLevel: 'registry' } }),
    )
    expect(state?.subject).toEqual({ kind: 'v1-registry', owner: ME })
  })

  it('keeps registrant and controller apart for an unwrapped 2LD', () => {
    const state = deriveV1NameState(
      reads({
        owner: { owner: OTHER, registrant: ME, ownershipLevel: 'registrar' },
        expiry: { expiry: 1n, gracePeriod: 7_776_000, status: 'active' },
      }),
    )
    expect(state?.subject).toEqual({
      kind: 'v1-registrar',
      registrant: ME,
      controller: OTHER,
    })
    expect(state?.registration).toBe('active')
  })

  it('reads a lapsed 2LD (no registrant) from the registrar status', () => {
    const state = deriveV1NameState(
      reads({
        owner: { owner: ME, registrant: null, ownershipLevel: 'registrar' },
        expiry: { expiry: 1n, gracePeriod: 7_776_000, status: 'gracePeriod' },
      }),
    )
    expect(state?.subject).toBeNull()
    expect(state?.registration).toBe('gracePeriod')
  })

  it('reads a zero resolver as none', () => {
    const state = deriveV1NameState(
      reads({
        owner: wrappedOwner(ME),
        wrapped: wrapperData(ME),
        resolver: ZERO,
      }),
    )
    expect(state?.resolverAddress).toBeNull()
  })
})

describe('deriveV1NameState — the parent', () => {
  const child = {
    owner: wrappedOwner(ME),
    wrapped: wrapperData(ME),
  }

  it('is null for a 2LD (no parent reads)', () => {
    expect(deriveV1NameState(reads(child))?.parent).toBeNull()
  })

  it('reads a wrapped parent with its CANNOT_CREATE_SUBDOMAIN fuse', () => {
    const state = deriveV1NameState(
      reads({
        ...child,
        parentOwner: wrappedOwner(OTHER),
        parentWrapped: wrapperData(OTHER, ChildFuses.CANNOT_CREATE_SUBDOMAIN),
      }),
    )
    expect(state?.parent).toEqual({
      owner: OTHER,
      registrant: null,
      isWrapped: true,
      cannotCreateSubdomain: true,
    })
  })

  it('reads a lapsed emancipated wrapped parent as wrapped with no holder', () => {
    const state = deriveV1NameState(
      reads({
        ...child,
        parentOwner: { owner: WRAPPER, ownershipLevel: 'registry' },
        parentWrapped: null,
      }),
    )
    expect(state?.parent).toEqual({
      owner: null,
      registrant: null,
      isWrapped: true,
      cannotCreateSubdomain: false,
    })
  })

  it('reads an unwrapped 2LD parent with both its roles', () => {
    const state = deriveV1NameState(
      reads({
        ...child,
        parentOwner: {
          owner: OTHER,
          registrant: ME,
          ownershipLevel: 'registrar',
        },
      }),
    )
    expect(state?.parent).toEqual({
      owner: OTHER,
      registrant: ME,
      isWrapped: false,
      cannotCreateSubdomain: false,
    })
  })

  it('reads an unwrapped deeper parent from its registry slot', () => {
    const state = deriveV1NameState(
      reads({
        ...child,
        parentOwner: { owner: OTHER, ownershipLevel: 'registry' },
      }),
    )
    expect(state?.parent).toMatchObject({ owner: OTHER, isWrapped: false })
  })

  it('carries the .eth ancestor’s registrar status', () => {
    const state = deriveV1NameState(
      reads({
        ...child,
        ancestorExpiry: {
          expiry: 1n,
          gracePeriod: 7_776_000,
          status: 'expired',
        },
      }),
    )
    expect(state?.ancestorRegistration).toBe('expired')
  })
})
