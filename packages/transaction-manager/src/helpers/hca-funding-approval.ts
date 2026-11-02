import { fromSync, ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { err, errAsync, ok, Result, ResultAsync } from 'neverthrow'
import * as v from 'valibot'
import type { Address, Hash, PublicClient, WalletClient } from 'viem'
import {
  BaseError,
  encodeFunctionData,
  erc20Abi,
  isAddressEqual,
  numberToHex,
} from 'viem'
import { containsNodeError, getNodeError } from 'viem/utils'
import { assign, createActor, fromPromise, setup, toPromise } from 'xstate'
import { isCanonicalHcaUsdc } from './hca-usdc-permit'
import { isTerminalWalletError } from './wallet-errors.helpers'

export class HcaFundingApprovalError extends TaggedError(
  'HcaFundingApprovalError',
)<{
  readonly cause: unknown
}> {
  constructor(input: { readonly cause: unknown }) {
    super({
      ...input,
      message:
        input.cause instanceof Error
          ? input.cause.message
          : String(input.cause),
    })
  }
}

export class HcaFundingApprovalDeclinedError extends Error {
  constructor() {
    super(
      'The USDC approval transaction was cancelled. The renewal was not submitted.',
    )
    this.name = 'HcaFundingApprovalDeclinedError'
  }
}

export interface HcaFundingApprovalPrompt {
  readonly kind: 'approval'
  readonly chainId: number
  readonly owner: Address
  readonly token: Address
  readonly spender: Address
  readonly amount: bigint
  readonly symbol: 'USDC'
  readonly decimals: 6
  readonly nativeSymbol: string
  /** Maximum native network fee at the exact gas/fee caps sent to the wallet. */
  readonly maxGasCost: bigint
}

export type HcaFundingApprovalRecoveryPrompt = Omit<
  HcaFundingApprovalPrompt,
  'kind'
> & {
  readonly kind: 'approval-recovery'
  readonly reservedAmount: bigint
}

export type HcaFundingApprovalState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'approval'; readonly prompt: HcaFundingApprovalPrompt }
  | {
      readonly kind: 'approval-recovery'
      readonly prompt: HcaFundingApprovalRecoveryPrompt
    }
  | {
      readonly kind: 'approval-wallet'
      readonly prompt: HcaFundingApprovalPrompt
    }
  | {
      readonly kind: 'approval-receipt'
      readonly prompt: HcaFundingApprovalPrompt
      readonly hash: Hash
    }

export interface HcaFundingApprovalCapability {
  readonly confirmApproval: (
    prompt: HcaFundingApprovalPrompt,
  ) => Promise<boolean> | boolean
  /** Explicit attestation that earlier requests were rejected and sent transactions settled. */
  readonly confirmApprovalRecovery?: (
    prompt: HcaFundingApprovalRecoveryPrompt,
  ) => Promise<boolean> | boolean
  readonly onState?: (state: HcaFundingApprovalState) => void
}

const hashSchema = v.custom<Hash>(
  (value) => typeof value === 'string' && /^0x[\da-f]{64}$/i.test(value),
)
const pendingSchema = v.variant('kind', [
  v.object({
    kind: v.literal('preparing'),
    amount: v.pipe(v.string(), v.regex(/^\d+$/)),
  }),
  v.object({
    // Legacy reservations also mean a wallet send may have started.
    kind: v.literal('reserved'),
    amount: v.pipe(v.string(), v.regex(/^\d+$/)),
  }),
  v.object({
    kind: v.literal('submitted'),
    amount: v.pipe(v.string(), v.regex(/^\d+$/)),
    hash: hashSchema,
  }),
])
type PendingApproval = v.InferOutput<typeof pendingSchema>

type ApprovalRecovery =
  | { readonly kind: 'ready' }
  | { readonly kind: 'approve' }
  | { readonly kind: 'blocked'; readonly reservedAmount: bigint }
  | { readonly kind: 'wait'; readonly hash: Hash; readonly amount: bigint }

/** Both possible allowance values must cover the pull; keep uncertain reservations durable. */
export const getHcaApprovalRecovery = (
  pending: PendingApproval | null,
  allowance: bigint,
  required: bigint,
): ApprovalRecovery => {
  if (pending?.kind === 'reserved') {
    const reservedAmount = BigInt(pending.amount)
    return allowance >= required && reservedAmount >= required
      ? { kind: 'ready' }
      : { kind: 'blocked', reservedAmount }
  }
  if (pending?.kind === 'submitted')
    return { kind: 'wait', hash: pending.hash, amount: BigInt(pending.amount) }
  return { kind: allowance >= required ? 'ready' : 'approve' }
}

export const validateHcaFundingBounds = (
  required: bigint,
  consented: bigint,
): Result<bigint, HcaFundingApprovalError> =>
  required <= consented
    ? ok(required)
    : err(
        new HcaFundingApprovalError({
          cause:
            'The required funding increased. Review a fresh renewal quote before continuing.',
        }),
      )

export interface HcaApprovalEnvironment {
  readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  readonly locks: Pick<LockManager, 'request'>
}

const approvalKey = (
  prompt: Pick<
    HcaFundingApprovalPrompt,
    'chainId' | 'owner' | 'token' | 'spender'
  >,
) =>
  `ens-hca-funding-approval:${prompt.chainId}:${prompt.owner.toLowerCase()}:${prompt.token.toLowerCase()}:${prompt.spender.toLowerCase()}`
const approvalError = (cause: unknown) => new HcaFundingApprovalError({ cause })
const boundary = <T>(promise: Promise<T>) =>
  ResultAsync.fromPromise(promise, approvalError)

/** This checks the live provider; walletClient.account can be stale after a switch. */
export const assertHcaFundingWallet = ResultFn(async function* (input: {
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly owner: Address
  readonly chainId: number
  readonly signal?: AbortSignal
}) {
  if (input.signal?.aborted)
    return err(
      approvalError(
        'The renewal screen was closed. Start a new attempt to continue.',
      ),
    )
  const [addresses, chainId] = yield* boundary(
    Promise.all([
      input.walletClient.getAddresses(),
      input.walletClient.getChainId(),
    ]),
  )
  if (input.signal?.aborted) return err(approvalError(input.signal.reason))
  return validateHcaFundingWallet({
    owner: input.owner,
    connectedAddress: addresses[0],
    chainId: input.chainId,
    walletChainId: chainId,
    publicChainId: input.publicClient.chain?.id,
  })
})

/** Strict durable reads: unreadable or malformed reservations never mean no write exists. */
const readPending = (storage: HcaApprovalEnvironment['storage'], key: string) =>
  fromSync(() => {
    const raw = storage.getItem(key)
    return raw === null ? null : v.parse(pendingSchema, JSON.parse(raw))
  }, approvalError)
const savePending = (
  storage: HcaApprovalEnvironment['storage'],
  key: string,
  pending: PendingApproval,
) =>
  fromSync(() => {
    const raw = JSON.stringify(pending)
    storage.setItem(key, raw)
    if (storage.getItem(key) !== raw)
      throw new Error('Could not persist the approval reservation.')
  }, approvalError)
const clearPending = (
  storage: HcaApprovalEnvironment['storage'],
  key: string,
) => fromSync(() => storage.removeItem(key), approvalError)

const DEFINITE_REFUSAL_CODES = new Set([
  4001, 4100, 4200, -32700, -32600, -32601, -32602, -32004,
])
const DEFINITE_REFUSAL_NAMES = new Set([
  'AccountNotFoundError',
  'AccountTypeNotSupportedError',
  'ChainMismatchError',
  'ChainNotFoundError',
  'ClientChainNotConfiguredError',
  'InvalidChainIdError',
  'InvalidAddressError',
  'InsufficientFundsError',
  'FeeCapTooHighError',
  'FeeCapTooLowError',
  'TipAboveFeeCapError',
  'IntrinsicGasTooHighError',
  'IntrinsicGasTooLowError',
  'TransactionTypeNotSupportedError',
  'ExecutionRevertedError',
])

/** Only structural definite refusals release a hashless reservation; transport uncertainty cannot. */
export const isDefiniteHcaApprovalRefusal = (error: unknown): boolean => {
  if (isTerminalWalletError(error)) return true
  const seen = new Set<unknown>()
  let cause = error
  while (cause && typeof cause === 'object' && !seen.has(cause)) {
    seen.add(cause)
    if (
      'code' in cause &&
      typeof cause.code === 'number' &&
      DEFINITE_REFUSAL_CODES.has(cause.code)
    )
      return true
    if (
      cause instanceof BaseError &&
      containsNodeError(cause) &&
      DEFINITE_REFUSAL_NAMES.has(getNodeError(cause, {}).name)
    )
      return true
    if (
      'name' in cause &&
      typeof cause.name === 'string' &&
      DEFINITE_REFUSAL_NAMES.has(cause.name)
    )
      return true
    cause = 'cause' in cause ? cause.cause : undefined
  }
  return false
}

export interface ApproveHcaFundingParams extends HcaFundingApprovalCapability {
  readonly publicClient: PublicClient
  readonly walletClient: WalletClient
  readonly chainId: number
  readonly owner: Address
  readonly token: Address
  readonly spender: Address
  readonly amount: bigint
  readonly signal?: AbortSignal
  readonly existingOnly?: boolean
  readonly environment?: HcaApprovalEnvironment
}

/** No retry or transport method fallback: one raw wallet request, with its reservation saved first. */
const runApproval = ResultFn(async function* (
  input: ApproveHcaFundingParams,
  environment: HcaApprovalEnvironment,
) {
  const {
    publicClient,
    walletClient,
    owner,
    token,
    spender,
    amount,
    chainId,
    signal,
  } = input
  const key = approvalKey(input)
  const pending = yield* readPending(environment.storage, key)
  // The exclusive Web Lock proves the previous pre-wallet owner can no longer send.
  if (pending?.kind === 'preparing')
    yield* clearPending(environment.storage, key)
  if (input.existingOnly && (!pending || pending.kind === 'preparing'))
    return ok({ kind: 'none' as const })
  yield* assertHcaFundingWallet({ ...input, owner })
  const allowance = yield* boundary(
    publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [owner, spender],
    }),
  )
  const recovery = getHcaApprovalRecovery(pending, allowance, amount)
  if (recovery.kind === 'blocked') {
    const restored = yield* requestApprovalRecovery(
      input,
      environment,
      key,
      recovery.reservedAmount,
    )
    return ok(restored)
  }
  if (recovery.kind === 'ready')
    return pending?.kind === 'reserved'
      ? ok({ kind: 'covered' as const, maxAmount: BigInt(pending.amount) })
      : ok({ kind: 'none' as const })
  const prepared = yield* recovery.kind === 'wait'
    ? ok({
        hash: recovery.hash,
        prompt: approvalPrompt({ ...input, amount: recovery.amount }, 0n),
      })
    : prepareApproval(input, environment, key)
  const { hash, prompt } = prepared
  input.onState?.({ kind: 'approval-receipt', prompt, hash })
  // Keep tracking after detach. A late hash and an uncertain receipt stay durable.
  const replacements = new Map<Hash, Result<void, HcaFundingApprovalError>>()
  const receipt = yield* boundary(
    publicClient.waitForTransactionReceipt({
      hash,
      onReplaced: ({ transaction }) => {
        const saved = savePending(environment.storage, key, {
          kind: 'submitted',
          amount: prompt.amount.toString(),
          hash: transaction.hash,
        })
        replacements.set(transaction.hash, saved)
        input.onState?.({
          kind: 'approval-receipt',
          prompt,
          hash: transaction.hash,
        })
      },
    }),
  )
  yield* Result.combine([...replacements.values()])
  yield* clearPending(environment.storage, key)
  if (receipt.status !== 'success')
    return err(
      approvalError(
        'The USDC approval reverted. The renewal was not submitted.',
      ),
    )
  yield* assertHcaFundingWallet({
    walletClient,
    publicClient,
    owner,
    chainId,
    ...(signal ? { signal } : {}),
  })
  if (input.existingOnly) return ok({ kind: 'settled' as const })
  const settledAllowance = yield* boundary(
    publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [owner, spender],
    }),
  )
  return settledAllowance >= amount
    ? ok({ kind: 'settled' as const })
    : err(
        approvalError(
          'The settled USDC allowance does not cover this renewal. Review a fresh attempt.',
        ),
      )
})

const approvalPrompt = (
  input: ApproveHcaFundingParams,
  maxGasCost: bigint,
): HcaFundingApprovalPrompt => ({
  kind: 'approval',
  chainId: input.chainId,
  owner: input.owner,
  token: input.token,
  spender: input.spender,
  amount: input.amount,
  symbol: 'USDC',
  decimals: 6,
  nativeSymbol: input.publicClient.chain?.nativeCurrency.symbol ?? 'ETH',
  maxGasCost,
})

/** The lock stays held through consent. Clearing is a user-attested reset, not cancellation proof. */
const requestApprovalRecovery = ResultFn(async function* (
  input: ApproveHcaFundingParams,
  environment: HcaApprovalEnvironment,
  key: string,
  reservedAmount: bigint,
) {
  if (!input.confirmApprovalRecovery)
    return err(
      approvalError(
        'An earlier approval may still be waiting in the wallet. Resolve it before trying again.',
      ),
    )
  const prompt: HcaFundingApprovalRecoveryPrompt = {
    ...approvalPrompt(input, 0n),
    kind: 'approval-recovery',
    reservedAmount,
  }
  input.onState?.({ kind: 'approval-recovery', prompt })
  if (input.signal?.aborted) return err(approvalError(input.signal.reason))
  const confirmed = yield* boundary(
    Promise.resolve(input.confirmApprovalRecovery(prompt)),
  )
  if (input.signal?.aborted) return err(approvalError(input.signal.reason))
  if (!confirmed)
    return err(
      approvalError(
        'The earlier approval was not cleared. Your renewal was not submitted.',
      ),
    )
  const allowance = yield* boundary(
    input.publicClient.readContract({
      address: input.token,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [input.owner, input.spender],
    }),
  )
  // Identity and cancellation are checked after the last RPC, before touching storage.
  yield* assertHcaFundingWallet(input)
  // This synchronous storage boundary has no suspension between the final abort check and clear.
  return readPending(environment.storage, key).andThen((pending) => {
    if (input.signal?.aborted) return err(approvalError(input.signal.reason))
    if (
      pending?.kind !== 'reserved' ||
      BigInt(pending.amount) !== reservedAmount
    )
      return err(
        approvalError(
          'The saved approval changed. Start a new attempt to review it.',
        ),
      )
    if (
      getHcaApprovalRecovery(pending, allowance, input.amount).kind === 'ready'
    )
      return ok({ kind: 'covered' as const, maxAmount: reservedAmount })
    return clearPending(environment.storage, key)
      .andThen(() => readPending(environment.storage, key))
      .andThen((remaining) => {
        if (remaining)
          return err(
            approvalError(
              'Could not clear the earlier approval. Your renewal was not submitted.',
            ),
          )
        // A cleared preflight returns for a fresh quote; it never silently opens the wallet.
        return input.existingOnly
          ? ok({ kind: 'settled' as const })
          : err(
              approvalError(
                'The earlier approval was cleared. Start a new attempt to review funding.',
              ),
            )
      })
  })
})

const prepareApproval = ResultFn(async function* (
  input: ApproveHcaFundingParams,
  environment: HcaApprovalEnvironment,
  key: string,
) {
  const gas = yield* boundary(
    input.publicClient.estimateContractGas({
      address: input.token,
      abi: erc20Abi,
      functionName: 'approve',
      args: [input.spender, input.amount],
      account: input.owner,
    }),
  )
  const fees = yield* boundary(input.publicClient.estimateFeesPerGas())
  const prompt = approvalPrompt(input, gas * fees.maxFeePerGas)
  const hash = yield* requestApproval(
    input,
    environment,
    key,
    prompt,
    gas,
    fees.maxFeePerGas,
    fees.maxPriorityFeePerGas,
  )
  return ok({ hash, prompt })
})

const requestApproval = ResultFn(async function* (
  input: ApproveHcaFundingParams,
  environment: HcaApprovalEnvironment,
  key: string,
  prompt: HcaFundingApprovalPrompt,
  gas: bigint,
  maxFeePerGas: bigint,
  maxPriorityFeePerGas: bigint,
) {
  input.onState?.({ kind: 'approval', prompt })
  if (input.signal?.aborted) return err(approvalError(input.signal.reason))
  const consent = yield* boundary(
    Promise.resolve(input.confirmApproval(prompt)),
  )
  if (input.signal?.aborted) return err(approvalError(input.signal.reason))
  if (!consent) return err(new HcaFundingApprovalDeclinedError())
  yield* assertHcaFundingWallet(input)
  // An approval from another operation may have landed during the consent prompt.
  const allowance = yield* boundary(
    input.publicClient.readContract({
      address: input.token,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [input.owner, input.spender],
    }),
  )
  if (allowance >= input.amount)
    return err(
      approvalError(
        'The allowance changed during approval. Start a new attempt to use it.',
      ),
    )
  yield* boundary(
    input.publicClient.simulateContract({
      address: input.token,
      abi: erc20Abi,
      functionName: 'approve',
      args: [input.spender, input.amount],
      account: input.owner,
    }),
  )
  yield* assertHcaFundingWallet(input)
  const response = await submitReservedApproval({
    input,
    environment,
    key,
    prompt,
    gas,
    maxFeePerGas,
    maxPriorityFeePerGas,
  })
  if (response.isErr()) {
    if (isDefiniteHcaApprovalRefusal(response.error.cause))
      yield* clearPending(environment.storage, key)
    return err(response.error)
  }
  const hash = yield* fromSync(
    () => v.parse(hashSchema, response.value),
    approvalError,
  )
  yield* savePending(environment.storage, key, {
    kind: 'submitted',
    amount: input.amount.toString(),
    hash,
  })
  return ok(hash)
})

/** No await/yield may separate the final cancellation check, reservation and wallet invocation. */
const submitReservedApproval = ({
  input,
  environment,
  key,
  prompt,
  gas,
  maxFeePerGas,
  maxPriorityFeePerGas,
}: {
  readonly input: ApproveHcaFundingParams
  readonly environment: HcaApprovalEnvironment
  readonly key: string
  readonly prompt: HcaFundingApprovalPrompt
  readonly gas: bigint
  readonly maxFeePerGas: bigint
  readonly maxPriorityFeePerGas: bigint
}): ResultAsync<Hash, HcaFundingApprovalError> => {
  if (input.signal?.aborted) return errAsync(approvalError(input.signal.reason))
  const preparing = savePending(environment.storage, key, {
    kind: 'preparing',
    amount: input.amount.toString(),
  })
  if (preparing.isErr()) return errAsync(preparing.error)
  input.onState?.({ kind: 'approval-wallet', prompt })
  if (input.signal?.aborted)
    return clearPending(environment.storage, key).asyncAndThen(() =>
      errAsync(approvalError(input.signal?.reason)),
    )
  // Persist uncertainty before calling the wallet; neither age nor allowance can release it.
  const reserved = savePending(environment.storage, key, {
    kind: 'reserved',
    amount: input.amount.toString(),
  })
  if (reserved.isErr()) return errAsync(reserved.error)
  return boundary(
    input.walletClient.request(
      {
        method: 'eth_sendTransaction',
        params: [
          {
            from: input.owner,
            to: input.token,
            chainId: numberToHex(input.chainId),
            value: '0x0',
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: 'approve',
              args: [input.spender, input.amount],
            }),
            gas: numberToHex(gas),
            maxFeePerGas: numberToHex(maxFeePerGas),
            maxPriorityFeePerGas: numberToHex(maxPriorityFeePerGas),
          },
        ],
      },
      { retryCount: 0 },
    ),
  )
}

/** Cross-document exclusion plus durable reservation survive actor/component cancellation. */
const executeHcaFundingApproval = (input: ApproveHcaFundingParams) =>
  fromSync(
    () =>
      input.environment ?? {
        storage: globalThis.localStorage,
        locks: globalThis.navigator?.locks,
      },
    approvalError,
  )
    .asyncAndThen((environment) => {
      if (!isCanonicalHcaUsdc(input.chainId, input.token))
        return errAsync(
          approvalError(
            'The approval fallback is only available for Ethereum USDC.',
          ),
        )
      if (!environment.storage || !environment.locks)
        return errAsync(
          approvalError(
            'Durable approval storage and browser locking are required.',
          ),
        )
      return boundary(
        environment.locks.request(
          approvalKey(input),
          { mode: 'exclusive', ifAvailable: true },
          async (lock) =>
            lock
              ? await runApproval(input, environment)
              : err(approvalError('A USDC approval is already in progress.')),
        ),
      ).andThen((result) => result)
    })
    .andTee(() => input.onState?.({ kind: 'idle' }))
    .mapErr((error) => {
      input.onState?.({ kind: 'idle' })
      return error
    })

type ApprovalOutcome = Awaited<ReturnType<typeof executeHcaFundingApproval>>

const approvalMachine = setup({
  types: {
    context: {} as {
      readonly input: ApproveHcaFundingParams
      readonly result: ApprovalOutcome
    },
    input: {} as ApproveHcaFundingParams,
    events: {} as {
      readonly type: 'progress'
      readonly state: HcaFundingApprovalState
    },
    output: {} as ApprovalOutcome,
  },
  actors: {
    execute: fromPromise(
      async ({ input }: { input: ApproveHcaFundingParams }) =>
        await executeHcaFundingApproval(input),
    ),
  },
  actions: {
    publish: ({ context, event }) => {
      if (!context.input.signal?.aborted) context.input.onState?.(event.state)
    },
  },
}).createMachine({
  context: ({ input }) => ({
    input,
    result: err(
      approvalError('The approval operation stopped without a result.'),
    ),
  }),
  initial: 'running',
  output: ({ context }) => context.result,
  states: {
    running: {
      invoke: {
        src: 'execute',
        input: ({ context, self }) => ({
          ...context.input,
          onState: (state) => self.send({ type: 'progress', state }),
        }),
        onDone: {
          target: 'finished',
          actions: assign({ result: ({ event }) => event.output }),
        },
        onError: {
          target: 'finished',
          actions: assign({
            result: ({ event }) => err(approvalError(event.error)),
          }),
        },
      },
      on: {
        progress: { actions: 'publish' },
      },
    },
    finished: { type: 'final' },
  },
})

/** Standalone actor lifetime survives component detach; the signal only cancels continuation. */
const runApprovalActor = (input: ApproveHcaFundingParams) => {
  const actor = createActor(approvalMachine, { input })
  actor.start()
  return ResultAsync.fromSafePromise(toPromise(actor)).andThen(
    (result) =>
      result ??
      err(approvalError('The approval operation stopped without a result.')),
  )
}

export const approveHcaFunding = (input: ApproveHcaFundingParams) =>
  runApprovalActor(input).map(() => undefined)

export const recoverHcaFundingApproval = (input: ApproveHcaFundingParams) =>
  runApprovalActor({ ...input, existingOnly: true })

/** Fresh balances may reduce the consented debit; they can never silently increase either leg. */
export const reconcileHcaFundingBalances = ResultFn(function* (input: {
  readonly requiredUsdc: bigint
  readonly quotedFeeUsdc: bigint
  readonly requiredToken: bigint
  readonly hcaUsdc: bigint
  readonly hcaToken: bigint
  readonly consentedUsdc: bigint
  readonly consentedToken: bigint
}) {
  const usdc = input.requiredUsdc + input.quotedFeeUsdc - input.hcaUsdc
  const token = input.requiredToken - input.hcaToken
  const usdcShortfall = yield* validateHcaFundingBounds(
    usdc > 0n ? usdc : 0n,
    input.consentedUsdc,
  )
  const tokenShortfall = yield* validateHcaFundingBounds(
    token > 0n ? token : 0n,
    input.consentedToken,
  )
  return ok({ usdcShortfall, tokenShortfall })
})

export const validateHcaFundingWallet = (input: {
  readonly owner: Address
  readonly connectedAddress: Address | undefined
  readonly chainId: number
  readonly walletChainId: number
  readonly publicChainId: number | undefined
}): Result<void, HcaFundingApprovalError> =>
  input.connectedAddress &&
  isAddressEqual(input.connectedAddress, input.owner) &&
  input.walletChainId === input.chainId &&
  input.publicChainId === input.chainId
    ? ok(undefined)
    : err(
        approvalError(
          'The connected wallet or network changed. Start a new renewal attempt.',
        ),
      )
