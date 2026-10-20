import type { EnsNetwork } from '@ens-apps/config'
import type { GetRecordsReturnType } from '@ensdomains/ensjs/public'
import { describe, expect, it, vi } from 'vitest'

const network = vi.hoisted(() => ({ value: 'sepolia' as EnsNetwork }))
vi.mock('@/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config')>()
  return {
    ...actual,
    envConfig: {
      ...actual.envConfig,
      get network() {
        return network.value
      },
    },
  }
})

const { recordsToTableData } = await import('./recordsToTableData')

const MOCK_RESOLVER = '0x0000000000000000000000000000000000000000' as const

describe('recordsToTableData', () => {
  it('should return empty array for empty records', () => {
    const records: GetRecordsReturnType = {
      texts: [],
      coins: [],
      contentHash: null,
      abi: null,
      resolverAddress: '0x0000000000000000000000000000000000000000',
    }

    expect(recordsToTableData(records)).toEqual([])
  })

  it('should transform contentHash into table data', () => {
    const records: GetRecordsReturnType = {
      texts: [],
      coins: [],
      contentHash: {
        protocolType: 'ipfs',
        decoded: 'QmTest123',
      },
      abi: null,
      resolverAddress: MOCK_RESOLVER,
    }

    const result = recordsToTableData(records)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      type: 'contentHash',
      value: 'ipfs://QmTest123',
    })
  })

  it('should transform text and coin records into table data', () => {
    const records: GetRecordsReturnType = {
      texts: [
        { key: 'email', value: 'test@example.com' },
        { key: 'url', value: 'https://example.com' },
      ],
      coins: [
        { coinType: 60, value: '0x1234...', symbol: 'ETH' },
        { coinType: 0, value: 'bc1q...', symbol: 'BTC' },
      ],
      contentHash: null,
      abi: null,
      resolverAddress: MOCK_RESOLVER,
    }

    const result = recordsToTableData(records)

    expect(result).toHaveLength(4)
    expect(result).toContainEqual({
      key: 'email',
      value: 'test@example.com',
      type: 'text',
    })
    expect(result).toContainEqual({
      key: 'url',
      value: 'https://example.com',
      type: 'text',
    })
    expect(result).toContainEqual({
      key: 'ETH',
      value: '0x1234...',
      type: 'address',
      id: 60,
    })
    expect(result).toContainEqual({
      key: 'BTC',
      value: 'bc1q...',
      type: 'address',
      id: 0,
    })
  })

  it('should handle all record types together', () => {
    const records: GetRecordsReturnType = {
      texts: [{ key: 'email', value: 'test@example.com' }],
      coins: [{ coinType: 60, value: '0x1234...', symbol: 'ETH' }],
      contentHash: {
        protocolType: 'ipfs',
        decoded: 'QmTest123',
      },
      abi: null,
      resolverAddress: MOCK_RESOLVER,
    }

    const result = recordsToTableData(records)

    expect(result).toHaveLength(3)
    expect(result).toContainEqual({
      type: 'contentHash',
      value: 'ipfs://QmTest123',
    })
    expect(result).toContainEqual({
      key: 'email',
      value: 'test@example.com',
      type: 'text',
    })
    expect(result).toContainEqual({
      key: 'ETH',
      value: '0x1234...',
      type: 'address',
      id: 60,
    })
  })

  it('should handle multiple contentHash protocol types', () => {
    const ipfsRecord: GetRecordsReturnType = {
      texts: [],
      coins: [],
      contentHash: { protocolType: 'ipfs', decoded: 'QmHash' },
      abi: null,
      resolverAddress: MOCK_RESOLVER,
    }

    const ipnsRecord: GetRecordsReturnType = {
      texts: [],
      coins: [],
      contentHash: { protocolType: 'ipns', decoded: 'k51qzi5uqu5...' },
      abi: null,
      resolverAddress: MOCK_RESOLVER,
    }

    expect(recordsToTableData(ipfsRecord)[0].value).toBe('ipfs://QmHash')
    expect(recordsToTableData(ipnsRecord)[0].value).toBe(
      'ipns://k51qzi5uqu5...',
    )
  })

  it('should preserve text record order', () => {
    const records: GetRecordsReturnType = {
      texts: [
        { key: 'first', value: 'value1' },
        { key: 'second', value: 'value2' },
        { key: 'third', value: 'value3' },
      ],
      coins: [],
      contentHash: null,
      abi: null,
      resolverAddress: MOCK_RESOLVER,
    }

    const result = recordsToTableData(records)

    expect(result[0]).toMatchObject({ key: 'first', type: 'text' })
    expect(result[1]).toMatchObject({ key: 'second', type: 'text' })
    expect(result[2]).toMatchObject({ key: 'third', type: 'text' })
  })

  it('should preserve coin record order', () => {
    const records: GetRecordsReturnType = {
      texts: [],
      coins: [
        { coinType: 60, value: 'eth-addr', symbol: 'ETH' },
        { coinType: 0, value: 'btc-addr', symbol: 'BTC' },
        { coinType: 714, value: 'bnb-addr', symbol: 'BNB' },
      ],
      contentHash: null,
      abi: null,
      resolverAddress: MOCK_RESOLVER,
    }

    const result = recordsToTableData(records)

    expect(result[0]).toMatchObject({ key: 'ETH', type: 'address' })
    expect(result[1]).toMatchObject({ key: 'BTC', type: 'address' })
    expect(result[2]).toMatchObject({ key: 'BNB', type: 'address' })
  })

  it('names the L2s keyed on testnet chain ids', () => {
    const records: GetRecordsReturnType = {
      texts: [],
      coins: [
        { coinType: 2147568180, value: 'a', symbol: 'Unknown Chain (84532)' },
        {
          coinType: 2158639068,
          value: 'b',
          symbol: 'Unknown Chain (11155420)',
        },
        { coinType: 2155261425, value: 'c', symbol: 'zora' },
        { coinType: 60, value: 'd', symbol: 'eth' },
      ],
      contentHash: null,
      abi: null,
      resolverAddress: MOCK_RESOLVER,
    }

    expect(
      recordsToTableData(records).map((record) =>
        'key' in record ? record.key : null,
      ),
    ).toEqual(['Base', 'Optimism', 'zora', 'eth'])
  })

  it('keeps the address-encoder names on mainnet', async () => {
    network.value = 'mainnet'
    vi.resetModules()
    const mainnet = await import('./recordsToTableData')
    network.value = 'sepolia'

    const records: GetRecordsReturnType = {
      texts: [],
      coins: [
        { coinType: 2147492101, value: 'a', symbol: 'base' },
        { coinType: 2147483658, value: 'b', symbol: 'op' },
        { coinType: 2147568180, value: 'c', symbol: 'Unknown Chain (84532)' },
      ],
      contentHash: null,
      abi: null,
      resolverAddress: MOCK_RESOLVER,
    }

    expect(
      mainnet
        .recordsToTableData(records)
        .map((record) => ('key' in record ? record.key : null)),
    ).toEqual(['base', 'op', 'Unknown Chain (84532)'])
  })

  it('labels an out-of-range EVM coin type instead of the chain it aliases (WEB-1447)', () => {
    // address-encoder names both "Unknown Chain (84532)"; only the first is
    // that chain, Base Sepolia, which is named after Base.
    const records: GetRecordsReturnType = {
      texts: [],
      coins: [
        {
          coinType: 2147568180,
          value: 'base-addr',
          symbol: 'Unknown Chain (84532)',
        },
        {
          coinType: 6442535476,
          value: 'alias-addr',
          symbol: 'Unknown Chain (84532)',
        },
      ],
      contentHash: null,
      abi: null,
      resolverAddress: MOCK_RESOLVER,
    }

    const result = recordsToTableData(records)

    expect(result[0]).toMatchObject({
      key: 'Base',
      type: 'address',
      id: 2147568180,
    })
    expect(result[1]).toMatchObject({
      key: 'Invalid coin type (6442535476)',
      type: 'address',
      id: 6442535476,
    })
  })

  it('should transform ABI record with object into table data', () => {
    const records: GetRecordsReturnType = {
      texts: [],
      coins: [],
      contentHash: null,
      abi: {
        contentType: 1,
        decoded: true,
        abi: { name: 'test', type: 'function', inputs: [] },
      },
      resolverAddress: MOCK_RESOLVER,
    }

    const result = recordsToTableData(records)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      type: 'abi',
      value: '{"name":"test","type":"function","inputs":[]}',
    })
  })

  it('should transform ABI record with string into table data', () => {
    const records: GetRecordsReturnType = {
      texts: [],
      coins: [],
      contentHash: null,
      abi: {
        contentType: 1,
        decoded: true,
        abi: '[{"name":"test"}]',
      },
      resolverAddress: MOCK_RESOLVER,
    }

    const result = recordsToTableData(records)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      type: 'abi',
      value: '[{"name":"test"}]',
    })
  })

  it('should handle null ABI record', () => {
    const records: GetRecordsReturnType = {
      texts: [],
      coins: [],
      contentHash: null,
      abi: null,
      resolverAddress: MOCK_RESOLVER,
    }

    const result = recordsToTableData(records)

    expect(result).toHaveLength(0)
  })
})
