import { supportedL1Chains } from '@ensdomains/ensjs/chain'
import { labelhash, namehash } from 'viem'
import { describe, expect, it } from 'vitest'
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
const EXPIRES = '2030-01-01T00:00:00Z'
const EXPIRES_SECONDS = BigInt(Date.parse(EXPIRES) / 1000)

const record = (
  name: string,
  overrides: Partial<BignameV1NameRecord> = {},
): BignameV1NameRecord => ({
  name,
  namehash: namehash(name),
  owner: HOLDER,
  registrant: HOLDER,
  expires_at: EXPIRES,
  resolver: { address: RESOLVER },
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
  it('maps an unwrapped .eth 2LD, reading the registry owner from manager', () => {
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
      registration: { expiryDate: EXPIRES_SECONDS.toString() },
      wrappedDomain: null,
    })
  })

  it('adds the NameWrapper grace period to a wrapped .eth 2LD expiry', () => {
    const fuses = Number(FUSES.CANNOT_UNWRAP | FUSES.PARENT_CANNOT_CONTROL)
    const domain = v1DomainFromBigname(
      record('alice.eth', {
        wrapper_state: 'locked',
        wrapper_fuses: { fuses },
      }),
    )

    expect(domain.wrappedOwner).toEqual({ id: HOLDER.toLowerCase() })
    expect(domain.wrappedDomain).toEqual({
      expiryDate: (EXPIRES_SECONDS + GRACE_PERIOD_SECONDS).toString(),
      fuses,
    })
    expect(domain.registration).toEqual({
      expiryDate: EXPIRES_SECONDS.toString(),
    })
  })

  it('uses a wrapped subname expiry as the wrapper expiry and reads parent fuses', () => {
    const domain = v1DomainFromBigname(
      record('sub.alice.eth', {
        registrant: undefined,
        wrapper_state: 'emancipated',
        wrapper_fuses: { fuses: Number(FUSES.PARENT_CANNOT_CONTROL) },
      }),
      { wrapper_fuses: { fuses: Number(FUSES.CANNOT_UNWRAP) } },
    )

    expect(domain.registration).toBeNull()
    expect(domain.wrappedDomain?.expiryDate).toBe(EXPIRES_SECONDS.toString())
    expect(domain.parent).toEqual({
      name: 'alice.eth',
      wrappedDomain: { fuses: Number(FUSES.CANNOT_UNWRAP) },
    })
    expect(
      classifyName(domain, HOLDER, supportedL1Chains.sepolia),
    ).toMatchObject({
      type: 'classified',
      name: { tokenType: 'detached-child' },
    })
  })

  it('treats an omitted subname expiry as zero while only wrapped', () => {
    const domain = v1DomainFromBigname(
      record('sub.alice.eth', {
        expires_at: undefined,
        wrapper_state: 'wrapped',
        wrapper_fuses: { fuses: 0 },
      }),
    )
    expect(domain.wrappedDomain?.expiryDate).toBe('0')
  })

  it('treats an omitted expiry on an emancipated subname as unrepresentably large', () => {
    const domain = v1DomainFromBigname(
      record('sub.alice.eth', {
        expires_at: undefined,
        wrapper_state: 'emancipated',
        wrapper_fuses: { fuses: Number(FUSES.PARENT_CANNOT_CONTROL) },
      }),
    )
    expect(domain.wrappedDomain?.expiryDate).toBe(((1n << 64n) - 1n).toString())
  })

  it('reads a wrapped row without wrapper fields as an expired wrapper', () => {
    const domain = v1DomainFromBigname(
      record('alice.eth', { registration_status: 'wrapped' }),
    )
    expect(domain.wrappedOwner).toEqual({ id: HOLDER.toLowerCase() })
    expect(domain.wrappedDomain).toEqual({ expiryDate: '0', fuses: 0 })
  })

  it('reads a registry-only subname owner from owner', () => {
    const domain = v1DomainFromBigname(
      record('sub.alice.eth', {
        registrant: undefined,
        resolver: null,
        manager: CONTROLLER,
      }),
    )
    expect(domain.owner).toEqual({ id: HOLDER.toLowerCase() })
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
