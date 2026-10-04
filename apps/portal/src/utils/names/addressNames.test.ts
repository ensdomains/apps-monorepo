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
  relations: ['owner', 'manager'],
  is_primary: false,
  registration_status: 'active',
  created_at: '1692284436',
  ...overrides,
})

const DAY = 24 * 60 * 60
const date = (seconds: number) => new Date(seconds * 1000)

describe('toAddressNameItems', () => {
  it('maps an ENSv1 row to Owner / Manager badges and its lease expiry', () => {
    // nick.eth on Sepolia: the top level is the ENSv2 reservation (lease + 62
    // days, grace + 28); the ENSv1 deadline is the lease and its 90 days.
    const [item] = toAddressNameItems(
      [
        row({
          authority: 'ens_v1',
          registration_status: 'active',
          expires_at: '1803965433',
          grace_ends_at: '1806384633',
          ens_v1: { expires_at: '1798608633' },
          subname_count: 2,
          record_count: 5,
        }),
      ],
      ADDRESS,
    )

    expect(item).toEqual({
      name: 'test.eth',
      expiryDate: date(1_798_608_633),
      graceEndDate: date(1_798_608_633 + 90 * DAY),
      hasNameRow: true,
      protocolVersion: 'ENSv1',
      subdomainCount: 2,
      recordCount: 5,
      roleBitmap: null,
      v1Roles: { owner: true, manager: true },
      relations: ['owner', 'manager'],
    })
  })

  it('takes an ENSv2 name’s expiry and grace end as served', () => {
    const [item] = toAddressNameItems(
      [
        row({
          authority: 'ens_v2',
          registration_status: 'registered',
          expires_at: '1793399628',
          grace_ends_at: '1795818828',
        }),
      ],
      ADDRESS,
    )
    expect(item?.expiryDate).toEqual(date(1_793_399_628))
    expect(item?.graceEndDate).toEqual(date(1_795_818_828))
  })

  it('takes a wrapped ENSv1 subname’s expiry from the top level: it has no lease', () => {
    const [item] = toAddressNameItems(
      [
        row({
          name: 'sub.test.eth',
          authority: 'ens_v1',
          registration_status: 'wrapped',
          expires_at: '1793399628',
          grace_ends_at: '1793399628',
          ens_v1: { expires_at: null, wrapper_state: 'emancipated' },
        }),
      ],
      ADDRESS,
    )
    expect(item?.expiryDate).toEqual(date(1_793_399_628))
    expect(item?.graceEndDate).toEqual(date(1_793_399_628))
  })

  it('treats an ens_v0 (2017 registry) name as ENSv1', () => {
    const [item] = toAddressNameItems([row({ authority: 'ens_v0' })], ADDRESS)
    expect(item?.protocolVersion).toBe('ENSv1')
  })

  it('renders a missing expiry as "no expiry"', () => {
    const [item] = toAddressNameItems([row({ authority: 'ens_v2' })], ADDRESS)
    expect(item?.expiryDate).toBeNull()
  })

  it('splits Owner and Manager after a token transfer without reclaim', () => {
    // bnmig-0107-pw-unwrapped-010-r02.eth: the token holder is `owner`, the
    // registry owner (the previous holder) is `manager`.
    const [holder] = toAddressNameItems(
      [row({ authority: 'ens_v1', relations: ['owner'] })],
      ADDRESS,
    )
    const [controller] = toAddressNameItems(
      [row({ authority: 'ens_v1', relations: ['manager'] })],
      ADDRESS,
    )
    expect(holder?.v1Roles).toEqual({ owner: true, manager: false })
    expect(controller?.v1Roles).toEqual({ owner: false, manager: true })
  })

  it('drops the Manager badge while a wrapped .eth name is in grace', () => {
    // bigname omits `manager` then, so the holder relates as `owner` only.
    const [item] = toAddressNameItems(
      [
        row({
          authority: 'ens_v1',
          registration_status: 'wrapped',
          relations: ['owner'],
        }),
      ],
      ADDRESS,
    )
    expect(item?.v1Roles).toEqual({ owner: true, manager: false })
  })

  it('keeps a registry child without a name row, unlinked and last', () => {
    const items = toAddressNameItems(
      [
        // bigname sorts a missing expiry first ascending.
        row({
          name: 'sub002.leon.eth',
          authority: 'ens_v1',
          registration_status: 'unregistered',
          created_at: undefined,
          ens_v1: { expires_at: null },
        }),
        row({ name: 'forever.eth', authority: 'ens_v2' }),
        row({
          name: 'expiring.eth',
          authority: 'ens_v2',
          expires_at: '1793399628',
          grace_ends_at: '1795818828',
        }),
      ],
      ADDRESS,
    )
    expect(items.map(({ name, hasNameRow }) => ({ name, hasNameRow }))).toEqual(
      [
        { name: 'expiring.eth', hasNameRow: true },
        { name: 'forever.eth', hasNameRow: true },
        { name: 'sub002.leon.eth', hasNameRow: false },
      ],
    )
  })

  it('orders ENSv1 names by the lease date it shows, not the served sort key', () => {
    const items = toAddressNameItems(
      [
        row({
          name: 'v2.eth',
          authority: 'ens_v2',
          expires_at: '1798000000',
        }),
        row({
          name: 'v1.eth',
          authority: 'ens_v1',
          expires_at: '1803965433',
          ens_v1: { expires_at: '1798608633' },
        }),
        row({
          name: 'v1-early.eth',
          authority: 'ens_v1',
          expires_at: '1799000000',
          ens_v1: { expires_at: '1793000000' },
        }),
      ],
      ADDRESS,
    )
    expect(items.map(({ name }) => name)).toEqual([
      'v1-early.eth',
      'v2.eth',
      'v1.eth',
    ])
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
