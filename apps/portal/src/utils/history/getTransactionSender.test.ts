import type { Address, Hex } from 'viem'
import { describe, expect, it } from 'vitest'
import { getTransactionSender } from './getTransactionSender'

const OWNER = '0x1111111111111111111111111111111111111111' as Address
const SAFE = '0x2222222222222222222222222222222222222222' as Address
/** `execTransaction`, as Safe v1.3–v1.5 is called on chain. */
const EXEC_TRANSACTION = '0x6a761202'

describe('getTransactionSender', () => {
  it.each<[string, Address | null, Hex, Address]>([
    ["a Safe's execTransaction: the Safe", SAFE, `${EXEC_TRANSACTION}00`, SAFE],
    ['any other call: its sender', SAFE, '0xa9059cbb00', OWNER],
    ['a contract creation: its sender', null, `${EXEC_TRANSACTION}00`, OWNER],
  ])('credits %s', (_, to, input, expected) => {
    expect(getTransactionSender({ from: OWNER, to, input })).toBe(expected)
  })
})
