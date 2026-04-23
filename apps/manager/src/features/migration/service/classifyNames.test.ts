import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  type ClassifiedName,
  classifyName,
  classifyNames,
  FUSES,
  groupClassifiedNames,
} from './classifyNames'
import type { V1Domain } from './v1SubgraphClient'

const OWNER: Address = '0x0000000000000000000000000000000000000001'
const OTHER: Address = '0x0000000000000000000000000000000000000002'
const RESOLVER = '0x000000000000000000000000000000000000dddd'

type DomainOverrides = {
  id?: string
  name?: string
  labelName?: string | null
  parentName?: string | null
  parentFuses?: number | null
  registrantId?: string | null
  wrappedOwnerId?: string | null
  ownerId?: string
  fuses?: number
  resolverAddress?: string | null
  registrationExpiry?: string | null
  wrappedExpiry?: string | null
  isWrapped?: boolean
}

const makeDomain = (o: DomainOverrides = {}): V1Domain => {
  const isWrapped = o.isWrapped ?? false
  const parent: V1Domain['parent'] =
    o.parentName === null
      ? null
      : {
          name: o.parentName ?? 'eth',
          id: '0xparent',
          wrappedDomain:
            o.parentFuses === null || o.parentFuses === undefined
              ? null
              : { fuses: o.parentFuses },
        }
  return {
    id: o.id ?? '0xabc',
    labelName: o.labelName === undefined ? 'alice' : o.labelName,
    labelhash: '0xlabelhash',
    name: o.name ?? 'alice.eth',
    isMigrated: false,
    createdAt: '0',
    resolvedAddress: null,
    resolver:
      o.resolverAddress === null
        ? null
        : { id: 'r', address: o.resolverAddress ?? RESOLVER },
    owner: { id: o.ownerId ?? OWNER },
    registrant:
      o.registrantId === null ? null : { id: o.registrantId ?? OWNER },
    wrappedOwner:
      o.wrappedOwnerId === null
        ? null
        : isWrapped
          ? { id: o.wrappedOwnerId ?? OWNER }
          : null,
    parent,
    registration: o.registrationExpiry
      ? { registrationDate: '0', expiryDate: o.registrationExpiry }
      : null,
    wrappedDomain: isWrapped
      ? {
          expiryDate: o.wrappedExpiry ?? '100',
          fuses: o.fuses ?? 0,
        }
      : null,
  }
}

describe('classifyName', () => {
  describe('early returns', () => {
    it('returns null when labelName is missing', () => {
      expect(classifyName(makeDomain({ labelName: null }), OWNER)).toBeNull()
    })

    it('returns null for unwrapped when registrant does not match owner', () => {
      expect(
        classifyName(makeDomain({ registrantId: OTHER }), OWNER),
      ).toBeNull()
    })

    it('returns null for unwrapped when registrant is missing', () => {
      expect(classifyName(makeDomain({ registrantId: null }), OWNER)).toBeNull()
    })

    it('returns null for unwrapped when parent is not .eth', () => {
      expect(
        classifyName(makeDomain({ parentName: 'raffy.eth' }), OWNER),
      ).toBeNull()
    })

    it('returns null for wrapped when wrappedOwner does not match', () => {
      expect(
        classifyName(
          makeDomain({ isWrapped: true, wrappedOwnerId: OTHER }),
          OWNER,
        ),
      ).toBeNull()
    })

    it('returns null when the registrant id is not a valid Address', () => {
      const bogus = makeDomain({ registrantId: 'not-an-address' })
      expect(classifyName(bogus, OWNER)).toBeNull()
    })

    it('returns null when the wrappedOwner id is not a valid Address', () => {
      const bogus = makeDomain({
        isWrapped: true,
        wrappedOwnerId: 'not-an-address',
      })
      expect(classifyName(bogus, OWNER)).toBeNull()
    })
  })

  describe('unwrapped 2LD', () => {
    it('classifies as unwrapped and keeps custom v1 resolver', () => {
      const result = classifyName(makeDomain(), OWNER)
      expect(result?.type).toBe('classified')
      const n = (result as { type: 'classified'; name: ClassifiedName }).name
      expect(n.tokenType).toBe('unwrapped')
      expect(n.fuses).toBe(0)
      expect(n.v1ResolverAddress).toBe(RESOLVER)
      expect(n.resolverStrategy).toBe('keep-v1')
      expect(n.managerAddress).toBeNull()
      expect(n.tokenHolder.toLowerCase()).toBe(OWNER.toLowerCase())
    })

    it('routes names with no v1 resolver to the owned PermRes', () => {
      const result = classifyName(makeDomain({ resolverAddress: null }), OWNER)
      expect(result?.type).toBe('classified')
      const n = (result as { type: 'classified'; name: ClassifiedName }).name
      expect(n.v1ResolverAddress).toBeNull()
      expect(n.resolverStrategy).toBe('to-owned-permres')
    })

    it('flags the registry owner as managerAddress when it differs from the registrant', () => {
      const MANAGER = '0x0000000000000000000000000000000000000099' as Address
      const result = classifyName(makeDomain({ ownerId: MANAGER }), OWNER)
      const n = (result as { type: 'classified'; name: ClassifiedName }).name
      expect(n.managerAddress?.toLowerCase()).toBe(MANAGER.toLowerCase())
    })
  })

  describe('unlocked 2LD', () => {
    it('classifies as unlocked when wrapped but CANNOT_UNWRAP not burnt', () => {
      const result = classifyName(
        makeDomain({ isWrapped: true, fuses: 0 }),
        OWNER,
      )
      expect(result?.type).toBe('classified')
      expect(
        (result as { type: 'classified'; name: ClassifiedName }).name.tokenType,
      ).toBe('unlocked')
    })
  })

  describe('unlocked subnames', () => {
    it('returns unlocked-subname ineligible when parent != eth and not emancipated', () => {
      const result = classifyName(
        makeDomain({
          isWrapped: true,
          parentName: 'raffy.eth',
          fuses: 0,
        }),
        OWNER,
      )
      expect(result?.type).toBe('ineligible')
      expect(
        (result as { type: 'ineligible'; name: { reason: string } }).name
          .reason,
      ).toBe('unlocked-subname')
    })

    it('classifies as detached-child when PARENT_CANNOT_CONTROL burnt and parent is locked', () => {
      const result = classifyName(
        makeDomain({
          isWrapped: true,
          parentName: 'raffy.eth',
          parentFuses: FUSES.CANNOT_UNWRAP,
          fuses: FUSES.PARENT_CANNOT_CONTROL,
        }),
        OWNER,
      )
      expect(result?.type).toBe('classified')
      expect(
        (result as { type: 'classified'; name: ClassifiedName }).name.tokenType,
      ).toBe('detached-child')
    })

    it('does not classify as detached when parent is unlocked', () => {
      const result = classifyName(
        makeDomain({
          isWrapped: true,
          parentName: 'raffy.eth',
          parentFuses: 0,
          fuses: FUSES.PARENT_CANNOT_CONTROL,
        }),
        OWNER,
      )
      expect(result?.type).toBe('ineligible')
    })
  })

  describe('locked 2LD / child', () => {
    it('classifies as locked-2ld when CANNOT_UNWRAP is set and parent is eth', () => {
      const result = classifyName(
        makeDomain({ isWrapped: true, fuses: FUSES.CANNOT_UNWRAP }),
        OWNER,
      )
      expect(result?.type).toBe('classified')
      expect(
        (result as { type: 'classified'; name: ClassifiedName }).name.tokenType,
      ).toBe('locked-2ld')
    })

    it('classifies as locked-child when parent is not eth', () => {
      const result = classifyName(
        makeDomain({
          isWrapped: true,
          fuses: FUSES.CANNOT_UNWRAP,
          parentName: 'raffy.eth',
        }),
        OWNER,
      )
      expect(result?.type).toBe('classified')
      expect(
        (result as { type: 'classified'; name: ClassifiedName }).name.tokenType,
      ).toBe('locked-child')
    })

    it('marks as not-transferable when CANNOT_TRANSFER is burnt', () => {
      const result = classifyName(
        makeDomain({
          isWrapped: true,
          fuses: FUSES.CANNOT_UNWRAP | FUSES.CANNOT_TRANSFER,
        }),
        OWNER,
      )
      expect(result?.type).toBe('ineligible')
      expect(
        (result as { type: 'ineligible'; name: { reason: string } }).name
          .reason,
      ).toBe('not-transferable')
    })

    it('marks as missing-parent when parent is null on a locked token', () => {
      const result = classifyName(
        makeDomain({
          isWrapped: true,
          fuses: FUSES.CANNOT_UNWRAP,
          parentName: null,
        }),
        OWNER,
      )
      expect(result?.type).toBe('ineligible')
      expect(
        (result as { type: 'ineligible'; name: { reason: string } }).name
          .reason,
      ).toBe('missing-parent')
    })

    it('routes to keep-v1 when CANNOT_SET_RESOLVER is burnt and v1 resolver exists', () => {
      const result = classifyName(
        makeDomain({
          isWrapped: true,
          fuses: FUSES.CANNOT_UNWRAP | FUSES.CANNOT_SET_RESOLVER,
        }),
        OWNER,
      )
      const n = (result as { type: 'classified'; name: ClassifiedName }).name
      expect(n.resolverStrategy).toBe('keep-v1')
    })

    it('falls back to owned-permres when CANNOT_SET_RESOLVER is burnt but v1 resolver is null', () => {
      const result = classifyName(
        makeDomain({
          isWrapped: true,
          fuses: FUSES.CANNOT_UNWRAP | FUSES.CANNOT_SET_RESOLVER,
          resolverAddress: null,
        }),
        OWNER,
      )
      const n = (result as { type: 'classified'; name: ClassifiedName }).name
      expect(n.resolverStrategy).toBe('to-owned-permres')
    })

    it('keeps custom v1 resolver even without CANNOT_SET_RESOLVER', () => {
      const result = classifyName(
        makeDomain({ isWrapped: true, fuses: FUSES.CANNOT_UNWRAP }),
        OWNER,
      )
      const n = (result as { type: 'classified'; name: ClassifiedName }).name
      expect(n.resolverStrategy).toBe('keep-v1')
    })
  })
})

describe('classifyNames', () => {
  it('splits classified and ineligible across many inputs', () => {
    const domains: V1Domain[] = [
      makeDomain({ id: '0x1' }),
      makeDomain({
        id: '0x2',
        isWrapped: true,
        fuses: FUSES.CANNOT_UNWRAP | FUSES.CANNOT_TRANSFER,
      }),
      makeDomain({
        id: '0x3',
        isWrapped: true,
        parentName: 'raffy.eth',
        fuses: 0,
      }),
      makeDomain({ id: '0x4', labelName: null }),
    ]
    const { classified, ineligible } = classifyNames(domains, OWNER)
    expect(classified.map((c) => c.domain.id)).toEqual(['0x1'])
    expect(
      ineligible.map((i) => ({ id: i.domain.id, reason: i.reason })),
    ).toEqual([
      { id: '0x2', reason: 'not-transferable' },
      { id: '0x3', reason: 'unlocked-subname' },
    ])
  })
})

describe('groupClassifiedNames', () => {
  const buildClassified = (
    tokenType: ClassifiedName['tokenType'],
    parentName: string | null,
    id = '0x00',
  ): ClassifiedName => ({
    tokenType,
    label: 'x',
    parentName,
    fuses: 0,
    tokenHolder: OWNER,
    v1ResolverAddress: null,
    resolverStrategy: 'to-owned-permres',
    managerAddress: null,
    domain: { id } as unknown as V1Domain,
  })

  it('buckets by token type and groups children by parentName', () => {
    const groups = groupClassifiedNames([
      buildClassified('unwrapped', 'eth'),
      buildClassified('unlocked', 'eth'),
      buildClassified('locked-2ld', 'eth'),
      buildClassified('locked-child', 'raffy.eth', '0x10'),
      buildClassified('detached-child', 'raffy.eth', '0x11'),
      buildClassified('locked-child', 'nick.eth', '0x12'),
    ])
    expect(groups.unwrapped).toHaveLength(1)
    expect(groups.unlocked).toHaveLength(1)
    expect(groups.locked2ld).toHaveLength(1)
    expect(groups.childNames.get('raffy.eth')).toHaveLength(2)
    expect(groups.childNames.get('nick.eth')).toHaveLength(1)
  })

  it('skips child rows with null parent', () => {
    const groups = groupClassifiedNames([buildClassified('locked-child', null)])
    expect(groups.childNames.size).toBe(0)
  })
})
