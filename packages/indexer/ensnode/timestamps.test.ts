import { describe, expect, it } from 'vitest'
import {
  toEventTimes,
  toMissingBlocks,
  toRegistrationIds,
  toRegistrationTimes,
} from './timestamps'
import type { V1Event } from './types'

const NODE =
  '0xeb4f647bea6caa36333c816d7b46fdcb05f9466ecacc140ea8c66faf15b3d9f1'

const event = (
  id: string,
  __typename: string,
  blockNumber: number,
  extra: Readonly<Record<string, unknown>> = {},
): V1Event => ({ __typename, id, blockNumber, transactionID: '0x01', ...extra })

// test.eth on Sepolia, registered twice: only the latest registration has a date.
const page = [
  event('reg-2', 'NameRegistered', 3970144, { registrationId: NODE }),
  event('wrap', 'NameWrapped', 3970144),
  event('reg-1', 'NameRegistered', 3000000, { registrationId: NODE }),
]

describe('ENSv1 event times', () => {
  it('asks once per registration', () => {
    expect(toRegistrationIds(page)).toEqual([NODE])
  })

  it('dates only the latest NameRegistered of a reused registration', () => {
    const times = toRegistrationTimes([
      {
        id: 'reg-2',
        registrationId: NODE,
        registration: { registrationDate: '1690405056' },
      },
      {
        id: 'reg-1',
        registrationId: NODE,
        registration: { registrationDate: '1690405056' },
      },
    ])

    expect([...times]).toEqual([['reg-2', 1690405056n]])
  })

  it('reads each remaining block once, and fills from both sources', () => {
    const byRegistration = new Map([['reg-2', 1690405056n]])

    expect(toMissingBlocks(page, byRegistration)).toEqual([3970144, 3000000])
    expect([
      ...toEventTimes(page, byRegistration, new Map([[3970144, 1690405056n]])),
    ]).toEqual([
      ['reg-2', 1690405056n],
      ['wrap', 1690405056n],
    ])
  })
})
