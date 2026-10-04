import type { AddressNameRow, RoleSummaryEntry } from '@ens-apps/bigname'
import { describe, expect, it } from 'vitest'
import { decodeRoleBitmap } from '@/lib/roles/decodeRoleBitmap'
import { registryRoleBitmap, toAddressNameItems } from './addressNames'

const ADDRESS = '0x1111111111111111111111111111111111111111'
const OTHER = '0x2222222222222222222222222222222222222222'

const row = (overrides: Partial<AddressNameRow>): AddressNameRow => ({
  name: 'test.eth',
  display_name: 'test.eth',
  namespace: 'ens',
  namehash: '0x00',
  relations: ['registrant', 'owner', 'manager'],
  is_primary: false,
  ...overrides,
})

describe('toAddressNameItems', () => {
  it('maps an ENSv1 row to Owner / Manager badges and a bare expiry', () => {
    const [item] = toAddressNameItems(
      [
        row({
          authority: 'ens_v1',
          registration_status: 'registered',
          expires_at: '2030-01-01T00:00:00+00:00',
          subname_count: 2,
          record_count: 5,
        }),
      ],
      ADDRESS,
    )

    expect(item).toEqual({
      name: 'test.eth',
      expiryDate: new Date('2030-01-01T00:00:00Z'),
      protocolVersion: 'ENSv1',
      subdomainCount: 2,
      recordCount: 5,
      roleBitmap: null,
      v1Roles: { owner: true, manager: true },
      relations: ['registrant', 'owner', 'manager'],
    })
  })

  it('treats an ens_v0 (2017 registry) name as ENSv1', () => {
    const [item] = toAddressNameItems([row({ authority: 'ens_v0' })], ADDRESS)
    expect(item?.protocolVersion).toBe('ENSv1')
  })

  it('renders a missing expiry as "no expiry"', () => {
    const [item] = toAddressNameItems([row({ authority: 'ens_v2' })], ADDRESS)
    expect(item?.expiryDate).toBeNull()
  })

  it('shows the registry owner of an unwrapped subname as its manager only', () => {
    const [item] = toAddressNameItems(
      [
        row({
          name: 'sub.test.eth',
          authority: 'ens_v1',
          registration_status: 'registered',
          relations: ['owner', 'manager'],
        }),
      ],
      ADDRESS,
    )
    expect(item?.v1Roles).toEqual({ owner: false, manager: true })
  })

  it('shows the holder of a wrapped subname as owner and manager', () => {
    const [item] = toAddressNameItems(
      [
        row({
          name: 'sub.test.eth',
          authority: 'ens_v1',
          registration_status: 'wrapped',
          relations: ['owner', 'manager'],
        }),
      ],
      ADDRESS,
    )
    expect(item?.v1Roles).toEqual({ owner: true, manager: true })
  })

  it('drops released ENSv1 leases but keeps lapsed ENSv2 names', () => {
    const items = toAddressNameItems(
      [
        row({
          name: 'lapsed.eth',
          authority: 'ens_v1',
          registration_status: 'released',
        }),
        row({
          name: 'expired.eth',
          authority: 'ens_v2',
          registration_status: 'released',
        }),
      ],
      ADDRESS,
    )
    expect(items.map((item) => item.name)).toEqual(['expired.eth'])
  })
})

describe('registryRoleBitmap', () => {
  const roleSummary: RoleSummaryEntry[] = [
    {
      address: ADDRESS,
      grants: [
        {
          grant_scope: { kind: 'registration', detail: {} },
          powers: ['renew', 'set_subregistry', 'admin_renew'],
        },
        {
          grant_scope: {
            kind: 'resolver',
            detail: { resolver: { chain_id: 11155111, address: '0x33' } },
          },
          powers: ['set_addr', 'set_text'],
        },
        {
          grant_relation: 'operator',
          grant_scope: {
            kind: 'account',
            detail: {
              chain_id: 11155111,
              authority_kind: 'registry',
              authority_contract: '0x44',
              owner: OTHER,
            },
          },
          powers: ['registry_control'],
        },
      ],
    },
    {
      address: OTHER,
      grants: [
        {
          grant_scope: { kind: 'registration', detail: {} },
          powers: ['unregister'],
        },
      ],
    },
  ]

  it("encodes only the address's own registry roles", () => {
    const bitmap = registryRoleBitmap(
      { role_summary: roleSummary },
      ADDRESS.toUpperCase().replace('0X', '0x'),
    )
    expect(bitmap && decodeRoleBitmap(bitmap).toSorted()).toEqual([
      'ROLE_RENEW',
      'ROLE_RENEW_ADMIN',
      'ROLE_SET_SUBREGISTRY',
    ])
  })

  it('is null when the address holds no registry role', () => {
    expect(registryRoleBitmap({ role_summary: [] }, ADDRESS)).toBeNull()
    expect(registryRoleBitmap({}, ADDRESS)).toBeNull()
  })

  it('attaches roles to ENSv2 rows only', () => {
    const [v2, v1] = toAddressNameItems(
      [
        row({ authority: 'ens_v2', role_summary: roleSummary }),
        row({ authority: 'ens_v1', role_summary: roleSummary }),
      ],
      ADDRESS,
    )
    expect(v2?.roleBitmap).not.toBeNull()
    expect(v1?.roleBitmap).toBeNull()
  })
})
