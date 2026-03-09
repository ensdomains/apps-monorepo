/**
 * Pure async function to save profile records
 *
 * This function:
 * 1. Builds the transaction request from profile record params
 * 2. Calls transactionManager.startTransaction()
 * 3. Waits for completion via waitForTransaction()
 */

import {
  type RhinestoneTransactionRequest,
  type Signer,
  type TransactionRequest,
  transactionManager,
  type WaitForTransactionResult,
  waitForTransaction,
  type ZeroDevTransactionRequest,
} from '@ens-apps/transaction-manager'
import {
  getCoderByCoinName,
  getCoderByCoinType,
} from '@ensdomains/address-encoder'
import { encodeContentHash } from '@ensdomains/ensjs/utils'
import * as v from 'valibot'
import {
  type Address,
  bytesToHex,
  encodeFunctionData,
  type Hex,
  namehash,
  type PublicClient,
  stringToHex,
} from 'viem'

// --- Constants ---

const DEDICATED_RESOLVER_ABI = [
  {
    inputs: [
      { internalType: 'uint256', name: 'coinType', type: 'uint256' },
      { internalType: 'bytes', name: 'addressBytes', type: 'bytes' },
    ],
    name: 'setAddr',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'string', name: 'key', type: 'string' },
      { internalType: 'string', name: 'value', type: 'string' },
    ],
    name: 'setText',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'bytes', name: 'hash', type: 'bytes' }],
    name: 'setContenthash',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'contentType', type: 'uint256' },
      { internalType: 'bytes', name: 'data', type: 'bytes' },
    ],
    name: 'setABI',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'bytes32', name: '', type: 'bytes32' },
      { internalType: 'bytes[]', name: 'calls', type: 'bytes[]' },
    ],
    name: 'multicallWithNodeCheck',
    outputs: [{ internalType: 'bytes[]', name: '', type: 'bytes[]' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

const ENS_SEPOLIA_CONTRACTS = {
  PublicResolver: '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD' as Address,
}

// --- Types ---

export interface ServiceRecordSnapshot {
  texts: Array<{ key: string; value: string }>
  coins: Array<{ coinType: number; value: string }>
  contentHash?: string
  abi?: string
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
  contentHash?: { before?: string; after?: string }
  abi?: { before?: string; after?: string }
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

export interface SaveRecordsParams {
  name: string
  before: ServiceRecordSnapshot
  after: ServiceRecordSnapshot
  signer: Signer
  accountAddress: Address
  publicClient: PublicClient
  chainId: number
  resolverAddress?: Address
}

export interface SaveRecordsResult extends WaitForTransactionResult {
  txId: string
}

// --- Internal helpers ---

function getSmartAccountAddress(signer: Signer): Address {
  if (signer.type === 'rhinestone') {
    if (signer.config.accountAddress) {
      return signer.config.accountAddress
    }
    return signer.account.getAddress() as Address
  }

  if (signer.type === 'zerodev') {
    if (signer.config.accountAddress) {
      return signer.config.accountAddress
    }

    const kernelClient = signer.account as {
      account?: { address: Address }
      address?: Address
    }

    if (kernelClient?.account?.address) {
      return kernelClient.account.address
    }

    if (kernelClient?.address) {
      return kernelClient.address
    }

    throw new Error(
      'Unable to get smart account address from KernelAccountClient',
    )
  }

  throw new Error(
    'Only Rhinestone or ZeroDev signer is supported for this operation',
  )
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

  const changes: RecordChanges = { texts: textChanges, coins: coinChanges }

  const beforeContentHash = (before.contentHash ?? '').trim()
  const afterContentHash = (after.contentHash ?? '').trim()
  if (beforeContentHash !== afterContentHash) {
    changes.contentHash = {
      before: beforeContentHash || undefined,
      after: afterContentHash || undefined,
    }
  }

  const beforeAbi = (before.abi ?? '').trim()
  const afterAbi = (after.abi ?? '').trim()
  if (beforeAbi !== afterAbi) {
    changes.abi = {
      before: beforeAbi || undefined,
      after: afterAbi || undefined,
    }
  }

  return changes
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

const buildDedicatedResolverCalls = (changes: RecordChanges): Hex[] => {
  const allIssues: RecordIssue[] = []

  const { calls: textCalls, issues: textIssues } = buildTextCalls({
    abi: DEDICATED_RESOLVER_ABI,
    texts: changes.texts,
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

  const extraCalls: Hex[] = []

  if (changes.contentHash) {
    const hash = changes.contentHash.after ?? ''
    const encodedHash: Hex = hash
      ? hash.startsWith('0x')
        ? (hash as Hex)
        : encodeContentHash(hash)
      : '0x'
    extraCalls.push(
      encodeFunctionData({
        abi: DEDICATED_RESOLVER_ABI,
        functionName: 'setContenthash',
        args: [encodedHash],
      }),
    )
  }

  if (changes.abi) {
    const abiJson = changes.abi.after ?? ''
    if (abiJson) {
      try {
        const parsed = JSON.parse(abiJson)
        if (!Array.isArray(parsed)) {
          allIssues.push({
            sectionKey: 'other',
            fieldKey: 'abi',
            message: 'ABI must be a JSON array',
          })
        }
      } catch {
        allIssues.push({
          sectionKey: 'other',
          fieldKey: 'abi',
          message: 'ABI must be valid JSON',
        })
      }
    }

    if (allIssues.length > 0) {
      throw new RecordsValidationError(allIssues)
    }

    const abiBytes = abiJson ? stringToHex(abiJson) : '0x'
    const contentType = abiJson ? 1n : 0n
    extraCalls.push(
      encodeFunctionData({
        abi: DEDICATED_RESOLVER_ABI,
        functionName: 'setABI',
        args: [contentType, abiBytes as Hex],
      }),
    )
  }

  return [...textCalls, ...coinCalls, ...extraCalls]
}

function createTransactionRequest(params: {
  signer: Signer
  from: Address
  to: Address
  data: Hex
  value: bigint
  chainId: number
  calls: Array<{ to: Address; data: Hex; value: bigint }>
  sponsored?: boolean
}): TransactionRequest {
  const { signer, from, to, data, value, chainId, calls, sponsored } = params

  if (signer.type === 'eoa') {
    return {
      type: 'eoa',
      from,
      to,
      data,
      value,
      chainId,
    }
  }

  if (signer.type === 'rhinestone') {
    return {
      type: 'rhinestone-intent',
      from,
      to,
      data,
      value,
      chainId,
      rhinestoneParams: {
        calls,
        sponsored: sponsored ?? true,
      },
    } as RhinestoneTransactionRequest
  }

  if (signer.type === 'zerodev') {
    return {
      type: 'zerodev',
      from,
      to,
      data,
      value,
      chainId,
      zerodevParams: {
        calls,
        sponsored: sponsored ?? true,
      },
    } as ZeroDevTransactionRequest
  }

  signer satisfies never
  throw new Error('Unsupported signer type for transaction request')
}

function buildRecordsUpdateRequest(params: {
  name: string
  before: ServiceRecordSnapshot
  after: ServiceRecordSnapshot
  signer: Signer
  accountAddress: Address
  chainId: number
  resolverAddress?: Address
}): { request: TransactionRequest; description: string } {
  const { name, before, after, signer, accountAddress, chainId } = params

  const changes = computeRecordChanges(before, after)

  const hasChanges =
    changes.texts.length > 0 ||
    changes.coins.length > 0 ||
    changes.contentHash !== undefined ||
    changes.abi !== undefined

  if (!hasChanges) {
    throw new Error('No profile record changes to apply')
  }

  let fromAddress: Address

  if (signer.type === 'eoa') {
    fromAddress = accountAddress
  } else if (signer.type === 'rhinestone' || signer.type === 'zerodev') {
    fromAddress = getSmartAccountAddress(signer)
  } else {
    throw new Error(
      'Only EOA, Rhinestone, or ZeroDev signers are supported for profile updates',
    )
  }

  const resolverAddress =
    params.resolverAddress ?? ENS_SEPOLIA_CONTRACTS.PublicResolver

  const node = namehash(name) as Hex
  const encodedCalls = buildDedicatedResolverCalls(changes)

  const multicallData = encodeFunctionData({
    abi: DEDICATED_RESOLVER_ABI,
    functionName: 'multicallWithNodeCheck',
    args: [node, encodedCalls],
  })

  const calls = [
    {
      to: resolverAddress,
      data: multicallData,
      value: 0n,
    },
  ]

  const request = createTransactionRequest({
    signer,
    from: fromAddress,
    to: resolverAddress,
    data: multicallData,
    value: 0n,
    chainId,
    calls,
  })

  return {
    request,
    description: `Update profile records for ${name}`,
  }
}

// --- Public API ---

/**
 * Save profile records to the blockchain
 *
 * Pure async function that builds the request, starts the transaction,
 * and waits for it to complete. Returns the transaction result.
 *
 * @throws RecordsValidationError if record validation fails (invalid addresses, URLs, etc.)
 * @throws Error if no changes to apply, transaction not found, or transaction fails
 *
 * @example
 * ```ts
 * const mutation = useMutation({
 *   mutationFn: saveRecords,
 *   onSuccess: () => refetchRecords(),
 * })
 *
 * mutation.mutate({
 *   name: 'myname.eth',
 *   before: transformToServiceFormat(originalValues),
 *   after: transformToServiceFormat(currentValues),
 *   signer: account.signer,
 *   accountAddress: account.accountAddress,
 *   publicClient,
 *   chainId: 11155111,
 *   resolverAddress,
 * })
 * ```
 */
export async function saveRecords(
  params: SaveRecordsParams,
): Promise<SaveRecordsResult> {
  const { publicClient, chainId, ...requestParams } = params

  // Build the transaction request (validates and computes diff)
  const { request, description } = buildRecordsUpdateRequest({
    ...requestParams,
    chainId,
  })

  console.log('🚀 [SAVE_RECORDS] Starting transaction:', {
    name: params.name,
    signerType: params.signer.type,
    description,
  })

  // Start the transaction through the transaction manager
  const txId = transactionManager.startTransaction(
    {
      type: 'custom',
      request,
    },
    params.signer,
    {
      description,
      publicClient,
      chainId,
    },
  )

  console.log('📝 [SAVE_RECORDS] Transaction started:', { txId })

  // Wait for the transaction to complete
  const result = await waitForTransaction(txId)

  console.log('✅ [SAVE_RECORDS] Transaction completed:', {
    txId,
    hash: result.hash,
  })

  return {
    ...result,
    txId,
  }
}
