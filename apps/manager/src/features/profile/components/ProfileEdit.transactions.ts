/**
 * Pure async function to save profile records
 *
 * Uses ensjs's setRecordsWriteParameters which encodes resolver calls
 * via `multicall(calls)`, compatible with both PublicResolver and
 * the V2 PermissionedResolver (which share the same setter ABI).
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
import { setRecordsWriteParameters } from '@ensdomains/ensjs/wallet'
import * as v from 'valibot'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  type PublicClient,
} from 'viem'

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
  resolverAddress: Address
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

const validateTextChanges = (texts: TextChange[]): RecordIssue[] => {
  const issues: RecordIssue[] = []

  for (const { key, value } of texts) {
    const trimmed = value?.trim() ?? ''
    if (trimmed === '') continue

    if (key === 'url') {
      const result = v.safeParse(bioUrlSchema, trimmed)
      if (!result.success) {
        issues.push(
          ...result.issues.map((issue: { message?: string }) => ({
            sectionKey: 'bio',
            fieldKey: 'url',
            message: issue.message ?? 'Invalid Bio URL',
          })),
        )
      }
    }
  }

  return issues
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

async function buildRecordsUpdateRequest(params: {
  name: string
  before: ServiceRecordSnapshot
  after: ServiceRecordSnapshot
  signer: Signer
  accountAddress: Address
  publicClient: PublicClient
  chainId: number
  resolverAddress: Address
}): Promise<{ request: TransactionRequest; description: string }> {
  const {
    name,
    before,
    after,
    signer,
    accountAddress,
    publicClient,
    chainId,
    resolverAddress,
  } = params

  const changes = computeRecordChanges(before, after)

  const hasChanges =
    changes.texts.length > 0 ||
    changes.coins.length > 0 ||
    changes.contentHash !== undefined ||
    changes.abi !== undefined

  if (!hasChanges) {
    throw new Error('No profile record changes to apply')
  }

  // Validate text changes
  const issues = validateTextChanges(changes.texts)
  if (issues.length > 0) {
    throw new RecordsValidationError(issues)
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

  // Transform changes to ensjs format
  const ensParams: Parameters<typeof setRecordsWriteParameters>[1] = {
    name,
    resolverAddress,
  }

  if (changes.texts.length > 0) {
    ensParams.texts = changes.texts.map(({ key, value }) => ({
      key,
      value: value ?? '',
    }))
  }

  if (changes.coins.length > 0) {
    ensParams.coins = changes.coins.map(({ coin, value }) => ({
      coin: typeof coin === 'number' ? coin : Number.parseInt(String(coin), 10),
      value: value ?? '',
    }))
  }

  if (changes.contentHash) {
    ensParams.contentHash = changes.contentHash.after || null
  }

  if (changes.abi) {
    const abiJson = changes.abi.after ?? ''
    if (abiJson) {
      try {
        const parsed = JSON.parse(abiJson)
        if (!Array.isArray(parsed)) {
          throw new RecordsValidationError([
            {
              sectionKey: 'other',
              fieldKey: 'abi',
              message: 'ABI must be a JSON array',
            },
          ])
        }
        ensParams.abi = { encodeAs: 'json', data: parsed }
      } catch (e) {
        if (e instanceof RecordsValidationError) throw e
        throw new RecordsValidationError([
          {
            sectionKey: 'other',
            fieldKey: 'abi',
            message: 'ABI must be valid JSON',
          },
        ])
      }
    } else {
      ensParams.abi = { encodeAs: 'json', data: null }
    }
  }

  // Use ensjs to build the write parameters
  // publicClient is used only for chain metadata — ensjs doesn't send transactions here
  const client = publicClient as unknown as Parameters<
    typeof setRecordsWriteParameters
  >[0]
  const writeParams = await setRecordsWriteParameters(client, ensParams)

  const data = encodeFunctionData({
    abi: writeParams.abi,
    functionName: writeParams.functionName,
    args: writeParams.args,
  } as Parameters<typeof encodeFunctionData>[0])

  const calls = [
    {
      to: resolverAddress,
      data,
      value: 0n,
    },
  ]

  const request = createTransactionRequest({
    signer,
    from: fromAddress,
    to: resolverAddress,
    data,
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
 * Uses ensjs's setRecordsWriteParameters to encode resolver calls,
 * compatible with both PublicResolver (V1) and PermissionedResolver (V2).
 *
 * @throws RecordsValidationError if record validation fails (invalid URLs, etc.)
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
  const { request, description } = await buildRecordsUpdateRequest({
    ...requestParams,
    publicClient,
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
