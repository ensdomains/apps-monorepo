import type { Address, Hash } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  groupAddressHistoryByName,
  type V1NameHistory,
} from '@/utils/history/transformAddressHistory'
import { attributeName, partitionAddressHistory } from './nameAttribution'

const VICTIM = '0x1111111111111111111111111111111111111111' as Address
const ATTACKER = '0x2222222222222222222222222222222222222222' as Address

const senders = (entries: Array<[string, Address]>) =>
  new Map<string, Address>(entries)

describe('attributeName', () => {
  it('treats a .eth 2LD held by the address as acquired', () => {
    expect(
      attributeName(
        {
          name: 'victim.eth',
          registrarHolder: VICTIM,
          transactionIDs: ['0xaaa'],
        },
        VICTIM,
        undefined,
      ),
    ).toBe('acquired')
  })

  it('treats a .eth 2LD held by someone else as assigned', () => {
    expect(
      attributeName(
        {
          name: 'victim.eth',
          registrarHolder: ATTACKER,
          transactionIDs: ['0xaaa'],
        },
        VICTIM,
        undefined,
      ),
    ).toBe('assigned')
  })

  it('does not treat a subname as acquired on registry ownership alone', () => {
    expect(
      attributeName(
        {
          name: 'victim.evil.eth',
          registrarHolder: VICTIM,
          transactionIDs: ['0xaaa'],
        },
        VICTIM,
        undefined,
      ),
    ).toBe('assigned')
  })

  it('does not treat a 2LD under an attacker-controlled TLD as acquired', () => {
    expect(
      attributeName(
        { name: 'victim.evil', registrarHolder: VICTIM, transactionIDs: [] },
        VICTIM,
        undefined,
      ),
    ).toBe('assigned')
  })

  it('treats a subname the address transacted on as acquired', () => {
    expect(
      attributeName(
        {
          name: 'mine.victim.eth',
          registrarHolder: VICTIM,
          transactionIDs: ['0xbbb'],
        },
        VICTIM,
        senders([['0xbbb', VICTIM]]),
      ),
    ).toBe('acquired')
  })

  it('treats a subname only the attacker transacted on as assigned', () => {
    expect(
      attributeName(
        {
          name: 'victim.evil.eth',
          registrarHolder: VICTIM,
          transactionIDs: ['0xccc'],
        },
        VICTIM,
        senders([['0xccc', ATTACKER]]),
      ),
    ).toBe('assigned')
  })

  it('falls back to assigned when the senders are unknown', () => {
    expect(
      attributeName(
        {
          name: 'victim.evil.eth',
          registrarHolder: VICTIM,
          transactionIDs: ['0xddd'],
        },
        VICTIM,
        undefined,
      ),
    ).toBe('assigned')
  })

  it('ignores a missing or malformed name rather than throwing', () => {
    expect(
      attributeName(
        { name: null, registrarHolder: VICTIM, transactionIDs: [] },
        VICTIM,
        undefined,
      ),
    ).toBe('assigned')

    expect(
      attributeName(
        {
          name: 'victim.eth',
          registrarHolder: 'not-an-address',
          transactionIDs: [],
        },
        VICTIM,
        undefined,
      ),
    ).toBe('assigned')
  })
})

describe('partitionAddressHistory', () => {
  /**
   * The #93033 scenario: an attacker who owns any name calls
   * `setSubnodeRecord(parentNode, label, victim, attackerResolver, 0)`, then emits
   * resolver events from their own contract. The subgraph then reports the subname
   * as owned by the victim, and its resolver events as the subname's history.
   */
  const plantedSubname: V1NameHistory = {
    name: 'victim.evil.eth',
    registrarHolder: VICTIM,
    domainEvents: [
      {
        id: 'planted-newowner',
        transactionID: '0xattack1',
        blockNumber: 200,
        type: 'NewOwner',
      },
    ],
    registrationEvents: [],
    resolverEvents: [
      {
        id: 'planted-text',
        transactionID: '0xattack2',
        blockNumber: 201,
        type: 'TextChanged',
      },
    ],
  }

  const ownedName: V1NameHistory = {
    name: 'victim.eth',
    registrarHolder: VICTIM,
    domainEvents: [
      {
        id: 'real-transfer',
        transactionID: '0xreal1',
        blockNumber: 100,
        type: 'Transfer',
      },
    ],
    registrationEvents: [],
    resolverEvents: [],
  }

  const attackerSenders = senders([
    ['0xattack1' as Hash, ATTACKER],
    ['0xattack2' as Hash, ATTACKER],
    ['0xreal1' as Hash, VICTIM],
  ])

  it('keeps a planted subname out of the address history', () => {
    const { acquired, assigned } = partitionAddressHistory(
      groupAddressHistoryByName([plantedSubname]),
      VICTIM,
      attackerSenders,
    )

    expect(acquired).toEqual([])
    expect(assigned.map((tx) => tx.transactionID)).toEqual([
      '0xattack2',
      '0xattack1',
    ])
  })

  it('separates a planted subname from a name the address really owns', () => {
    const { acquired, assigned } = partitionAddressHistory(
      groupAddressHistoryByName([ownedName, plantedSubname]),
      VICTIM,
      attackerSenders,
    )

    expect(acquired.map((tx) => tx.transactionID)).toEqual(['0xreal1'])
    expect(assigned.map((tx) => tx.transactionID)).toEqual([
      '0xattack2',
      '0xattack1',
    ])
  })

  it('keeps a subname the address itself transacted on in its own history', () => {
    const { acquired, assigned } = partitionAddressHistory(
      groupAddressHistoryByName([
        { ...plantedSubname, name: 'mine.victim.eth' },
      ]),
      VICTIM,
      senders([
        ['0xattack1' as Hash, VICTIM],
        ['0xattack2' as Hash, VICTIM],
      ]),
    )

    expect(acquired).toHaveLength(2)
    expect(assigned).toEqual([])
  })

  it('keeps a V2 name the address holds, and drops a V2 subname it does not', () => {
    const { acquired, assigned } = partitionAddressHistory(
      groupAddressHistoryByName(undefined, [
        {
          name: 'victim.eth',
          registrarHolder: VICTIM,
          events: [
            {
              transactionHash: '0xv2real',
              blockNumber: 400,
              name: 'Transfer',
              type: 'Transfer',
              timestamp: 1700000000,
            },
          ],
        },
        {
          name: 'victim.evil.eth',
          registrarHolder: VICTIM,
          events: [
            {
              transactionHash: '0xv2planted',
              blockNumber: 401,
              name: 'TextChanged',
              type: 'TextChanged',
              timestamp: 1700000001,
            },
          ],
        },
      ]),
      VICTIM,
      undefined,
    )

    expect(acquired.map((tx) => tx.transactionID)).toEqual(['0xv2real'])
    expect(assigned.map((tx) => tx.transactionID)).toEqual(['0xv2planted'])
  })

  it('sorts each bucket newest first', () => {
    const { acquired } = partitionAddressHistory(
      groupAddressHistoryByName([
        ownedName,
        {
          ...ownedName,
          name: 'other.eth',
          domainEvents: [
            {
              id: 'later',
              transactionID: '0xreal2',
              blockNumber: 300,
              type: 'Transfer',
            },
          ],
        },
      ]),
      VICTIM,
      attackerSenders,
    )

    expect(acquired.map((tx) => tx.blockNumber)).toEqual([300, 100])
  })
})
