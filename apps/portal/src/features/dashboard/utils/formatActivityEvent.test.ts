import { describe, expect, it } from 'vitest'
import type { RecentActivityEvent } from '../hooks/useRecentActivity'
import { formatActivityEvent } from './formatActivityEvent'

const OWNER = '0xdb072374a9bbeba03ae9422ea21d93a4fe7504fd'

const event = (
  type: string,
  data: Record<string, unknown>,
): RecentActivityEvent => ({
  name: null,
  type,
  transactionHash: '0x01',
  timestamp: 0,
  blockNumber: 0,
  contractAddress: '0x02',
  namehash: null,
  domain: null,
  data: JSON.stringify(data),
})

describe('formatActivityEvent', () => {
  it('reads the ERC-1155 transfer destination from `to`', () => {
    expect(
      formatActivityEvent(event('Transfer', { from: '0x0', to: OWNER })).actor,
    ).toEqual(OWNER)
  })

  it('reads the registry transfer destination from `owner`', () => {
    expect(
      formatActivityEvent(event('Transfer', { node: '0x0', owner: OWNER }))
        .actor,
    ).toEqual(OWNER)
  })

  it('carries a text-record key as a value, not appended to the label', () => {
    expect(
      formatActivityEvent(event('TextChanged', { key: 'com.twitter' })),
    ).toEqual({ text: 'Text record updated', value: 'com.twitter' })
  })

  it('sanitizes an attacker-chosen text record key', () => {
    expect(
      formatActivityEvent(
        event('TextChanged', { key: '\u202Eens.eth\nclaim at evil.example' }),
      ),
    ).toEqual({
      text: 'Text record updated',
      value: 'ens.eth claim at evil.example',
    })
  })

  it('caps the length of an oversized text record key', () => {
    const { value } = formatActivityEvent(
      event('TextChanged', { key: 'a'.repeat(500) }),
    )
    expect(value).toBe(`${'a'.repeat(64)}\u2026`)
  })

  it('drops a text record key with nothing printable in it', () => {
    expect(
      formatActivityEvent(event('TextChanged', { key: '\u200B\u202E' })),
    ).toEqual({ text: 'Text record updated' })
  })

  it('does not render an unverified reverse-record name as a name entity', () => {
    const formatted = formatActivityEvent(
      event('NameChanged', { name: 'vitalik.eth' }),
    )
    expect(formatted.entityFromData).toBeUndefined()
    expect(formatted.actor).toBeUndefined()
    expect(formatted).toEqual({
      text: 'Primary name updated',
      value: 'vitalik.eth',
    })
  })

  it('sanitizes an attacker-chosen reverse-record name', () => {
    expect(
      formatActivityEvent(
        event('NameChanged', { name: '\u202Evitalik.eth\nsigned by ENS' }),
      ),
    ).toEqual({
      text: 'Primary name updated',
      value: 'vitalik.eth signed by ENS',
    })
  })

  it('omits an actor that is not a valid address', () => {
    expect(
      formatActivityEvent(event('NameRegistered', { owner: 'vitalik.eth' })),
    ).toEqual({ text: 'Registered by' })
  })

  it('omits a role-change account that is not a valid address', () => {
    expect(
      formatActivityEvent(event('EACRolesChanged', { account: 'not-an-addr' })),
    ).toEqual({ text: 'Roles updated' })
  })

  it('links an ETH multicoin address as an address entity', () => {
    expect(
      formatActivityEvent(
        event('AddressChanged', { coinType: 60, address: OWNER }),
      ),
    ).toEqual({
      text: 'ETH address updated',
      entityFromData: OWNER,
    })
  })

  it('does not treat non-ETH multicoin bytes as an address', () => {
    expect(
      formatActivityEvent(
        event('AddressChanged', { coinType: 0, address: '0x00a1b2' }),
      ),
    ).toEqual({ text: 'Address updated' })
  })

  it('omits the entity when the ETH payload is not a valid address', () => {
    expect(
      formatActivityEvent(
        event('AddressChanged', { coinType: 60, address: '0xdead' }),
      ),
    ).toEqual({ text: 'ETH address updated' })
  })
})
