import type { NameSummary } from '@ens-apps/indexer/reads'
import { describe, expect, it } from 'vitest'
import {
  isDisplayableProfileName,
  toProfileAddressNames,
} from './buildProfileAddressNames'

const summary = (
  name: string,
  overrides: Partial<NameSummary> = {},
): NameSummary => ({
  name,
  displayName: name,
  namehash: `0x${name.length.toString(16)}`,
  protocol: 'v2',
  relations: ['owner'],
  isPrimary: false,
  isMigrated: false,
  registrationStatus: 'registered',
  expiresAt: null,
  registeredAt: null,
  createdAt: null,
  ...overrides,
})

describe('isDisplayableProfileName', () => {
  it.each([
    ['alice.eth', true],
    ['abc.addr.reverse', false],
    ['[1234].eth', false],
  ])('%s -> %s', (name, expected) => {
    expect(isDisplayableProfileName(name)).toBe(expected)
  })
})

describe('toProfileAddressNames', () => {
  it('maps a row to the profile shape', () => {
    expect(
      toProfileAddressNames([
        summary('alice.eth', {
          namehash: '0xabc',
          protocol: 'v1',
          expiresAt: new Date('2030-01-01T00:00:00Z'),
          createdAt: new Date('2024-01-01T00:00:00Z'),
        }),
      ]),
    ).toEqual([
      {
        key: '0xabc',
        label: 'alice.eth',
        protocol: 'v1',
        expiryDate: 1_893_456_000,
        createdAt: 1_704_067_200,
        nameRoles: ['owner'],
        roleCategory: 'owned',
      },
    ])
  })

  it.each([
    [['owner'], ['owner'], 'owned'],
    [['registrant'], ['owner'], 'owned'],
    [['owner', 'manager'], ['owner', 'manager'], 'owned'],
    [['manager'], ['manager'], 'managed'],
  ] as const)('maps relations %j to roles %j (%s)', (relations, roles, category) => {
    const [name] = toProfileAddressNames([summary('a.eth', { relations })])

    expect(name?.nameRoles).toEqual(roles)
    expect(name?.roleCategory).toBe(category)
  })

  it('leaves out reverse records, unknown labels and names without a role', () => {
    expect(
      toProfileAddressNames([
        summary('abc.addr.reverse'),
        summary('[1234].eth'),
        summary('none.eth', { relations: [] }),
        summary('kept.eth'),
      ]).map(({ label }) => label),
    ).toEqual(['kept.eth'])
  })

  it('lists newest first, undated last, ties by name', () => {
    expect(
      toProfileAddressNames([
        summary('undated.eth'),
        summary('old.eth', { createdAt: new Date('2020-01-01T00:00:00Z') }),
        summary('b-new.eth', { createdAt: new Date('2025-01-01T00:00:00Z') }),
        summary('a-new.eth', { createdAt: new Date('2025-01-01T00:00:00Z') }),
      ]).map(({ label }) => label),
    ).toEqual(['a-new.eth', 'b-new.eth', 'old.eth', 'undated.eth'])
  })

  it('treats a name with no deployment answering as ENSv2', () => {
    const [name] = toProfileAddressNames([summary('a.eth', { protocol: null })])

    expect(name?.protocol).toBe('v2')
  })
})
