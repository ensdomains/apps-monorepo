import { describe, expect, it } from 'vitest'
import { apiError, clientWith, envelope } from './fetch.mock'
import { readNameDetail } from './nameDetail'
import type { NameRecord } from './types'

const record = {
  name: 'alice.eth',
  display_name: 'alice.eth',
  namespace: 'ens',
  namehash: '0xabc',
  status: 'ok',
  authority: 'ens_v2',
  owner: '0xb15c4ca5ec894369dec40f6298e63eae60db2756',
  registrant: '0xb15c4ca5ec894369dec40f6298e63eae60db2756',
  registration_status: 'registered',
  registered_at: '1790594976',
  created_at: '1790594976',
  expires_at: '1885289376',
  resolver: {
    chain_id: 11155111,
    address: '0x6a57f0a929949027f954c66f4889514d5a5fd1d8',
  },
} satisfies NameRecord

describe('readNameDetail', () => {
  it('renders the wire record the way the profile pages need it', async () => {
    const { client } = clientWith(envelope(record))

    const result = await readNameDetail(client)({ name: 'alice.eth' })

    expect(result._unsafeUnwrap()).toEqual({
      name: 'alice.eth',
      displayName: 'alice.eth',
      namehash: '0xabc',
      protocol: 'v2',
      isSupported: true,
      owner: '0xb15c4ca5ec894369dec40f6298e63eae60db2756',
      manager: null,
      registrant: '0xb15c4ca5ec894369dec40f6298e63eae60db2756',
      resolver: '0x6a57f0a929949027f954c66f4889514d5a5fd1d8',
      registrationStatus: 'registered',
      expiresAt: new Date('2029-09-28T11:29:36Z'),
      registeredAt: new Date('2026-09-28T11:29:36Z'),
      createdAt: new Date('2026-09-28T11:29:36Z'),
      migratedAt: null,
      unresolvableReason: null,
    })
  })

  it('says why an ENSv1 name provably resolves to nothing', async () => {
    const { client } = clientWith(
      envelope({
        ...record,
        authority: 'ens_v1',
        unresolvable_reason: 'no_live_ens_v2_entry',
      }),
    )

    const detail = (
      await readNameDetail(client)({ name: 'alice.eth' })
    )._unsafeUnwrap()

    expect(detail?.unresolvableReason).toBe('no_live_ens_v2_entry')
  })

  it('keeps an unsupported name identifiable with no protocol', async () => {
    const { client } = clientWith(
      envelope({
        name: 'eth',
        display_name: 'eth',
        namespace: 'ens',
        namehash: '0xdef',
        status: 'unsupported',
        unsupported_reason: 'root',
      }),
    )

    const detail = (
      await readNameDetail(client)({ name: 'eth' })
    )._unsafeUnwrap()

    expect(detail?.isSupported).toBe(false)
    expect(detail?.protocol).toBeNull()
    expect(detail?.owner).toBeNull()
    expect(detail?.registrationStatus).toBeNull()
  })

  it.each([
    ['a 404', () => apiError('not_found', 404)],
    [
      'a 200 with status not_found',
      () => envelope({ ...record, status: 'not_found' }),
    ],
  ])('answers null for a name bigname has not indexed, on %s', async (_, response) => {
    const { client } = clientWith(response())

    expect(
      (await readNameDetail(client)({ name: 'nope.eth' }))._unsafeUnwrap(),
    ).toBeNull()
  })

  it('maps any other failure to a read error', async () => {
    const { client } = clientWith(apiError('overloaded', 503))

    const error = (
      await readNameDetail(client)({ name: 'alice.eth' })
    )._unsafeUnwrapErr()

    expect(error.kind).toBe('unavailable')
    expect(error.cause).toMatchObject({ code: 'overloaded' })
  })
})
