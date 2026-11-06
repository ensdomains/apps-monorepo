import { describe, expect, it } from 'vitest'
import {
  getUpgradeReadHeader,
  getUpgradeReadPlan,
  getUpgradeReadReuseKey,
} from './upgradeReadPolicy'

const HASH = `0x${'11'.repeat(32)}`
const CALL = {
  to: '0x0000000000000000000000000000000000000001',
  data: '0x12345678',
}

describe('upgrade RPC read policy', () => {
  it.each([
    {
      method: 'eth_call',
      params: [CALL, '0x2'],
      canShare: true,
      pin: { kind: 'exact', number: '2' },
    },
    {
      method: 'eth_getCode',
      params: [CALL.to, '0x2'],
      canShare: true,
      pin: { kind: 'exact', number: '2' },
    },
    {
      method: 'eth_call',
      params: [CALL, 'latest'],
      canShare: false,
      pin: null,
    },
    {
      method: 'eth_call',
      params: [CALL, 'pending'],
      canShare: false,
      pin: null,
    },
    {
      method: 'eth_call',
      params: [CALL, '0x2', {}],
      canShare: false,
      pin: null,
    },
    {
      method: 'eth_getCode',
      params: [CALL.to, 'latest'],
      canShare: false,
      pin: null,
    },
    {
      method: 'eth_getLogs',
      params: [{ fromBlock: '0x0', toBlock: '0x2', topics: [] }],
      canShare: true,
      pin: { kind: 'range', number: '2' },
    },
    {
      method: 'eth_getLogs',
      params: [{ fromBlock: '0x0', toBlock: 'latest' }],
      canShare: false,
      pin: null,
    },
    { method: 'eth_estimateGas', params: [CALL], canShare: false, pin: null },
    {
      method: 'eth_getTransactionReceipt',
      params: [HASH],
      canShare: false,
      pin: null,
    },
  ])(
    'classifies $method $params without sharing mutable calls',
    ({ method, params, canShare, pin }) => {
      const plan = getUpgradeReadPlan({ method, params })
      expect(plan.status).toBe('read')
      if (plan.status !== 'read') throw new Error('Read denied')
      expect(plan.canShare).toBe(canShare)
      expect(plan.pin).toEqual(pin)
    },
  )

  it.each([
    'eth_sendRawTransaction',
    'eth_sendTransaction',
    'eth_sign',
    'personal_sign',
    'wallet_sendCalls',
    'anvil_setStorageAt',
    'evm_mine',
  ])('refuses mutation method %s', (method) =>
    expect(getUpgradeReadPlan({ method, params: [] })).toEqual({
      status: 'unsupported',
    }),
  )

  it('requires a verified checkpoint covering the requested state or historical range', () => {
    const state = getUpgradeReadPlan({
      method: 'eth_call',
      params: [CALL, '0x2'],
    })
    const logs = getUpgradeReadPlan({
      method: 'eth_getLogs',
      params: [{ fromBlock: '0x0', toBlock: '0x2' }],
    })
    if (state.status !== 'read' || logs.status !== 'read')
      throw new Error('Read denied')
    expect(getUpgradeReadReuseKey(state, new Map())).toBeNull()
    expect(getUpgradeReadReuseKey(state, new Map([['1', HASH]]))).toBeNull()
    expect(getUpgradeReadReuseKey(logs, new Map([['1', HASH]]))).toBeNull()
    expect(getUpgradeReadReuseKey(state, new Map([['2', HASH]]))).toBe(
      JSON.stringify([state.key, '2', HASH]),
    )
    expect(getUpgradeReadReuseKey(logs, new Map([['3', HASH]]))).toBe(
      JSON.stringify([logs.key, '3', HASH]),
    )
  })

  it.each(['pending', 'invalid', '0x3'])(
    'does not certify a header returned for %s',
    (requested) => {
      expect(
        getUpgradeReadHeader(
          { method: 'eth_getBlockByNumber', params: [requested, false] },
          { number: '0x2', hash: HASH },
        ),
      ).toBeNull()
    },
  )

  it('canonicalizes object property order while retaining call identity', () => {
    const first = getUpgradeReadPlan({
      method: 'eth_call',
      params: [CALL, '0x2'],
    })
    const second = getUpgradeReadPlan({
      params: [{ data: CALL.data, to: CALL.to }, '0x2'],
      method: 'eth_call',
    })
    const other = getUpgradeReadPlan({
      method: 'eth_call',
      params: [{ ...CALL, data: '0x87654321' }, '0x2'],
    })
    if (
      first.status !== 'read' ||
      second.status !== 'read' ||
      other.status !== 'read'
    )
      throw new Error('Read denied')
    expect(second.key).toBe(first.key)
    expect(other.key).not.toBe(first.key)
  })
})
