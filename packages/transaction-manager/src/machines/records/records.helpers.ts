import {
  getCoderByCoinName,
  getCoderByCoinType,
} from '@ensdomains/address-encoder'
import * as v from 'valibot'
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

export type RecordIssue = {
  sectionKey: string
  fieldKey: string
  message: string
}

export class RecordsValidationError extends Error {
  issues: RecordIssue[]

  constructor(issues: RecordIssue[]) {
    super(issues.map((issue) => issue.message).join('\n'))
    this.name = 'RecordsValidationError'
    this.issues = issues
  }
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

const bioUrlSchema = v.pipe(v.string(), v.trim(), v.url('Invalid Bio URL'))

const validateTextChange = ({ key, value }: TextChange): RecordIssue[] => {
  const trimmed = value?.trim() ?? ''

  if (trimmed === '') {
    return []
  }

  if (key === 'url') {
    const result = v.safeParse(bioUrlSchema, trimmed)

    if (!result.success) {
      return result.issues.map((issue: { message?: string }) => ({
        sectionKey: 'bio',
        fieldKey: 'url',
        message: issue.message ?? 'Invalid Bio URL',
      }))
    }
  }

  return []
}

const encodeCoinValue = (
  coder: ReturnType<typeof getCoderFromCoin>,
  value: string | null,
): Hex => {
  try {
    let encoded: Hex | Uint8Array =
      value && value.trim() !== '' ? coder.decode(value) : '0x'

    if (coder.coinType === 60 && encoded === '0x') {
      encoded = coder.decode(zeroAddress)
    }

    if (typeof encoded !== 'string') {
      encoded = bytesToHex(encoded)
    }

    return encoded
  } catch (_error) {
    const coinName =
      (coder as any)?.name ?? `coin type ${String((coder as any)?.coinType)}`
    throw new Error(`Invalid ${coinName} address`)
  }
}

const buildTextCalls = (options: {
  abi: typeof DEDICATED_RESOLVER_ABI
  texts: TextChange[]
  buildArgs: (key: string, value: string | null) => readonly [string, string]
}): { calls: Hex[]; issues: RecordIssue[] } => {
  const calls: Hex[] = []
  const issues: RecordIssue[] = []

  for (const change of options.texts) {
    const changeIssues = validateTextChange(change)

    if (changeIssues.length > 0) {
      issues.push(...changeIssues)
      continue
    }

    calls.push(
      encodeFunctionData({
        abi: options.abi,
        functionName: 'setText',
        args: options.buildArgs(change.key, change.value ?? ''),
      }),
    )
  }

  return { calls, issues }
}

const buildCoinCalls = (options: {
  abi: typeof DEDICATED_RESOLVER_ABI
  coins: CoinChange[]
  buildArgs: (
    coinType: number,
    encoded: Hex,
  ) => readonly [bigint, `0x${string}`]
}): { calls: Hex[]; issues: RecordIssue[] } => {
  const calls: Hex[] = []
  const issues: RecordIssue[] = []

  for (const { coin, value } of options.coins) {
    const coder = getCoderFromCoin(coin)

    try {
      const encoded = encodeCoinValue(coder, value)

      calls.push(
        encodeFunctionData({
          abi: options.abi,
          functionName: 'setAddr',
          args: options.buildArgs(coder.coinType, encoded),
        }),
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Invalid coin address'

      issues.push({
        sectionKey: 'address',
        fieldKey: String(coder.coinType),
        message,
      })
    }
  }

  return { calls, issues }
}

export const buildDedicatedResolverCalls = (changes: RecordChanges): Hex[] => {
  const allIssues: RecordIssue[] = []

  const { calls: textCalls, issues: textIssues } = buildTextCalls({
    abi: DEDICATED_RESOLVER_ABI,
    texts: changes.texts,
    // biome-ignore lint/style/noNonNullAssertion: value is never null
    buildArgs: (key, value) => [key, value!],
  })
  allIssues.push(...textIssues)

  const { calls: coinCalls, issues: coinIssues } = buildCoinCalls({
    abi: DEDICATED_RESOLVER_ABI,
    coins: changes.coins,
    buildArgs: (coinType, encoded) => [BigInt(coinType), encoded],
  })
  allIssues.push(...coinIssues)

  if (allIssues.length > 0) {
    throw new RecordsValidationError(allIssues)
  }

  return [...textCalls, ...coinCalls]
}
