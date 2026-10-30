import { fromSync, ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { err, errAsync, ok, Result, ResultAsync } from 'neverthrow'
import * as v from 'valibot'
import type { Address, Hash, PublicClient, WalletClient } from 'viem'
import { encodeFunctionData, erc20Abi, isAddressEqual, numberToHex } from 'viem'
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

export type HcaFundingApprovalState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'approval'; readonly prompt: HcaFundingApprovalPrompt }
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
  readonly onState?: (state: HcaFundingApprovalState) => void
}

const hashSchema = v.custom<Hash>(
  (value) => typeof value === 'string' && /^0x[\da-f]{64}$/i.test(value),
)
const pendingSchema = v.variant('kind', [
  v.object({
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
  | { readonly kind: 'blocked' }
  | { readonly kind: 'wait'; readonly hash: Hash }

/** An outstanding set-allowance may still land even when today's allowance covers a new run. */
export const getHcaApprovalRecovery = (
  pending: PendingApproval | null,
  allowance: bigint,
  required: bigint,
): ApprovalRecovery => {
  if (pending?.kind === 'reserved') return { kind: 'blocked' }
  if (pending?.kind === 'submitted') return { kind: 'wait', hash: pending.hash }
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
  if (!pending && input.existingOnly) return ok({ kind: 'none' as const })
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
  if (recovery.kind === 'blocked')
    return err(
      approvalError(
        'An earlier approval may still be waiting in the wallet. Resolve it before trying again.',
      ),
    )
  if (recovery.kind === 'ready') return ok({ kind: 'none' as const })
  const prepared = yield* recovery.kind === 'wait'
    ? ok({ hash: recovery.hash, prompt: approvalPrompt(input, 0n) })
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
          amount: amount.toString(),
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
  const consent = yield* boundary(
    Promise.resolve(input.confirmApproval(prompt)),
  )
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
  yield* savePending(environment.storage, key, {
    kind: 'reserved',
    amount: input.amount.toString(),
  })
  input.onState?.({ kind: 'approval-wallet', prompt })
  const response = await boundary(
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
              : err(
                  approvalError(
                    'An approval is already running in another tab.',
                  ),
                ),
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
      initial: 'checking',
      states: { checking: {}, consent: {}, wallet: {}, receipt: {} },
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
        progress: [
          {
            guard: ({ event }) => event.state.kind === 'approval',
            target: '.consent',
            actions: 'publish',
          },
          {
            guard: ({ event }) => event.state.kind === 'approval-wallet',
            target: '.wallet',
            actions: 'publish',
          },
          {
            guard: ({ event }) => event.state.kind === 'approval-receipt',
            target: '.receipt',
            actions: 'publish',
          },
          { target: '.checking', actions: 'publish' },
        ],
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
