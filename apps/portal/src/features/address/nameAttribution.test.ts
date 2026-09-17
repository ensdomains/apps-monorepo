import type { Address, Hash } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  groupAddressHistoryByName,
  type V1NameHistory,
} from '@/utils/history/transformAddressHistory'
import { partitionAddressHistory, selectAcquiredNames } from './nameAttribution'

const VICTIM = '0x1111111111111111111111111111111111111111' as Address
const ATTACKER = '0x2222222222222222222222222222222222222222' as Address

const senders = (entries: readonly (readonly [string, Address])[]) =>
  new Map<string, Address>(entries)

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

describe('selectAcquiredNames', () => {
  it('keeps a .eth 2LD held by the address', () => {
    expect(
      selectAcquiredNames(
        groupAddressHistoryByName([ownedName]),
        VICTIM,
        undefined,
      ).map((group) => group.name),
    ).toEqual(['victim.eth'])
  })

  it('drops a .eth 2LD held by someone else the address never transacted on', () => {
    expect(
      selectAcquiredNames(
        groupAddressHistoryByName([
          { ...ownedName, registrarHolder: ATTACKER },
        ]),
        VICTIM,
        senders([['0xreal1' as Hash, ATTACKER]]),
      ),
    ).toEqual([])
  })

  it('drops a subname on registry ownership alone', () => {
    expect(
      selectAcquiredNames(
        groupAddressHistoryByName([plantedSubname]),
        VICTIM,
        undefined,
      ),
    ).toEqual([])
  })

  it('drops a 2LD under a TLD a stranger may control', () => {
    expect(
      selectAcquiredNames(
        groupAddressHistoryByName([{ ...ownedName, name: 'victim.evil' }]),
        VICTIM,
        undefined,
      ),
    ).toEqual([])
  })

  it('keeps a subname the address transacted on', () => {
    expect(
      selectAcquiredNames(
        groupAddressHistoryByName([plantedSubname]),
        VICTIM,
        senders([['0xattack1' as Hash, VICTIM]]),
      ).map((group) => group.name),
    ).toEqual(['victim.evil.eth'])
  })

  it('tolerates a missing name and a malformed holder', () => {
    expect(
      selectAcquiredNames(
        groupAddressHistoryByName([
          { ...ownedName, name: null },
          { ...ownedName, registrarHolder: 'not-an-address' },
        ]),
        VICTIM,
        undefined,
      ),
    ).toEqual([])
  })
})

describe('partitionAddressHistory', () => {
  it('keeps a planted subname out of the address history', () => {
    const { acquired, assigned, assignedNameCount } = partitionAddressHistory(
      groupAddressHistoryByName([plantedSubname]),
      VICTIM,
      attackerSenders,
    )

    expect(acquired).toEqual([])
    expect(assigned.map((tx) => tx.transactionID)).toEqual([
      '0xattack2',
      '0xattack1',
    ])
    expect(assignedNameCount).toBe(1)
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

  it('counts assigned names, not their transactions', () => {
    const { assigned, assignedNameCount } = partitionAddressHistory(
      groupAddressHistoryByName([plantedSubname]),
      VICTIM,
      attackerSenders,
    )

    expect(assigned).toHaveLength(2)
    expect(assignedNameCount).toBe(1)
  })

  it('renders one row for a transaction that touched two acquired names', () => {
    const sharedTransaction = {
      id: 'shared',
      transactionID: '0xshared',
      blockNumber: 500,
      type: 'Transfer',
    }

    const { acquired } = partitionAddressHistory(
      groupAddressHistoryByName([
        { ...ownedName, name: 'one.eth', domainEvents: [sharedTransaction] },
        {
          ...ownedName,
          name: 'two.eth',
          domainEvents: [{ ...sharedTransaction, id: 'shared-2' }],
        },
      ]),
      VICTIM,
      undefined,
    )

    expect(acquired).toHaveLength(1)
    expect(acquired[0].events).toHaveLength(2)
  })

  it('never merges an assigned name into a row about an acquired one', () => {
    const { acquired, assigned } = partitionAddressHistory(
      groupAddressHistoryByName([
        {
          ...ownedName,
          domainEvents: [
            {
              id: 'real',
              transactionID: '0xshared',
              blockNumber: 500,
              type: 'Transfer',
            },
          ],
        },
        {
          ...plantedSubname,
          domainEvents: [
            {
              id: 'planted',
              transactionID: '0xshared',
              blockNumber: 500,
              type: 'NewOwner',
            },
          ],
          resolverEvents: [],
        },
      ]),
      VICTIM,
      senders([['0xshared' as Hash, ATTACKER]]),
    )

    expect(acquired).toHaveLength(1)
    expect(acquired[0].events.map((event) => event.id)).toEqual(['real'])
    expect(assigned[0].events.map((event) => event.id)).toEqual(['planted'])
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
