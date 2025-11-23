import {
  getCoderByCoinName,
  getCoderByCoinType,
} from '@ensdomains/address-encoder'
import { bytesToHex, encodeFunctionData, type Hex, zeroAddress } from 'viem'
import { DEDICATED_RESOLVER_ABI } from '../../contracts/abis/DedicatedResolver.abi'
import type { ServiceRecordSnapshot } from './records.types'

type TextChange = {
  key: string
  value: string | null
}

type CoinChange = {
  coin: string | number
  value: string | null
}

export type RecordChanges = {
  texts: TextChange[]
  coins: CoinChange[]
}

const normalizeCoinId = (
  coinId: string | number,
): { type: 'id'; value: number } | { type: 'name'; value: string } => {
  const isString = typeof coinId === 'string'

  if (isString && Number.isNaN(Number.parseInt(coinId, 10))) {
    return {
      type: 'name',
      value: coinId.toLowerCase().replace(/legacy$/, 'Legacy'),
    }
  }

  return {
    type: 'id',
    value: isString ? Number.parseInt(coinId, 10) : (coinId as number),
  }
}

const getCoderFromCoin = (coinId: string | number) => {
  const normalized = normalizeCoinId(coinId)

  if (normalized.type === 'id') {
    return getCoderByCoinType(normalized.value)
  }

  return getCoderByCoinName(normalized.value)
}

export const computeRecordChanges = (
  before: ServiceRecordSnapshot,
  after: ServiceRecordSnapshot,
): RecordChanges => {
  const textChanges: TextChange[] = []
  const coinChanges: CoinChange[] = []

  const beforeTexts = new Map(
    before.texts.map(({ key, value }) => [key, value]),
  )
  const afterTexts = new Map(after.texts.map(({ key, value }) => [key, value]))

  const textKeys = new Set([...beforeTexts.keys(), ...afterTexts.keys()])

  for (const key of textKeys) {
    const prev = (beforeTexts.get(key) ?? '').trim()
    const next = (afterTexts.get(key) ?? '').trim()

    if (prev !== next) {
      textChanges.push({
        key,
        value: next === '' ? null : next,
      })
    }
  }

  const beforeCoins = new Map(
    before.coins.map(({ coinType, value }) => [String(coinType), value]),
  )
  const afterCoins = new Map(
    after.coins.map(({ coinType, value }) => [String(coinType), value]),
  )

  const coinKeys = new Set([...beforeCoins.keys(), ...afterCoins.keys()])

  for (const key of coinKeys) {
    const prev = (beforeCoins.get(key) ?? '').trim()
    const next = (afterCoins.get(key) ?? '').trim()

    if (prev !== next) {
      coinChanges.push({
        coin: Number.parseInt(key, 10),
        value: next === '' ? null : next,
      })
    }
  }

  return { texts: textChanges, coins: coinChanges }
}

const encodeCoinValue = (
  coder: ReturnType<typeof getCoderFromCoin>,
  value: string | null,
): Hex => {
  let encoded: Hex | Uint8Array = value ? coder.decode(value) : '0x'

  if (coder.coinType === 60 && encoded === '0x') {
    encoded = coder.decode(zeroAddress)
  }

  if (typeof encoded !== 'string') {
    encoded = bytesToHex(encoded)
  }

  return encoded
}

const buildTextCalls = (options: {
  abi: typeof DEDICATED_RESOLVER_ABI
  texts: TextChange[]
  buildArgs: (key: string, value: string | null) => readonly unknown[]
}): Hex[] =>
  options.texts.map(({ key, value }) =>
    encodeFunctionData({
      abi: options.abi,
      functionName: 'setText',
      args: options.buildArgs(key, value ?? '') as any,
    }),
  )

const buildCoinCalls = (options: {
  abi: typeof DEDICATED_RESOLVER_ABI
  coins: CoinChange[]
  buildArgs: (coinType: number, encoded: Hex) => readonly unknown[]
}): Hex[] =>
  options.coins.map(({ coin, value }) => {
    const coder = getCoderFromCoin(coin)
    const encoded = encodeCoinValue(coder, value)

    return encodeFunctionData({
      abi: options.abi,
      functionName: 'setAddr',
      args: options.buildArgs(coder.coinType, encoded) as any,
    })
  })

export const buildDedicatedResolverCalls = (changes: RecordChanges): Hex[] => [
  ...buildTextCalls({
    abi: DEDICATED_RESOLVER_ABI,
    texts: changes.texts,
    buildArgs: (key, value) => [key, value],
  }),
  ...buildCoinCalls({
    abi: DEDICATED_RESOLVER_ABI,
    coins: changes.coins,
    buildArgs: (coinType, encoded) => [BigInt(coinType), encoded],
  }),
]
