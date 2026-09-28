import { describe, expect, it } from 'vitest'
import { createDiff } from '@/features/profile/utils/createDiff'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import { applyProfileEditProposal } from './profileEditProposal'

describe('profile edit proposal', () => {
  it('removes only Ethereum without clearing shared or chain-specific EVM records', () => {
    const ethereum = '0x000000000000000000000000000000000000dEaD'
    const records = {
      ...newEmptyProfileRecords(),
      addresses: [
        { coinType: 60, value: ethereum },
        { coinType: 2147483658, value: ethereum },
        {
          coinType: 2147568180,
          value: '0x000000000000000000000000000000000000bEEF',
        },
        { coinType: 0, value: 'bc1elsewhere' },
      ],
    }
    const proposed = applyProfileEditProposal(records, {
      field: 'eth_address',
      operation: 'remove',
      value: '',
    })
    expect(proposed.addresses).toEqual(records.addresses.slice(1))
    expect(Object.values(createDiff(records, proposed))).toEqual([
      expect.objectContaining({
        fieldKey: '60',
        type: 'removed',
        original: ethereum,
      }),
    ])
  })

  it('updates the chosen base or contact field while retaining other records', () => {
    const records = {
      ...newEmptyProfileRecords(),
      base: { description: 'old', avatar: 'https://example.com/old.png' },
      contact: [{ key: 'email', value: 'old@example.com' }],
    }
    const withDescription = applyProfileEditProposal(records, {
      field: 'description',
      value: 'New description',
    })
    expect(withDescription.base).toEqual({
      description: 'New description',
      avatar: 'https://example.com/old.png',
    })
    expect(withDescription.contact).toEqual(records.contact)
    const withEmail = applyProfileEditProposal(withDescription, {
      field: 'email',
      value: 'new@example.com',
    })
    expect(withEmail.contact).toEqual([
      { key: 'email', value: 'new@example.com' },
    ])
  })

  it('uses the address editor rule to update matching EVM values', () => {
    const oldAddress = '0x000000000000000000000000000000000000dEaD'
    const nextAddress = '0x000000000000000000000000000000000000bEEF'
    const records = {
      ...newEmptyProfileRecords(),
      addresses: [
        { coinType: 60, value: oldAddress },
        { coinType: 2147483658, value: oldAddress },
        { coinType: 0, value: 'bc1elsewhere' },
      ],
    }
    expect(
      applyProfileEditProposal(records, {
        field: 'eth_address',
        value: nextAddress,
      }).addresses,
    ).toEqual([
      { coinType: 60, value: nextAddress },
      { coinType: 2147483658, value: nextAddress },
      { coinType: 0, value: 'bc1elsewhere' },
    ])
  })
})
