/**
 * Pure async function to save profile records
 *
 * Uses ensjs's setRecordsWriteParameters which encodes resolver calls
 * via `multicall(calls)`, compatible with both PublicResolver and
 * the V2 PermissionedResolver (which share the same setter ABI).
 */

import {
  type EOATransactionRequest,
  getSmartAccountAddress,
  type RhinestoneTransactionRequest,
  type Signer,
  type TransactionRequest,
  transactionManager,
  type WaitForTransactionResult,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { setRecordsWriteParameters } from '@ensdomains/ensjs/wallet'
import * as v from 'valibot'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  type PublicClient,
} from 'viem'
import {
  createSafeUrlSchema,
  isSafeHttpUrl,
} from '@/features/profile/utils/safeUrl'
import { parseAbiRecord } from '@/features/profile/utils/validateAbi'
import { validateAddressRecordValue } from '@/features/profile/utils/validateAddress'
import { validateEmail } from '@/features/profile/utils/validateUrl'
import { type RecordIssue, RecordsValidationError } from './ProfileEdit.errors'

export { type RecordIssue, RecordsValidationError } from './ProfileEdit.errors'

// --- Types ---

interface ServiceTextRecord {
  readonly key: string
  readonly value: string
}

interface ServiceCoinRecord {
  readonly coinType: number
  readonly value: string
}

export interface ServiceRecordSnapshot {
  texts: ServiceTextRecord[]
  coins: ServiceCoinRecord[]
  contentHash?: string
  abi?: string
}

type TextChange = {
  key: string
  value: string | null
}

type CoinChange = {
  coin: number
  value: string | null
}

type OptionalRecordChange = {
  before?: string
  after?: string
}

type RecordChanges = {
  texts: TextChange[]
  coins: CoinChange[]
  contentHash?: OptionalRecordChange
  abi?: OptionalRecordChange
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

interface FinalTextRecord {
  readonly key: string
  readonly value: string | null | undefined
}

interface ValidationIssueInput {
  readonly message?: string
}

interface TransactionCall {
  readonly to: Address
  readonly data: Hex
  readonly value: bigint
}

interface CreateTransactionRequestParams {
  readonly signer: Signer
  readonly from: Address
  readonly to: Address
  readonly data: Hex
  readonly value: bigint
  readonly chainId: number
  readonly calls: TransactionCall[]
  readonly sponsored?: boolean
}

interface BuildRecordsUpdateRequestParams {
  readonly name: string
  readonly before: ServiceRecordSnapshot
  readonly after: ServiceRecordSnapshot
  readonly signer: Signer
  readonly accountAddress: Address
  readonly publicClient: PublicClient
  readonly chainId: number
  readonly resolverAddress: Address
}

interface BuildRecordsUpdateRequestResult {
  readonly request: TransactionRequest
  readonly description: string
}

interface UnsupportedSigner {
  readonly type: string
}

// --- Internal helpers ---

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

const bioUrlSchema = createSafeUrlSchema('Invalid Bio URL')

const linksSchema = v.array(
  v.object({
    name: v.string(),
    url: v.string(),
  }),
)

const recordIssue = (
  sectionKey: string,
  fieldKey: string,
  message: string,
): RecordIssue => ({
  sectionKey,
  fieldKey,
  message,
})

const validateLinksRecord = (value: string): RecordIssue[] => {
  let parsed: unknown

  try {
    parsed = JSON.parse(value)
  } catch {
    return [recordIssue('links', 'links', 'Invalid profile links')]
  }

  const result = v.safeParse(linksSchema, parsed)

  if (!result.success) {
    return [recordIssue('links', 'links', 'Invalid profile links')]
  }

  return result.output.flatMap((link, index) =>
    isSafeHttpUrl(link.url)
      ? []
      : [recordIssue('links', `links[${index}].url`, 'Invalid Link URL')],
  )
}

const validateFinalTextRecords = (texts: FinalTextRecord[]): RecordIssue[] => {
  const issues: RecordIssue[] = []

  for (const { key, value } of texts) {
    const trimmed = value?.trim() ?? ''
    if (trimmed === '') continue

    if (key === 'url') {
      const result = v.safeParse(bioUrlSchema, trimmed)
      if (!result.success) {
        issues.push(
          ...result.issues.map((issue: ValidationIssueInput) => ({
            sectionKey: 'bio',
            fieldKey: 'url',
            message: issue.message ?? 'Invalid Bio URL',
          })),
        )
      }
    }

    if (key === 'email') {
      const message = validateEmail(trimmed)
      if (message) {
        issues.push(recordIssue('contact', 'email', message))
      }
    }

    if (key === 'links') {
      issues.push(...validateLinksRecord(trimmed))
    }
  }

  return issues
}

const validateFinalCoinRecords = (
  coins: readonly ServiceCoinRecord[],
): RecordIssue[] =>
  coins.flatMap(({ coinType, value }) => {
    const message = validateAddressRecordValue(coinType, value)
    return message ? [recordIssue('address', String(coinType), message)] : []
  })

function createTransactionRequest(
  params: CreateTransactionRequestParams,
): TransactionRequest {
  const { signer, from, to, data, value, chainId, calls, sponsored } = params

  if (signer.type === 'eoa') {
    // EOA submits a single direct transaction (no batching support).
    // `calls` is ignored; profile updates already use a single multicall to the resolver.
    return {
      type: 'eoa',
      from,
      to,
      data,
      value,
      chainId,
    } as EOATransactionRequest
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

  signer satisfies never
  throw new Error(
    `Unsupported signer type for transaction request: ${(signer as UnsupportedSigner).type}`,
  )
}

async function buildRecordsUpdateRequest(
  params: BuildRecordsUpdateRequestParams,
): Promise<BuildRecordsUpdateRequestResult> {
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

  // Validate the final records, including unchanged records omitted from the diff.
  const issues = [
    ...validateFinalTextRecords(after.texts),
    ...validateFinalCoinRecords(after.coins),
  ]
  if (issues.length > 0) {
    throw new RecordsValidationError(issues)
  }

  let fromAddress: Address

  if (signer.type === 'eoa') {
    fromAddress = accountAddress
  } else if (signer.type === 'rhinestone') {
    fromAddress = getSmartAccountAddress(signer)
  } else {
    signer satisfies never
    throw new Error(
      'Only EOA or Rhinestone signer is supported for profile updates',
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
      coin,
      value: value ?? '',
    }))
  }

  if (changes.contentHash) {
    ensParams.contentHash = changes.contentHash.after || null
  }

  if (changes.abi) {
    const parsedAbi = parseAbiRecord(changes.abi.after)

    if (!parsedAbi.success) {
      throw new RecordsValidationError([
        {
          sectionKey: 'other',
          fieldKey: 'abi',
          message: parsedAbi.message,
        },
      ])
    }

    ensParams.abi = {
      encodeAs: 'json',
      data: parsedAbi.data as Record<string, unknown>[] | null,
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
 *   chainId: publicClient.chain.id,
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
