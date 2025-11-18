import {
  getCoderByCoinName,
  getCoderByCoinType,
} from '@ensdomains/address-encoder'
import { errAsync, fromPromise, type ResultAsync } from 'neverthrow'
import {
  type Address,
  bytesToHex,
  encodeFunctionData,
  type Hex,
  namehash,
  type PublicClient,
} from 'viem'
import { ENS_SEPOLIA_CONTRACTS } from '../../contracts/ens-sepolia'
import { transactionManager } from '../../providers/transactionManager'

/**
 * Snapshot of resolver records in the "service format"
 * (texts & coins arrays), matching what ensjs/setRecords expects.
 */
export type ServiceRecordSnapshot = {
  texts: Array<{ key: string; value: string }>
  coins: Array<{ coinType: number; value: string }>
}

type TextChange = {
  key: string
  value: string | null
}

type CoinChange = {
  coin: string | number
  value: string | null
}

type RecordChanges = {
  texts: TextChange[]
  coins: CoinChange[]
}

/**
 * Minimal DedicatedResolver ABI snippets required for profile updates.
 */
const dedicatedResolverSetTextSnippet = [
  {
    inputs: [
      {
        name: 'key',
        type: 'string',
      },
      {
        name: 'value',
        type: 'string',
      },
    ],
    name: 'setText',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

const dedicatedResolverSetAddrSnippet = [
  {
    inputs: [
      {
        name: 'coinType',
        type: 'uint256',
      },
      {
        name: 'addressBytes',
        type: 'bytes',
      },
    ],
    name: 'setAddr',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

const dedicatedResolverMulticallWithNodeCheckSnippet = [
  {
    inputs: [
      {
        name: 'node',
        type: 'bytes32',
      },
      {
        name: 'calls',
        type: 'bytes[]',
      },
    ],
    name: 'multicallWithNodeCheck',
    outputs: [
      {
        name: 'results',
        type: 'bytes[]',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

/**
 * Normalize a coin id (string or number) into either a numeric type or name.
 * Mirrors ensjs normalizeCoinId behaviour in a simplified form.
 */
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

const computeRecordChanges = (
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

  return {
    texts: textChanges,
    coins: coinChanges,
  }
}

const buildDedicatedResolverCalls = (changes: RecordChanges): Hex[] => {
  const calls: Hex[] = []

  for (const { key, value } of changes.texts) {
    const data = encodeFunctionData({
      abi: dedicatedResolverSetTextSnippet,
      functionName: 'setText',
      args: [key, value ?? ''],
    })

    calls.push(data)
  }

  for (const { coin, value } of changes.coins) {
    const coder = getCoderFromCoin(coin)
    let encoded: Hex | Uint8Array = value ? coder.decode(value) : '0x'

    if (coder.coinType === 60 && encoded === '0x') {
      encoded = coder.decode('0x0000000000000000000000000000000000000000')
    }

    if (typeof encoded !== 'string') {
      encoded = bytesToHex(encoded)
    }

    const data = encodeFunctionData({
      abi: dedicatedResolverSetAddrSnippet,
      functionName: 'setAddr',
      args: [BigInt(coder.coinType), encoded],
    })

    calls.push(data)
  }

  return calls
}

export const submitProfileRecordsUpdateActor = (input: {
  name: string
  before: ServiceRecordSnapshot
  after: ServiceRecordSnapshot
  signer: import('../..').Signer
  publicClient: PublicClient
  chainId: number
  resolverAddress?: Address
}): ResultAsync<string, Error> =>
  fromPromise(
    (async () => {
      const changes = computeRecordChanges(input.before, input.after)

      if (changes.texts.length === 0 && changes.coins.length === 0) {
        throw new Error('No profile record changes to apply')
      }

      if (input.signer.type !== 'rhinestone') {
        throw new Error(
          'Only Rhinestone signer is currently supported for profile updates',
        )
      }

      const smartAccountAddress = input.signer.account.getAddress() as Address
      const resolverAddress =
        input.resolverAddress ?? ENS_SEPOLIA_CONTRACTS.DedicatedResolverImpl

      const node = namehash(input.name) as Hex

      const calls = buildDedicatedResolverCalls(changes)

      const multicallData = encodeFunctionData({
        abi: dedicatedResolverMulticallWithNodeCheckSnippet,
        functionName: 'multicallWithNodeCheck',
        args: [node, calls],
      })

      const txId = transactionManager.startTransaction(
        {
          type: 'custom',
          request: {
            type: 'rhinestone-intent',
            from: smartAccountAddress,
            to: resolverAddress,
            data: multicallData,
            value: 0n,
            chainId: input.chainId,
            rhinestoneParams: {
              calls: [
                {
                  to: resolverAddress,
                  data: multicallData,
                  value: 0n,
                },
              ],
            },
          },
        },
        input.signer,
        {
          description: `Update profile records for ${input.name}`,
          publicClient: input.publicClient,
          chainId: input.chainId,
        },
      )

      return txId
    })(),
    (error) => error as Error,
  )

export const pollTransactionStatusActor = (input: {
  txId: string
}): ResultAsync<void, Error> => {
  const txActor = transactionManager.getTransaction(input.txId)

  if (!txActor) {
    return errAsync(new Error(`Transaction ${input.txId} not found`))
  }

  return fromPromise(
    new Promise<void>((resolve, reject) => {
      const subscription = txActor.subscribe((snapshot) => {
        if (snapshot.value === 'success') {
          subscription.unsubscribe()
          resolve()
        }
        if (
          typeof snapshot.value === 'object' &&
          snapshot.value !== null &&
          'error' in snapshot.value
        ) {
          subscription.unsubscribe()
          reject(snapshot.context.error || new Error('Transaction failed'))
        }
      })
    }),
    (error) => error as Error,
  )
}
