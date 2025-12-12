import { DEDICATED_RESOLVER_ABI } from '@ens-apps/transaction-manager/contracts/abis/DedicatedResolver.abi'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  coinTypeToNameMap,
  getCoderByCoinType,
} from '@ensdomains/address-encoder'
import { ok } from 'neverthrow'
import { type Address, hexToBytes, namehash } from 'viem'
import { readContract } from 'viem/actions'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { alwaysProbeAddressRecords, forceFetchRecords } from '../data/records'
import { DEBUG_PROFILE } from '../MOCK'
import { getSubgraphRecords } from './getSubgraphRecords'
import { getResolver } from './profileResolver'

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
      } as unknown as NonNullable<typeof subgraphRecords>,
    })
  }

  const client = yield* safeGetClient()
  const subgraphRecords = yield* getSubgraphRecords(name)
  const resolverAddress = (yield* getResolver(name)) as Address | undefined

  const texts = [
    ...forceFetchRecords.always,
    ...(subgraphRecords
      ? subgraphRecords.texts.filter(
          (t) => !forceFetchRecords.always.includes(t),
        )
      : forceFetchRecords.whenNotIndexed),
  ]

  const coinTypes = subgraphRecords
    ? [
        ...subgraphRecords.coins.filter(
          (c) => !alwaysProbeAddressRecords.includes(c),
        ),
        ...alwaysProbeAddressRecords,
      ]
    : alwaysProbeAddressRecords

  const result: ProfileRecordsResult = {
    texts: [],
    coins: [],
    resolverAddress,
    _rawSubgraphRecords: subgraphRecords,
  }

  if (!resolverAddress) {
    return ok(result)
  }

  const node = namehash(name)

  for (const key of texts) {
    try {
      const value = await readContract(client, {
        address: resolverAddress,
        abi: DEDICATED_RESOLVER_ABI,
        functionName: 'text',
        args: [node, key],
      })

      if (typeof value === 'string' && value.trim() !== '') {
        result.texts.push({ key, value })
      }
    } catch (error) {
      console.warn('Failed to fetch text record', { name, key, error })
    }
  }

  for (const coin of coinTypes) {
    const coinTypeNumber = Number.parseInt(String(coin), 10)
    if (Number.isNaN(coinTypeNumber)) continue

    try {
      const raw = await readContract(client, {
        address: resolverAddress,
        abi: DEDICATED_RESOLVER_ABI,
        functionName: 'addr',
        args: [node, BigInt(coinTypeNumber)],
      })

      if (raw === '0x' || raw === null) continue

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
    } catch (error) {
      console.warn('Failed to fetch address record', {
        name,
        coinType: coin,
        error,
      })
    }
  }

  return ok(result)
})

export type ProfileRecordsResult = {
  texts: Array<{ key: string; value: string }>
  coins: Array<{ coinType: number; value: string; symbol?: string }>
  resolverAddress?: Address
  _rawSubgraphRecords?: unknown
}

export const profileRecordsQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'get_records', { name }),
    queryFn: ({ queryKey: [{ name }] }) => getProfileRecords(name),
  })
