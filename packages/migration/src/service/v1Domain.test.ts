import {
  mockEnsV1LapsedWrapper,
  mockEnsV1WrapperNoExpiry,
  mockEnsV1WrapperTrailsLease,
  mockNameWrapperExpiry,
  mockNameWrapperExpiryNotSet,
} from '@ens-apps/bigname/postV041.mock'
import { mockNameNick, mockNameWrappedSub } from '@ens-apps/bigname/v041.mock'
import { supportedL1Chains } from '@ensdomains/ensjs/chain'
import { labelhash, namehash } from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { classifyName, FUSES } from './classifyNames'
import { GRACE_PERIOD_SECONDS } from './constants'
import {
  type BignameV1NameRecord,
  v1DomainFromBigname,
  v1ParentName,
} from './v1Domain'

const HOLDER = '0x00000000000000000000000000000000000000AA'
const CONTROLLER = '0x00000000000000000000000000000000000000bb'
const RESOLVER = '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5'
const DAY = 86_400n
const NOW_SECONDS = BigInt(Math.floor(Date.now() / 1000))
/** The ENSv1 lease, a year out. */
const LEASE_SECONDS = NOW_SECONDS + 365n * DAY
const LEASE = LEASE_SECONDS.toString()
/** The ENSv2 reservation premigration made: lease + 62 days. */
const RESERVATION = (LEASE_SECONDS + 62n * DAY).toString()

const lockedFuses = Number(
  FUSES.CANNOT_UNWRAP | FUSES.PARENT_CANNOT_CONTROL | FUSES.IS_DOT_ETH,
)

/** An unwrapped `.eth` 2LD as bigname v0.4.1 serves it after the cutover. */
const record = (
  name: string,
  overrides: Partial<BignameV1NameRecord> = {},
): BignameV1NameRecord => ({
  name,
  namehash: namehash(name),
  owner: HOLDER,
  manager: HOLDER,
  expires_at: RESERVATION,
  registration_status: 'active',
  resolver: { address: RESOLVER },
  ens_v1: { expires_at: LEASE },
  ...overrides,
})

const wrappedSub = (
  name: string,
  overrides: Partial<BignameV1NameRecord> = {},
): BignameV1NameRecord =>
  record(name, {
    registration_status: 'wrapped',
    ens_v1: {
      expires_at: null,
      wrapper_state: 'emancipated',
      wrapper_fuses: { fuses: Number(FUSES.PARENT_CANNOT_CONTROL) },
    },
    ...overrides,
  })

describe('v1ParentName', () => {
  it('strips the first label', () => {
    expect(v1ParentName('sub.alice.eth')).toBe('alice.eth')
    expect(v1ParentName('alice.eth')).toBe('eth')
    expect(v1ParentName('eth')).toBeNull()
  })
})

describe('v1DomainFromBigname', () => {
  it('maps an unwrapped .eth 2LD: token holder from owner, registry owner from manager, lease from ens_v1', () => {
    const domain = v1DomainFromBigname(
      record('alice.eth', { manager: CONTROLLER }),
    )

    expect(domain).toEqual({
      id: namehash('alice.eth'),
      labelName: 'alice',
      labelhash: labelhash('alice'),
      name: 'alice.eth',
      resolver: { address: RESOLVER },
      owner: { id: CONTROLLER.toLowerCase() },
      registrant: { id: HOLDER.toLowerCase() },
      wrappedOwner: null,
      parent: { name: 'eth', wrappedDomain: null },
      registration: { expiryDate: LEASE },
      wrappedDomain: null,
    })
  })

  it('lists an unwrapped .eth 2LD for its token holder, also when owner != manager', () => {
    const domain = v1DomainFromBigname(
      record('alice.eth', {
        manager: CONTROLLER,
        registration_status: 'registered',
      }),
    )

    expect(
      classifyName(domain, HOLDER, supportedL1Chains.sepolia),
    ).toMatchObject({
      type: 'classified',
      name: {
        tokenType: 'unwrapped',
        tokenHolder: HOLDER.toLowerCase(),
        managerAddress: CONTROLLER.toLowerCase(),
      },
    })
    expect(
      classifyName(domain, CONTROLLER, supportedL1Chains.sepolia),
    ).toBeNull()
  })

  it('never reads the top-level (ENSv2) expiry as the lease', () => {
    const domain = v1DomainFromBigname(
      record('alice.eth', {
        expires_at: (NOW_SECONDS + 30n * DAY).toString(),
        ens_v1: { expires_at: (NOW_SECONDS - 30n * DAY).toString() },
      }),
    )

    expect(domain.registration).toEqual({
      expiryDate: (NOW_SECONDS - 30n * DAY).toString(),
    })
    expect(
      classifyName(domain, HOLDER, supportedL1Chains.sepolia),
    ).toMatchObject({
      type: 'ineligible',
      name: { reason: 'expired-registration' },
    })
  })

  it('reads wrapper state and fuses from ens_v1 and adds the grace period to the lease', () => {
    const domain = v1DomainFromBigname(
      record('alice.eth', {
        registration_status: 'wrapped',
        ens_v1: {
          expires_at: LEASE,
          wrapper_state: 'locked',
          wrapper_fuses: { fuses: lockedFuses },
        },
      }),
    )

    expect(domain.wrappedOwner).toEqual({ id: HOLDER.toLowerCase() })
    expect(domain.registrant).toBeNull()
    expect(domain.wrappedDomain).toEqual({
      expiryDate: (LEASE_SECONDS + GRACE_PERIOD_SECONDS).toString(),
      fuses: lockedFuses,
    })
    expect(domain.registration).toEqual({ expiryDate: LEASE })
    expect(
      classifyName(domain, HOLDER, supportedL1Chains.sepolia),
    ).toMatchObject({ type: 'classified', name: { tokenType: 'locked-2ld' } })
  })

  it('prefers the served NameWrapper expiry from address-row restrictions', () => {
    const served = (LEASE_SECONDS + 100n * DAY).toString()
    const wrapped = record('alice.eth', {
      registration_status: 'wrapped',
      ens_v1: {
        expires_at: LEASE,
        wrapper_state: 'locked',
        wrapper_fuses: { fuses: lockedFuses },
      },
    })

    expect(
      v1DomainFromBigname(wrapped, null, {
        kind: 'ens_v1_wrapper',
        wrapper_expires_at: served,
      }).wrappedDomain?.expiryDate,
    ).toBe(served)
    expect(
      v1DomainFromBigname(wrappedSub('sub.alice.eth'), null, {
        kind: 'ens_v1_wrapper',
        wrapper_expires_at: null,
        wrapper_expires_at_reason: 'not_set',
      }).wrappedDomain?.expiryDate,
    ).toBe('0')
    expect(
      v1DomainFromBigname(wrapped, null, {
        kind: 'ens_v2_registry',
      }).wrappedDomain?.expiryDate,
    ).toBe((LEASE_SECONDS + GRACE_PERIOD_SECONDS).toString())
  })

  it('classifies a locked .eth 2LD whose lease is in grace (no manager served) as expired-registration', () => {
    const lease = NOW_SECONDS - 3n * DAY
    const domain = v1DomainFromBigname(
      record('leon000.eth', {
        manager: undefined,
        registration_status: 'wrapped',
        expires_at: (lease + 62n * DAY).toString(),
        ens_v1: {
          expires_at: lease.toString(),
          wrapper_state: 'locked',
          wrapper_fuses: { fuses: lockedFuses },
        },
      }),
    )

    expect(domain.registration).toEqual({ expiryDate: lease.toString() })
    expect(domain.wrappedDomain?.expiryDate).toBe(
      (lease + GRACE_PERIOD_SECONDS).toString(),
    )
    expect(
      classifyName(domain, HOLDER, supportedL1Chains.sepolia),
    ).toMatchObject({
      type: 'ineligible',
      name: { reason: 'expired-registration' },
    })
  })

  it('uses a wrapped subname expiry as the wrapper expiry and reads parent fuses from ens_v1', () => {
    const domain = v1DomainFromBigname(wrappedSub('sub.alice.eth'), {
      ens_v1: { wrapper_fuses: { fuses: lockedFuses } },
    })

    expect(domain.registration).toBeNull()
    expect(domain.registrant).toBeNull()
    expect(domain.wrappedDomain?.expiryDate).toBe(RESERVATION)
    expect(domain.parent).toEqual({
      name: 'alice.eth',
      wrappedDomain: { fuses: lockedFuses },
    })
    expect(
      classifyName(domain, HOLDER, supportedL1Chains.sepolia),
    ).toMatchObject({
      type: 'classified',
      name: { tokenType: 'detached-child' },
    })
  })

  it('classifies a wrapped subname past its wrapper expiry as expired-registration', () => {
    const domain = v1DomainFromBigname(
      wrappedSub('sub001.leon000.eth', {
        expires_at: '1728697233',
        ens_v1: {
          expires_at: null,
          wrapper_state: 'wrapped',
          wrapper_fuses: { fuses: 0 },
        },
      }),
    )

    expect(domain.wrappedDomain).toEqual({ expiryDate: '1728697233', fuses: 0 })
    expect(
      classifyName(domain, HOLDER, supportedL1Chains.sepolia),
    ).toMatchObject({
      type: 'ineligible',
      name: { reason: 'expired-registration' },
    })
  })

  it('reads a null subname expiry with reason not_set as zero', () => {
    const domain = v1DomainFromBigname(
      wrappedSub('sub.alice.eth', {
        expires_at: null,
        expires_at_reason: 'not_set',
        ens_v1: {
          expires_at: null,
          wrapper_state: 'wrapped',
          wrapper_fuses: { fuses: 0 },
        },
      }),
    )
    expect(domain.wrappedDomain?.expiryDate).toBe('0')
  })

  it('reads a null subname expiry with reason no_expiry as the uint64 maximum', () => {
    const domain = v1DomainFromBigname(
      wrappedSub('sub.alice.eth', {
        expires_at: null,
        expires_at_reason: 'no_expiry',
      }),
    )
    expect(domain.wrappedDomain?.expiryDate).toBe(((1n << 64n) - 1n).toString())
  })

  it('treats an omitted subname expiry as zero while only wrapped', () => {
    const domain = v1DomainFromBigname(
      wrappedSub('sub.alice.eth', {
        expires_at: undefined,
        ens_v1: {
          expires_at: null,
          wrapper_state: 'wrapped',
          wrapper_fuses: { fuses: 0 },
        },
      }),
    )
    expect(domain.wrappedDomain?.expiryDate).toBe('0')
  })

  it('treats an omitted expiry on an emancipated subname as unrepresentably large', () => {
    const domain = v1DomainFromBigname(
      wrappedSub('sub.alice.eth', { expires_at: undefined }),
    )
    expect(domain.wrappedDomain?.expiryDate).toBe(((1n << 64n) - 1n).toString())
  })

  it('reads a wrapped row without wrapper fields as an expired wrapper', () => {
    const domain = v1DomainFromBigname(
      record('alice.eth', { registration_status: 'wrapped' }),
    )
    expect(domain.wrappedOwner).toEqual({ id: HOLDER.toLowerCase() })
    expect(domain.registrant).toBeNull()
    expect(domain.wrappedDomain).toEqual({ expiryDate: '0', fuses: 0 })
  })

  it('reads a registry-only subname owner from owner', () => {
    const domain = v1DomainFromBigname(
      record('sub.alice.eth', {
        registration_status: 'unregistered',
        expires_at: undefined,
        ens_v1: { expires_at: null },
        resolver: null,
        manager: CONTROLLER,
      }),
    )
    expect(domain.owner).toEqual({ id: HOLDER.toLowerCase() })
    expect(domain.registrant).toBeNull()
    expect(domain.registration).toBeNull()
    expect(domain.resolver).toBeNull()
    expect(domain.wrappedOwner).toBeNull()
  })

  it('keeps a placeholder label unknown and recovers its labelhash', () => {
    const hash = labelhash('secret').slice(2)
    const name = `[${hash}].eth`
    const domain = v1DomainFromBigname(record(name))

    expect(domain.labelhash).toBe(`0x${hash}`)
    expect(
      classifyName(domain, HOLDER, supportedL1Chains.sepolia),
    ).toMatchObject({
      type: 'ineligible',
      name: { reason: 'unknown-label' },
    })
  })

  it('marks the label unknown when the served name does not hash to the node', () => {
    const domain = v1DomainFromBigname(
      record('alice.eth', { namehash: namehash('Alice.eth') }),
    )
    expect(domain.labelName).toBeNull()
    expect(
      classifyName(domain, HOLDER, supportedL1Chains.sepolia),
    ).toMatchObject({
      type: 'ineligible',
      name: { reason: 'unknown-label' },
    })
  })
})

describe('v1DomainFromBigname NameWrapper entry expiry', () => {
  const NICK = mockNameNick.data.owner
  const NICK_LEASE = BigInt(mockNameNick.data.ens_v1.expires_at)
  const MAX_UINT64 = ((1n << 64n) - 1n).toString()
  /** `mockEnsV1WrapperTrailsLease`: the entry stops transferring here, the lease runs a year longer. */
  const STALE_ENTRY = BigInt(mockEnsV1WrapperTrailsLease.wrapper_expires_at)
  const STALE_TRANSFER_END = STALE_ENTRY - GRACE_PERIOD_SECONDS
  const staleWrapped = {
    ...mockNameNick.data,
    ens_v1: mockEnsV1WrapperTrailsLease,
  }

  const classifyAt = (
    seconds: bigint,
    domain: ReturnType<typeof v1DomainFromBigname>,
  ) => {
    vi.useFakeTimers()
    vi.setSystemTime(Number(seconds) * 1000)
    return classifyName(domain, NICK, supportedL1Chains.sepolia)
  }

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('bigname v0.4.1 (no ens_v1.wrapper_expires_at)', () => {
    it('derives a wrapped .eth 2LD entry as the lease plus the grace period', () => {
      expect(v1DomainFromBigname(mockNameNick.data).wrappedDomain).toEqual({
        expiryDate: (NICK_LEASE + GRACE_PERIOD_SECONDS).toString(),
        fuses: mockNameNick.data.ens_v1.wrapper_fuses.fuses,
      })
    })

    it('derives a wrapped subname entry from the top-level expiry', () => {
      expect(
        v1DomainFromBigname(mockNameWrappedSub).wrappedDomain?.expiryDate,
      ).toBe('0')
    })

    it('still prefers the address-row restrictions over the derivation', () => {
      expect(
        v1DomainFromBigname(mockNameNick.data, null, {
          kind: 'ens_v1_wrapper',
          wrapper_expires_at: STALE_ENTRY.toString(),
        }).wrappedDomain?.expiryDate,
      ).toBe(STALE_ENTRY.toString())
    })

    it('keeps a wrapped name whose lease is live migratable through the old cutoff', () => {
      const { wrapper_expires_at: _, ...ensV1 } = mockEnsV1WrapperTrailsLease
      const domain = v1DomainFromBigname({
        ...mockNameNick.data,
        ens_v1: ensV1,
      })

      expect(domain.wrappedDomain?.expiryDate).toBe(
        (BigInt(ensV1.expires_at) + GRACE_PERIOD_SECONDS).toString(),
      )
      expect(classifyAt(STALE_TRANSFER_END + DAY, domain)).toMatchObject({
        type: 'classified',
        name: { tokenType: 'unlocked' },
      })
    })
  })

  describe('after bigname v0.4.1 (ens_v1.wrapper_expires_at served)', () => {
    it('uses the served expiry of a backed wrapper', () => {
      const domain = v1DomainFromBigname(mockNameWrapperExpiry)

      expect(domain.wrappedDomain).toEqual({
        expiryDate: mockNameWrapperExpiry.ens_v1.wrapper_expires_at,
        fuses: mockNameWrapperExpiry.ens_v1.wrapper_fuses.fuses,
      })
      expect(classifyAt(NICK_LEASE - DAY, domain)).toMatchObject({
        type: 'classified',
        name: { tokenType: 'unlocked' },
      })
    })

    it('prefers ens_v1 over the address-row restrictions', () => {
      expect(
        v1DomainFromBigname(mockNameWrapperExpiry, null, {
          kind: 'ens_v1_wrapper',
          wrapper_expires_at: '1',
        }).wrappedDomain?.expiryDate,
      ).toBe(mockNameWrapperExpiry.ens_v1.wrapper_expires_at)
    })

    it('reads null with reason not_set as zero', () => {
      expect(
        v1DomainFromBigname(mockNameWrapperExpiryNotSet).wrappedDomain
          ?.expiryDate,
      ).toBe('0')
    })

    it('reads null with reason no_expiry as the uint64 maximum', () => {
      // The top-level expiry would derive something else: the served value wins.
      const domain = v1DomainFromBigname({
        ...mockNameWrappedSub,
        expires_at: '1',
        ens_v1: mockEnsV1WrapperNoExpiry,
      })
      expect(domain.wrappedDomain?.expiryDate).toBe(MAX_UINT64)
    })

    it('keeps an entry that trails its lease instead of adding grace to the lease', () => {
      const domain = v1DomainFromBigname(staleWrapped)

      expect(domain.registration).toEqual({
        expiryDate: mockEnsV1WrapperTrailsLease.expires_at,
      })
      expect(domain.wrappedDomain?.expiryDate).toBe(STALE_ENTRY.toString())
    })

    it('classifies a trailing entry as migratable while NameWrapper still transfers it', () => {
      expect(
        classifyAt(STALE_TRANSFER_END - DAY, v1DomainFromBigname(staleWrapped)),
      ).toMatchObject({ type: 'classified', name: { tokenType: 'unlocked' } })
    })

    it('classifies a trailing entry as expired-registration once NameWrapper freezes it, although the lease is live', () => {
      expect(
        classifyAt(STALE_TRANSFER_END + DAY, v1DomainFromBigname(staleWrapped)),
      ).toMatchObject({
        type: 'ineligible',
        name: { reason: 'expired-registration' },
      })
    })

    it('reads a past expiry with no wrapper_state as a lapsed wrapper nobody holds', () => {
      const { owner: _owner, manager: _manager, ...lapsed } = mockNameWrappedSub
      const domain = v1DomainFromBigname({
        ...lapsed,
        ens_v1: mockEnsV1LapsedWrapper,
      })

      expect(domain.wrappedDomain).toEqual({
        expiryDate: mockEnsV1LapsedWrapper.wrapper_expires_at,
        fuses: 0,
      })
      expect(domain.wrappedOwner).toBeNull()
      expect(
        classifyAt(
          BigInt(mockEnsV1LapsedWrapper.wrapper_expires_at) + DAY,
          domain,
        ),
      ).toBeNull()
    })

    it('classifies a lapsed wrapped subname as expired-registration for a holder bigname still serves', () => {
      const domain = v1DomainFromBigname({
        ...mockNameWrappedSub,
        ens_v1: mockEnsV1LapsedWrapper,
      })

      expect(
        classifyAt(
          BigInt(mockEnsV1LapsedWrapper.wrapper_expires_at) + DAY,
          domain,
        ),
      ).toMatchObject({
        type: 'ineligible',
        name: { reason: 'expired-registration' },
      })
    })

    it('falls back to the derivation for a served wrapper_state with no served expiry', () => {
      // An unwrapped name can keep serving `wrapper_state`; it is not told
      // apart from a v0.4.1 row, so the entry is derived as before.
      expect(
        v1DomainFromBigname(mockNameNick.data).wrappedDomain?.expiryDate,
      ).toBe((NICK_LEASE + GRACE_PERIOD_SECONDS).toString())
    })
  })
})
