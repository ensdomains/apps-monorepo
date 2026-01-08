import { DEDICATED_RESOLVER_ABI } from '@ens-apps/transaction-manager/contracts/abis/DedicatedResolver.abi'
import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  coinTypeToNameMap,
  getCoderByCoinType,
} from '@ensdomains/address-encoder'
import { ok } from 'neverthrow'
import { type Address, hexToBytes, namehash } from 'viem'
import { multicall } from 'viem/actions'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { alwaysProbeAddressRecords, forceFetchRecords } from '../data/records'
import { DEBUG_PROFILE } from '../MOCK'
import { getIndexerRecords } from './getIndexerRecords'
import { getResolver } from './useProfileResolver'

const COIN_TYPE_NAME_MAP = coinTypeToNameMap as Record<
  string,
  readonly [string, string]
>

export const getProfileRecords = ResultFn(async function* (name: string) {
  if (name === 'debug') {
    return ok({
      ...DEBUG_PROFILE,
      _rawSubgraphRecords: {
        isMigrated: false,
        createdAt: new Date(),
      } as unknown as NonNullable<typeof indexerRecords>,
    })
  }

  const client = yield* safeGetClient()
  const indexerRecords = yield* getIndexerRecords(name)
  const resolverAddress = yield* getResolver(name)

  const texts = [
    ...forceFetchRecords.always,
    ...(indexerRecords
      ? indexerRecords.texts.filter(
          (t) => !forceFetchRecords.always.includes(t),
        )
      : forceFetchRecords.whenNotIndexed),
  ]

  const coinTypeCandidates = indexerRecords
    ? [...indexerRecords.coins, ...alwaysProbeAddressRecords]
    : alwaysProbeAddressRecords

  const result: ProfileRecordsResult = {
    texts: [],
    coins: [],
    resolverAddress,
    _rawSubgraphRecords: indexerRecords,
  }

  if (!resolverAddress) {
    return ok(result)
  }

  const node = namehash(name)

  const textContracts = texts.map((key) => ({
    address: resolverAddress,
    abi: DEDICATED_RESOLVER_ABI,
    functionName: 'text' as const,
    args: [node, key] as const,
  }))

  const textResults = await multicall(client, {
    contracts: textContracts,
    allowFailure: true,
  })

  textResults.forEach((entry, index) => {
    const key = texts[index]

    if (!key) return

    if (entry.status !== 'success') {
      return
    }

    const value = entry.result as string

    if (typeof value === 'string' && value.trim() !== '') {
      result.texts.push({ key, value })
    }
  })

  const coinTypeNumbers = Array.from(
    new Set(
      coinTypeCandidates.map((coin) => Number.parseInt(String(coin), 10)),
    ),
  ).filter((coinType) => !Number.isNaN(coinType))

  const coinContracts = coinTypeNumbers.map((coinTypeNumber) => ({
    address: resolverAddress,
    abi: DEDICATED_RESOLVER_ABI,
    functionName: 'addr' as const,
    args: [node, BigInt(coinTypeNumber)] as const,
  }))

  const coinResults = await multicall(client, {
    contracts: coinContracts,
    allowFailure: true,
  })

  coinResults.forEach((entry, index) => {
    const coinTypeNumber = coinTypeNumbers[index]

    if (coinTypeNumber === undefined) return

    if (entry.status !== 'success') {
      return
    }

    const raw = entry.result as `0x${string}` | string | null

    if (!raw || raw === '0x') return

    let value: string

    try {
      const coder = getCoderByCoinType(coinTypeNumber)
      const bytes = hexToBytes(raw as `0x${string}`)
      value = coder.encode(bytes)
    } catch {
      value = raw as string
    }

    const symbolEntry = COIN_TYPE_NAME_MAP[String(coinTypeNumber)]

    result.coins.push({
      coinType: coinTypeNumber,
      value,
      ...(symbolEntry ? { symbol: symbolEntry[0] } : {}),
    })
  })

  return ok(result)
})

export type ProfileRecordsResult = {
  texts: Array<{ key: string; value: string }>
  coins: Array<{ coinType: number; value: string; symbol?: string }>
  resolverAddress?: Address
  _rawSubgraphRecords?: unknown
}

export const useProfileRecordsQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'get_records', { name }),
    queryFn: ({ queryKey: [{ name }] }) => getProfileRecords(name),
  })
