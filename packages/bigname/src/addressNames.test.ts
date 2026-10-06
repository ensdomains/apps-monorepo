import { describe, expect, it, vi } from 'vitest'
import {
  fetchRoleSummaryPage,
  fetchV2GraceNames,
  isV2GraceName,
} from './addressNames'
import { BignameError } from './errors'
import { pageOf } from './testUtils'
import type { AddressNameRow } from './types'

const owner = '0x1111111111111111111111111111111111111111'
const graceRow: AddressNameRow = {
  name: 'renew.eth',
  display_name: 'renew.eth',
  namespace: 'ens',
  namehash: '0x01',
  authority: 'ens_v2',
  registration_status: 'released',
  relations: ['former_owner'],
  is_primary: false,
  expires_at: '100',
  grace_ends_at: '200',
  lapsed_registration: {
    owner,
    held_through: 'registry',
    release_kind: 'expired',
  },
}
const overflow = () =>
  new BignameError({ status: 422, code: 'unsupported', message: 'budget' })

describe('role-summary page budget', () => {
  it('shrinks the page and keeps summaries when the smaller page fits', async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(overflow())
      .mockResolvedValue('page')
    await expect(fetchRoleSummaryPage(read)).resolves.toBe('page')
    expect(read.mock.calls).toEqual([
      [200, true],
      [100, true],
    ])
  })
  it('drops summaries only after a single row still exceeds the budget', async () => {
    const read = vi.fn(async (_size: number, roles: boolean) => {
      if (roles) throw overflow()
      return 'plain'
    })
    await expect(fetchRoleSummaryPage(read)).resolves.toBe('plain')
    expect(read.mock.calls).toEqual(
      [200, 100, 50, 25, 12, 6, 3, 1]
        .map((n) => [n, true])
        .concat([[1, false]]),
    )
  })
  it('propagates non-budget failures', async () => {
    const failure = new Error('failed')
    const read = vi.fn().mockRejectedValue(failure)
    await expect(fetchRoleSummaryPage(read)).rejects.toBe(failure)
    expect(read).toHaveBeenCalledTimes(1)
  })
})

describe('ENSv2 renewable former ownership', () => {
  it('includes the expiry boundary and excludes the grace-end boundary', () => {
    expect(isV2GraceName(graceRow, 99)).toBe(false)
    expect(isV2GraceName(graceRow, 100)).toBe(true)
    expect(isV2GraceName(graceRow, 199)).toBe(true)
    expect(isV2GraceName(graceRow, 200)).toBe(false)
  })
  it('excludes subnames, ENSv1, voluntarily unregistered and re-registered names', () => {
    for (const patch of [
      { name: 'sub.renew.eth' },
      { authority: 'ens_v1' as const },
      { registration_status: 'active' as const },
      {
        lapsed_registration: {
          ...graceRow.lapsed_registration,
          release_kind: 'unregistered' as const,
        },
      },
    ])
      expect(isV2GraceName({ ...graceRow, ...patch }, 150)).toBe(false)
  })
  it('walks former-owner pages, filters the owner, and preserves renewal-only relations', async () => {
    const listAddressNames = vi
      .fn()
      .mockResolvedValueOnce(pageOf([graceRow], 'next'))
      .mockResolvedValueOnce(
        pageOf(
          [
            {
              ...graceRow,
              lapsed_registration: {
                ...graceRow.lapsed_registration,
                owner: '0xother',
              },
            },
          ],
          null,
        ),
      )
    expect(
      await fetchV2GraceNames({ listAddressNames }, owner, {
        nowSeconds: 150,
        gracePeriodSeconds: 100,
      }),
    ).toEqual([graceRow])
    expect(listAddressNames.mock.calls[0]?.[1]).toEqual({
      namespace: 'ens',
      relation: 'former_owner',
      parent: 'eth',
      sort: 'expires_at',
      order: 'asc',
      expires_after: '50',
      expires_before: '151',
      page_size: 200,
      cursor: undefined,
    })
    expect(listAddressNames.mock.calls[1]?.[1].cursor).toBe('next')
  })
})
