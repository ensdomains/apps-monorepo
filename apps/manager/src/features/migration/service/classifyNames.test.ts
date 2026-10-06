import type { V1Domain } from '@ens-apps/migration'
import { sepolia } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'
import { envConfig } from '@/config'
import {
  makeClassified,
  makeDomain,
  OTHER,
  OWNER,
  DEFAULT_RESOLVER as RESOLVER,
} from './_fixtures'
import {
  type ClassifiedName,
  classifyName,
  classifyNames,
  FUSES,
  groupClassifiedNames,
  managerRestorationCandidates,
  withManagerRestorationOptIn,
} from './classifyNames'

const classify = (o: Parameters<typeof makeDomain>[0] = {}) =>
  classifyName(makeDomain(o), OWNER, sepolia.id)

const classified = (r: ReturnType<typeof classifyName>): ClassifiedName => {
  if (r?.type !== 'classified') throw new Error('not classified')
  return r.name
}
const ineligibleReason = (r: ReturnType<typeof classifyName>) => {
  if (r?.type !== 'ineligible') throw new Error('not ineligible')
  return r.name.reason
}

describe('classifyName — early returns', () => {
  it.each([
    ['labelName is null', { labelName: null }, 'unknown-label'] as const,
    [
      'labelName is hex-bracket placeholder',
      { labelName: `[${'0'.repeat(64)}]`, name: `[${'0'.repeat(64)}].eth` },
      'unknown-label',
    ] as const,
    [
      'labelName contains a label separator',
      { labelName: 'bad.label' },
      'invalid-label',
    ] as const,
    [
      'labelName exceeds the DNS byte limit',
      { labelName: 'a'.repeat(256) },
      'invalid-label',
    ] as const,
  ])('marks ineligible when %s', (_, overrides, reason) => {
    expect(ineligibleReason(classify(overrides))).toBe(reason)
  })

  it.each([
    ['unwrapped registrant mismatch', { registrantId: OTHER }],
    ['unwrapped registrant missing', { registrantId: null }],
    [
      'registry-only subname owner mismatch',
      {
        name: 'sub.raffy.eth',
        parentName: 'raffy.eth',
        ownerId: OTHER,
      },
    ],
    [
      'wrapped wrappedOwner mismatch',
      { isWrapped: true, wrappedOwnerId: OTHER },
    ],
    ['registrant id is not an Address', { registrantId: 'not-an-address' }],
    [
      'wrappedOwner id is not an Address',
      { isWrapped: true, wrappedOwnerId: 'not-an-address' },
    ],
    [
      'wrapped unlocked child outside .eth',
      {
        isWrapped: true,
        name: 'sub.example.xyz',
        parentName: 'example.xyz',
        resolverAddress: null,
      },
    ],
  ])('returns null when %s', (_, overrides) => {
    expect(classify(overrides)).toBeNull()
  })
})

describe('classifyName — expired wrap', () => {
  it('treats wrapped .eth 2LD as unwrapped when wrappedDomain.expiryDate is in the past', () => {
    const n = classified(
      classify({
        isWrapped: true,
        wrappedExpiry: '100',
        wrappedOwnerId: OTHER,
        fuses: FUSES.PARENT_CANNOT_CONTROL | FUSES.IS_DOT_ETH,
      }),
    )
    expect(n.tokenType).toBe('unwrapped')
    expect(n.action).toBe('migrate')
    expect(n.fuses).toBe(0n)
    expect(n.tokenHolder.toLowerCase()).toBe(OWNER.toLowerCase())
  })

  it('keeps a wrapped-owner candidate when subgraph wrapper expiry is stale', () => {
    const n = classified(
      classify({
        isWrapped: true,
        registrantId: OTHER,
        wrappedExpiry: '100',
        fuses: FUSES.PARENT_CANNOT_CONTROL | FUSES.IS_DOT_ETH,
      }),
    )
    expect(n.tokenType).toBe('unlocked')
    expect(n.fuses).toBe(FUSES.PARENT_CANNOT_CONTROL | FUSES.IS_DOT_ETH)
    expect(n.tokenHolder.toLowerCase()).toBe(OWNER.toLowerCase())
  })
})

describe('classifyName — grace period registrations', () => {
  it('marks wrapped .eth 2LD in registration grace as ineligible', () => {
    expect(
      ineligibleReason(
        classify({
          isWrapped: true,
          registrationExpiry: '100',
          wrappedExpiry: '99999999999',
          fuses: FUSES.PARENT_CANNOT_CONTROL | FUSES.IS_DOT_ETH,
        }),
      ),
    ).toBe('expired-registration')
  })
})

describe('classifyName — token type', () => {
  it('unwrapped 2LD: keeps custom v1 resolver and records a divergent registry controller without appointing it', () => {
    const n = classified(classify())
    expect(n.tokenType).toBe('unwrapped')
    expect(n.v1ResolverAddress).toBe(RESOLVER)
    expect(n.resolverStrategy).toBe('keep-v1')
    expect(n.registryController).toBeNull()
    expect(n.managerAddress).toBeNull()
    expect(n.tokenHolder.toLowerCase()).toBe(OWNER.toLowerCase())

    // A controller that is not the registrant is recorded for review, never
    // carried forward as an appointed manager.
    const CONTROLLER = '0x0000000000000000000000000000000000000099'
    const diverged = classified(classify({ ownerId: CONTROLLER }))
    expect(diverged.registryController?.toLowerCase()).toBe(
      CONTROLLER.toLowerCase(),
    )
    expect(diverged.managerAddress).toBeNull()
  })

  it('unwrapped with no v1 resolver routes to owned-permres', () => {
    const n = classified(classify({ resolverAddress: null }))
    expect(n.v1ResolverAddress).toBeNull()
    expect(n.resolverStrategy).toBe('to-owned-permres')
  })

  it('moves the legacy Sepolia PublicResolver while leaving a separate controller ungranted', () => {
    const controller = '0x0000000000000000000000000000000000000099'
    const n = classified(
      classify({
        ownerId: controller,
        resolverAddress: '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5',
      }),
    )

    expect(n.tokenType).toBe('unwrapped')
    expect(n.resolverStrategy).toBe('to-owned-permres')
    expect(n.registryController?.toLowerCase()).toBe(controller.toLowerCase())
    expect(n.managerAddress).toBeNull()
  })

  it.each([
    [
      'unlocked when wrapped and CANNOT_UNWRAP not burnt',
      { isWrapped: true, fuses: 0n },
      'unlocked' as const,
    ],
    [
      'locked-2ld when CANNOT_UNWRAP burnt and parent is eth',
      { isWrapped: true, fuses: FUSES.CANNOT_UNWRAP },
      'locked-2ld' as const,
    ],
    [
      'locked-child when CANNOT_UNWRAP burnt and parent is not eth',
      {
        isWrapped: true,
        fuses: FUSES.CANNOT_UNWRAP,
        parentName: 'raffy.eth',
      },
      'locked-child' as const,
    ],
    [
      'unlocked-child copy when a wrapped child can unwrap',
      {
        isWrapped: true,
        name: 'sub.raffy.eth',
        parentName: 'raffy.eth',
        resolverAddress: null,
        fuses: 0n,
      },
      'unlocked-child' as const,
    ],
    [
      'detached-child migration when PARENT_CANNOT_CONTROL burnt and parent is locked',
      {
        isWrapped: true,
        parentName: 'raffy.eth',
        parentFuses: FUSES.CANNOT_UNWRAP,
        fuses: FUSES.PARENT_CANNOT_CONTROL,
      },
      'detached-child' as const,
    ],
  ])('classifies %s', (_, overrides, tokenType) => {
    expect(classified(classify(overrides)).tokenType).toBe(tokenType)
  })

  it('classifies an owned registry-only child as a non-expiring copy', () => {
    const n = classified(
      classify({
        name: 'sub.raffy.eth',
        parentName: 'raffy.eth',
        registrantId: null,
        resolverAddress: null,
      }),
    )

    expect(n).toMatchObject({
      action: 'copy',
      tokenType: 'registry-child',
      copySource: 'registry',
      sourceExpiry: (1n << 64n) - 1n,
      resolverStrategy: 'to-owned-permres',
      registryController: null,
      managerAddress: null,
    })
  })

  it('preserves the exact wrapped expiry on an unlocked child copy', () => {
    const n = classified(
      classify({
        isWrapped: true,
        name: 'sub.raffy.eth',
        parentName: 'raffy.eth',
        resolverAddress: null,
        wrappedExpiry: '4102444800',
      }),
    )

    expect(n).toMatchObject({
      action: 'copy',
      tokenType: 'unlocked-child',
      copySource: 'name-wrapper',
      sourceExpiry: 4_102_444_800n,
      resolverStrategy: 'to-owned-permres',
      registryController: null,
      managerAddress: null,
    })
  })
})

describe('classifyName — ineligible reasons', () => {
  it.each([
    [
      'unsupported-resolver',
      {
        isWrapped: true,
        name: 'sub.raffy.eth',
        parentName: 'raffy.eth',
        fuses: 0n,
      },
    ],
    [
      'not-transferable',
      {
        isWrapped: true,
        fuses: FUSES.CANNOT_UNWRAP | FUSES.CANNOT_TRANSFER,
      },
    ],
    [
      'missing-parent',
      {
        isWrapped: true,
        fuses: FUSES.CANNOT_UNWRAP,
        parentName: null,
      },
    ],
  ] as const)('flags %s', (reason, overrides) => {
    expect(ineligibleReason(classify(overrides))).toBe(reason)
  })

  it('does not classify as detached when parent is unlocked', () => {
    const n = classified(
      classify({
        isWrapped: true,
        name: 'sub.raffy.eth',
        parentName: 'raffy.eth',
        parentFuses: 0n,
        resolverAddress: null,
        fuses: FUSES.PARENT_CANNOT_CONTROL,
      }),
    )
    expect(n.action).toBe('copy')
    expect(n.tokenType).toBe('unlocked-child')
  })

  it('rejects an expired wrapped copy candidate', () => {
    expect(
      ineligibleReason(
        classify({
          isWrapped: true,
          name: 'sub.raffy.eth',
          parentName: 'raffy.eth',
          resolverAddress: null,
          wrappedExpiry: '100',
        }),
      ),
    ).toBe('expired-registration')
  })

  it('rejects a registry-only copy with a custom resolver', () => {
    expect(
      ineligibleReason(
        classify({
          name: 'sub.raffy.eth',
          parentName: 'raffy.eth',
          registrantId: null,
        }),
      ),
    ).toBe('unsupported-resolver')
  })
})

describe('classifyName — resolver strategy for locked', () => {
  const locked = (extra: Parameters<typeof classify>[0] = {}) =>
    classified(
      classify({
        isWrapped: true,
        fuses: FUSES.CANNOT_UNWRAP,
        ...extra,
      }),
    )

  it.each([
    [
      'keep-v1 when CANNOT_SET_RESOLVER burnt and v1 resolver exists',
      { fuses: FUSES.CANNOT_UNWRAP | FUSES.CANNOT_SET_RESOLVER },
      'keep-v1' as const,
    ],
    [
      'keep-v1 when CANNOT_SET_RESOLVER burnt and the v1 resolver is empty',
      {
        fuses: FUSES.CANNOT_UNWRAP | FUSES.CANNOT_SET_RESOLVER,
        resolverAddress: null,
      },
      'keep-v1' as const,
    ],
    [
      'keep-v1 with custom v1 resolver even without CANNOT_SET_RESOLVER',
      {},
      'keep-v1' as const,
    ],
  ] as const)('routes to %s', (_, overrides, strategy) => {
    expect(locked(overrides).resolverStrategy).toBe(strategy)
  })
})

describe('classifyNames', () => {
  it('keeps WEB-390 zero-expiry wrapped children under a selected unlocked 2LD', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-04T16:50:36Z'))

    try {
      const domains: V1Domain[] = [
        makeDomain({
          id: '0x1',
          name: '1year.eth',
          labelName: '1year',
          isWrapped: true,
          fuses: FUSES.PARENT_CANNOT_CONTROL | FUSES.IS_DOT_ETH,
          wrappedExpiry: '1793477232',
          resolverAddress: '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD',
        }),
        makeDomain({
          id: '0x2',
          name: 'test.1year.eth',
          labelName: 'test',
          parentName: '1year.eth',
          parentFuses: FUSES.PARENT_CANNOT_CONTROL | FUSES.IS_DOT_ETH,
          isWrapped: true,
          fuses: 0n,
          wrappedExpiry: '0',
          resolverAddress: '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5',
        }),
      ]

      const { classified: names, ineligible } = classifyNames(
        domains,
        OWNER,
        envConfig.chain.id,
      )

      expect(
        names.map(({ domain, action, tokenType }) => [
          domain.name,
          action,
          tokenType,
        ]),
      ).toEqual([
        ['1year.eth', 'migrate', 'unlocked'],
        ['test.1year.eth', 'copy', 'unlocked-child'],
      ])
      expect(names[1]).toMatchObject({
        action: 'copy',
        copySource: 'name-wrapper',
        sourceExpiry: 0n,
      })
      expect(ineligible).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects zero expiry after a wrapped child is emancipated', () => {
    const result = classify({
      name: 'sub.example.eth',
      labelName: 'sub',
      parentName: 'example.eth',
      parentFuses: 0n,
      isWrapped: true,
      fuses: FUSES.PARENT_CANNOT_CONTROL,
      wrappedExpiry: '0',
      resolverAddress: null,
    })

    expect(ineligibleReason(result)).toBe('expired-registration')
  })

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
        name: 'sub.raffy.eth',
        isWrapped: true,
        parentName: 'raffy.eth',
        resolverAddress: null,
        fuses: 0n,
      }),
      makeDomain({ id: '0x4', labelName: null }),
    ]
    const { classified, ineligible } = classifyNames(
      domains,
      OWNER,
      envConfig.chain.id,
    )
    expect(classified.map((c) => c.domain.id)).toEqual(['0x1'])
    expect(ineligible.map((i) => [i.domain.id, i.reason])).toEqual([
      ['0x2', 'not-transferable'],
      ['0x3', 'missing-parent'],
      ['0x4', 'unknown-label'],
    ])
  })

  it('keeps arbitrary-depth copy nodes when the complete route ends at a migrating root', () => {
    const domains: V1Domain[] = [
      makeDomain({ id: '0x1', name: 'raffy.eth', labelName: 'raffy' }),
      makeDomain({
        id: '0x2',
        name: 'foo.raffy.eth',
        labelName: 'foo',
        parentName: 'raffy.eth',
        resolverAddress: null,
        registrantId: null,
      }),
      makeDomain({
        id: '0x3',
        name: 'bar.foo.raffy.eth',
        labelName: 'bar',
        parentName: 'foo.raffy.eth',
        resolverAddress: null,
        registrantId: null,
      }),
    ]

    const { classified: names, ineligible } = classifyNames(
      domains,
      OWNER,
      envConfig.chain.id,
    )

    expect(names.map((name) => [name.domain.name, name.action])).toEqual([
      ['raffy.eth', 'migrate'],
      ['foo.raffy.eth', 'copy'],
      ['bar.foo.raffy.eth', 'copy'],
    ])
    expect(ineligible).toEqual([])
  })

  it('rejects a copy route rooted in a locked 2LD', () => {
    const domains: V1Domain[] = [
      makeDomain({
        id: '0x1',
        name: 'raffy.eth',
        labelName: 'raffy',
        isWrapped: true,
        fuses: FUSES.CANNOT_UNWRAP,
      }),
      makeDomain({
        id: '0x2',
        name: 'foo.raffy.eth',
        labelName: 'foo',
        parentName: 'raffy.eth',
        resolverAddress: null,
        registrantId: null,
      }),
    ]

    const result = classifyNames(domains, OWNER, envConfig.chain.id)

    expect(result.classified.map((name) => name.domain.name)).toEqual([
      'raffy.eth',
    ])
    expect(result.ineligible.map((name) => name.reason)).toEqual([
      'missing-parent',
    ])
  })
})

describe('groupClassifiedNames', () => {
  const c = (
    tokenType: ClassifiedName['tokenType'],
    parentName: string | null,
    id = '0x00',
  ): ClassifiedName => makeClassified({ tokenType, parentName, id })

  it('buckets by token type and groups children by parentName', () => {
    const g = groupClassifiedNames([
      c('unwrapped', 'eth'),
      c('unlocked', 'eth'),
      c('locked-2ld', 'eth'),
      c('locked-child', 'raffy.eth', '0x10'),
      c('detached-child', 'raffy.eth', '0x11'),
      c('unlocked-child', 'raffy.eth', '0x13'),
      c('registry-child', 'nick.eth', '0x14'),
      c('locked-child', 'nick.eth', '0x12'),
    ])
    expect(g.unwrapped).toHaveLength(1)
    expect(g.unlocked).toHaveLength(1)
    expect(g.locked2ld).toHaveLength(1)
    expect(g.childNames.get('raffy.eth')).toHaveLength(3)
    expect(g.childNames.get('nick.eth')).toHaveLength(2)
  })

  it('skips child rows with null parent', () => {
    expect(
      groupClassifiedNames([c('locked-child', null)]).childNames.size,
    ).toBe(0)
  })
})

describe('manager restoration opt-in', () => {
  const CONTROLLER = '0x0000000000000000000000000000000000000099'

  const divergedName = () => classified(classify({ ownerId: CONTROLLER }))

  it('offers a candidate only where the registrant and controller disagree', () => {
    const diverged = divergedName()
    const aligned = classified(classify())

    expect(managerRestorationCandidates([diverged, aligned])).toEqual([
      diverged,
    ])
  })

  it('grants nothing until the name is opted in by name', () => {
    const diverged = divergedName()

    expect(withManagerRestorationOptIn([diverged], [])[0]?.managerAddress).toBe(
      null,
    )
    expect(
      withManagerRestorationOptIn([diverged], ['other.eth'])[0]?.managerAddress,
    ).toBe(null)
  })

  it('carries the controller across only for opted-in names, case-insensitively', () => {
    const diverged = divergedName()
    const [optedIn] = withManagerRestorationOptIn(
      [diverged],
      [diverged.domain.name.toUpperCase()],
    )

    expect(optedIn?.managerAddress?.toLowerCase()).toBe(
      CONTROLLER.toLowerCase(),
    )
  })

  it('never appoints a manager for a name with no divergent controller', () => {
    const aligned = classified(classify())
    const [result] = withManagerRestorationOptIn(
      [aligned],
      [aligned.domain.name],
    )

    expect(result?.managerAddress).toBeNull()
  })
})
