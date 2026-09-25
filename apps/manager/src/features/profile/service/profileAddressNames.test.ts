import type { DomainFragment } from '@ens-apps/indexer'
import { okAsync } from 'neverthrow'
import type { Address } from 'viem'
import { assert, beforeEach, describe, expect, it, vi } from 'vitest'
import { getListDomains } from '@/features/dashboard/service/queries/getDashboardDomains'
import { getV1NamesForAddress } from '@/features/migration/service/v1SubgraphClient'
import { getAddressOwnerDomainsAndRoles } from './getAddressOwnerDomainsAndRoles'
import { getProfileAddressNames } from './profileAddressNames'
import { testAddress, testV1Names } from './profileAddressNames.test.helpers'

vi.mock('@/features/migration/service/v1SubgraphClient', () => ({
  getV1NamesForAddress: vi.fn(),
}))

vi.mock('@/features/dashboard/service/queries/getDashboardDomains', () => ({
  getListDomains: vi.fn(),
}))

vi.mock('./getAddressOwnerDomainsAndRoles', () => ({
  getAddressOwnerDomainsAndRoles: vi.fn(),
}))

const fixtureAddress = testAddress as Address

beforeEach(() => {
  vi.mocked(getV1NamesForAddress).mockReset()
  vi.mocked(getAddressOwnerDomainsAndRoles).mockReset()
  vi.mocked(getListDomains).mockReset()
  vi.mocked(getV1NamesForAddress).mockReturnValue(
    okAsync(
      testV1Names.map((name) => ({
        id: `v1-${name}`,
        labelName: name.replace('.eth', ''),
        labelhash: `0x${name}`,
        name,
        resolver: null,
        owner: { id: testAddress.toLowerCase() },
        registrant: { id: testAddress.toLowerCase() },
        wrappedOwner: null,
        parent: null,
        registration: { expiryDate: '1893456000' },
        wrappedDomain: null,
      })),
    ),
  )
  vi.mocked(getAddressOwnerDomainsAndRoles).mockReturnValue(
    okAsync({
      domains: [
        {
          __typename: 'Domain',
          id: 'v2-henlo.eth',
          name: 'henlo.eth',
          normalizedName: 'henlo.eth',
          tokenId: null,
          createdAt: 1_700_000_300,
          registrationDate: null,
          expiryDate: 1_891_036_800,
          owner: {
            __typename: 'Account',
            id: testAddress.toLowerCase(),
          },
          resolver: null,
        },
        {
          __typename: 'Domain',
          id: 'v2-claude.eth',
          name: 'claude.eth',
          normalizedName: 'claude.eth',
          tokenId: null,
          createdAt: 1_700_000_200,
          registrationDate: null,
          expiryDate: 1_891_036_800,
          owner: {
            __typename: 'Account',
            id: testAddress.toLowerCase(),
          },
          resolver: null,
        },
        {
          __typename: 'Domain',
          id: 'v2-alaska.eth',
          name: 'alaska.eth',
          normalizedName: 'alaska.eth',
          tokenId: null,
          createdAt: 1_700_000_100,
          registrationDate: null,
          expiryDate: 1_891_036_800,
          owner: {
            __typename: 'Account',
            id: testAddress.toLowerCase(),
          },
          resolver: null,
        },
      ],
      roleAssignments: [],
    }),
  )
  vi.mocked(getListDomains).mockReturnValue(okAsync({ domains: [] }))
})

describe('getProfileAddressNames', () => {
  it('returns merged v1 and v2 names for the fixture address', async () => {
    const result = await getProfileAddressNames(fixtureAddress)

    assert(result.isOk())
    expect(result.value.map((item) => item.label)).toEqual([
      'henlo.eth',
      'claude.eth',
      'alaska.eth',
      'figma.eth',
      'sagar.eth',
      'turbopuffer.eth',
    ])
    expect(
      result.value.find((item) => item.label === 'figma.eth')?.protocol,
    ).toBe('v1')
    expect(
      result.value.find((item) => item.label === 'henlo.eth')?.protocol,
    ).toBe('v2')
  })

  it('queries v1 subgraph and v2 indexer for the address', async () => {
    await getProfileAddressNames(fixtureAddress)

    expect(getV1NamesForAddress).toHaveBeenCalledWith(
      testAddress.toLowerCase(),
      { signal: undefined },
    )
    expect(getAddressOwnerDomainsAndRoles).toHaveBeenCalledWith(
      testAddress.toLowerCase(),
      undefined,
    )
    expect(getListDomains).not.toHaveBeenCalled()
  })

  it('fetches subsequent owner pages in 200-name batches', async () => {
    const firstDomain: DomainFragment = {
      id: 'v2-name.eth',
      name: 'name.eth',
      normalizedName: 'name.eth',
      tokenId: null,
      createdAt: 1_700_000_000,
      registrationDate: null,
      expiryDate: 1_891_036_800,
      owner: { id: testAddress.toLowerCase() },
      resolver: null,
    }
    vi.mocked(getAddressOwnerDomainsAndRoles).mockReturnValue(
      okAsync({
        domains: Array.from({ length: 200 }, (_, index) => ({
          ...firstDomain,
          id: `v2-name${index}.eth`,
          name: `name${index}.eth`,
          normalizedName: `name${index}.eth`,
        })),
        roleAssignments: [],
      }),
    )

    const result = await getProfileAddressNames(fixtureAddress)

    assert(result.isOk())
    expect(getListDomains).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { owner: testAddress.toLowerCase() },
        first: 200,
        skip: 200,
      }),
      undefined,
    )
  })

  it('fetches managed-only domains from role assignments not already owned', async () => {
    vi.mocked(getAddressOwnerDomainsAndRoles).mockReturnValue(
      okAsync({
        domains: [
          {
            __typename: 'Domain',
            id: 'v2-henlo.eth',
            name: 'henlo.eth',
            normalizedName: 'henlo.eth',
            tokenId: null,
            createdAt: 1_700_000_300,
            registrationDate: null,
            expiryDate: 1_891_036_800,
            owner: {
              __typename: 'Account',
              id: testAddress.toLowerCase(),
            },
            resolver: null,
          },
        ],
        roleAssignments: [
          { name: 'dom.eth', roleBitmap: '1' },
          { name: 'henlo.eth', roleBitmap: '1' },
        ],
      }),
    )
    vi.mocked(getListDomains).mockReturnValue(
      okAsync({
        domains: [
          {
            __typename: 'Domain',
            id: 'v2-dom.eth',
            name: 'dom.eth',
            normalizedName: 'dom.eth',
            tokenId: null,
            createdAt: 1_700_000_050,
            registrationDate: null,
            expiryDate: 1_891_036_800,
            owner: {
              __typename: 'Account',
              id: '0xother',
            },
            resolver: null,
          },
        ],
      }),
    )

    const result = await getProfileAddressNames(fixtureAddress)

    assert(result.isOk())
    expect(getListDomains).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name_in: ['dom.eth'] },
      }),
      undefined,
    )
    expect(result.value.find((item) => item.label === 'dom.eth')).toMatchObject(
      {
        protocol: 'v2',
        nameRoles: ['manager'],
        roleCategory: 'managed',
      },
    )
  })

  it('never lists a third-party name that differs only in case from a role name', async () => {
    vi.mocked(getAddressOwnerDomainsAndRoles).mockReturnValue(
      okAsync({
        domains: [],
        roleAssignments: [{ name: 'cryptO.eth', roleBitmap: '1' }],
      }),
    )
    vi.mocked(getListDomains).mockReturnValue(
      okAsync({
        domains: [
          {
            __typename: 'Domain',
            id: 'v2-crypto.eth',
            name: 'crypto.eth',
            normalizedName: 'crypto.eth',
            tokenId: null,
            createdAt: 1_700_000_050,
            registrationDate: null,
            expiryDate: 1_891_036_800,
            owner: {
              __typename: 'Account',
              id: '0xthirdparty',
            },
            resolver: null,
          },
        ],
      }),
    )

    const result = await getProfileAddressNames(fixtureAddress)

    assert(result.isOk())
    expect(getListDomains).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name_in: ['cryptO.eth'] },
      }),
      undefined,
    )
    expect(result.value.map((item) => item.label)).not.toContain('crypto.eth')
  })
})
