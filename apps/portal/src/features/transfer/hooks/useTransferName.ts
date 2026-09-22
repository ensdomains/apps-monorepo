import {
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultMutationOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { getWalletClient } from '@wagmi/core/actions'
import {
  err,
  errAsync,
  fromPromise,
  ok,
  okAsync,
  type ResultAsync,
} from 'neverthrow'
import { useRef, useState } from 'react'
import { match } from 'ts-pattern'
import { type Address, getAddress, isAddress, isAddressEqual } from 'viem'
import { useConfig, usePublicClient } from 'wagmi'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getPrimaryNameQueryOptions } from '@/features/profile/hooks/usePrimaryName'
import { getSubnamesQueryOptions } from '@/features/profile/hooks/useSubnames'
import { getEnsTokenId } from '@/features/profile/hooks/useTokenId'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import {
  type getIsPermissionedResolver,
  getIsPermissionedResolverQueryOptions,
} from '@/features/resolver/hooks/useIsPermissionedResolver'
import { useFlowAttempt } from '@/features/transaction-manager/hooks/useFlowAttempt'
import {
  estimateGasForCall,
  isRevertError,
} from '@/features/transaction-manager/hooks/useTransactionGasEstimate'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import type { Transaction } from '@/features/transaction-manager/types'
import { sepoliaWithEns } from '@/lib/wagmi'
import { getParentName, is2LD } from '@/utils/ens/tldHelpers'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'
import { getLabel } from '@/utils/token/getLabel'
import { isCanonicalName } from '@/utils/token/isNormalized'
import type { WalletClientWithAccount } from '@/utils/types'
import {
  type GetEthAddressError,
  getEthAddressQueryOptions,
} from '../queries/getEthAddress'
import {
  type GetOwnResolverError,
  getOwnResolverQueryOptions,
} from '../queries/getOwnResolver'
import type { TransferSubject, V1TransferActor } from '../types'
import {
  buildTransferPlan,
  isRecordAheadOfMove,
  STEP_LABELS,
  type TransferOptions,
  type TransferStepKind,
} from '../utils/buildTransferPlan'
import { buildTransferStepIntent } from '../utils/buildTransferStepIntent'
import { canStartStep } from '../utils/canStartStep'
import { transferStepId } from '../utils/transferStepId'
import {
  type GetV1NameStateError,
  getV1NameStateQueryOptions,
  type NameNotNormalizableError,
} from '../v1/getV1NameState'
import { getV1TransferGate, type V1TransferGate } from '../v1/rules'

export type StartTransferParams = {
  readonly recipient: Address
  readonly options: TransferOptions
}

type NameReads = StartTransferParams & {
  /** V2 only — the versioned ERC-1155 id. Null for V1 subjects. */
  readonly tokenId: bigint | null
  /** The name's own resolver, or null if it has none. */
  readonly resolverAddress: Address | null
}

type SavedParams = NameReads & {
  /**
   * Whether the name's own resolver is a V2 `PermissionedResolver`. Null when
   * it has none, or when the plan never writes to it.
   */
  readonly isPermissionedResolver: boolean | null
  /**
   * The ETH address record before the flow, so a repoint the move never
   * followed can be undone. Null when the plan doesn't repoint it.
   */
  readonly previousEthAddress: Address | null
}

/**
 * The ETH address was repointed at the recipient, but the name never moved —
 * the sender still owns a name that resolves to someone else.
 */
export type RecordAheadOfMove = {
  readonly recipient: Address
  /** What to restore. Null when there was nothing readable to restore to. */
  readonly previousEthAddress: Address | null
}

export type TransferControls = {
  readonly startTransfer: (params: StartTransferParams) => void
  readonly transactions: Transaction[]
  readonly isPreparing: boolean
  readonly prepError: Error | null
  /** Set only once the flow is over (modal closed) with the record stranded. */
  readonly recordAheadOfMove: RecordAheadOfMove | null
  readonly restoreEthAddress: () => void
}

const chainId = sepoliaWithEns.id

type ErrorOf<R> = R extends ResultAsync<unknown, infer E> ? E : never

type ResolverKindError = ErrorOf<ReturnType<typeof getIsPermissionedResolver>>

/** The V1 gate refused at submit time: the name changed under the open form. */
export class V1TransferRefusedError extends TaggedError(
  'V1TransferRefusedError',
)<{
  readonly reason:
    | Exclude<V1TransferGate['reason'], 'ok'>
    /** Still allowed, but in the other role — the form was built for this one. */
    | 'actor-changed'
}> {}

/**
 * The name isn't its own ENSIP-15 form, so the label every step hashes names a
 * different token than the form showed. The route refuses these before the form
 * is offered; this is the same gate at the point of signing, so no path into the
 * hook can substitute the canonical twin.
 */
export class NonCanonicalNameError extends TaggedError(
  'NonCanonicalNameError',
) {}

/** Simulating the move step failed, so no config step was sent. */
export class TransferPreflightError extends TaggedError(
  'TransferPreflightError',
)<{
  cause: unknown
}> {}

const describeRefusal = (reason: V1TransferRefusedError['reason']): string =>
  match(reason)
    .with(
      'grace',
      () =>
        'This name has entered its grace period, so the registrar refuses to move it. Renew it first.',
    )
    .with(
      'expired',
      () => 'This name has expired, so there is nothing left to transfer.',
    )
    .with(
      'cannot-transfer',
      () => 'This name’s CANNOT_TRANSFER fuse has been burned.',
    )
    .with(
      'ancestor-expired',
      () =>
        'The name above this one has expired, so whoever registers it next can take this subname back. Nothing was sent.',
    )
    .with(
      'ancestor-grace',
      () =>
        'The name above this one has entered its grace period, so the Name Wrapper refuses changes from the parent until it is renewed.',
    )
    .with(
      'parent-cannot-reassign',
      () => 'Your wallet can no longer reassign this subname from its parent.',
    )
    .with(
      'manager-only',
      'not-owner',
      () => 'Your wallet no longer owns this name.',
    )
    .with(
      'actor-changed',
      () =>
        'How this name is held changed since the page loaded. Refresh and try again.',
    )
    .exhaustive()

const recordPointsAt = (
  record: string | null | undefined,
  address: Address | undefined,
): boolean =>
  !!record && !!address && isAddress(record) && isAddressEqual(record, address)

/**
 * Runs a transfer plan through the transaction modal, one step per transaction.
 * Every step's calldata comes from `buildTransferStepIntent`, shared between the
 * modal's gas estimate and the submit so the two can't drift.
 */
export const useTransferName = ({
  name,
  account,
  subject,
  actor = 'owner',
}: {
  readonly name: string
  /** The connected wallet doing the sending. */
  readonly account: Address
  readonly subject: TransferSubject
  /** V1 only: the role the form was built for. Re-checked at submit. */
  readonly actor?: V1TransferActor
}): TransferControls => {
  const config = useConfig()
  const publicClient = usePublicClient()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { isOpen, closeModal, clearTransaction } = useTransactionModal()

  const [savedParams, setSavedParams] = useState<SavedParams | null>(null)
  // Names the attempt the modal is showing. Rebuilt every time the flow is
  // prepared, so an attempt abandoned partway can't hand its finished step
  // actors to the next one.
  const attempt = useFlowAttempt()
  // Which steps of the current flow actually landed. The steps are separate
  // transactions, so a move that fails after `set-eth-addr` confirmed leaves
  // the record ahead of the ownership — this is how that gets noticed.
  const [confirmedSteps, setConfirmedSteps] = useState<
    ReadonlySet<TransferStepKind>
  >(new Set())
  // `set-eth-addr` was broadcast but its receipt never came back (polling
  // timed out, or the wait otherwise gave up after the send). It may still
  // have landed, so the live record decides — see `isRecordRepointedOnChain`.
  const [isEthAddrUnsettled, setIsEthAddrUnsettled] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)

  // `startedSteps` makes each step's `onStart` idempotent — both the modal UI and
  // the previous step's auto-fired `onDone` route into it (see
  // ConfigureRegistryForm for the same pattern).
  const startedStepsRef = useRef<Set<string>>(new Set())

  const finishFlow = () => {
    closeModal()
    clearTransaction()
    setSavedParams(null)
    attempt.end()
    // The parent's subname table lists this name's owner, so it goes stale too.
    // Only relevant below the TLD — a 2LD's "parent" is `eth`, which has no
    // subname listing of its own in the app.
    const parentName = is2LD(name) ? null : getParentName(name)
    const invalidate = () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: getEnsOwnerQueryOptions({ name }).queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: getV1NameStateQueryOptions({ name }).queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: getPrimaryNameQueryOptions(account).queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: getEthAddressQueryOptions({ name }).queryKey,
        }),
        ...(parentName
          ? [
              queryClient.invalidateQueries({
                queryKey: getSubnamesQueryOptions({
                  name: parentName,
                  protocolVersion: subject.kind === 'v2' ? 'ENSv2' : 'ENSv1',
                }).queryKey,
              }),
            ]
          : []),
      ]).then(() => undefined)
    void invalidate()
    pollForIndexerSync({ invalidateQueries: invalidate })
    void navigate({ to: '/$name/ownership', params: { name } })
  }

  const finishRestore = () => {
    closeModal()
    clearTransaction()
    setIsRestoring(false)
    setSavedParams(null)
    setConfirmedSteps(new Set())
    setIsEthAddrUnsettled(false)
    attempt.end()
    void queryClient.invalidateQueries({
      queryKey: getEthAddressQueryOptions({ name }).queryKey,
    })
  }

  // The V1 read that gates the write. `staleTime: 0` bypasses the cache the
  // ownership page primed: a name that lapsed into grace after that read would
  // otherwise pass, and the config steps would land before `reclaim` reverts on
  // the registrar's `live(id)` — leaving the name not resolving and not moved.
  const readV1 = (params: StartTransferParams) =>
    fromPromise(
      queryClient.fetchQuery({
        ...getV1NameStateQueryOptions({ name }),
        staleTime: 0,
      }),
      (e) => e as GetV1NameStateError | NameNotNormalizableError,
    ).andThen((state) => {
      const refuse = (reason: V1TransferRefusedError['reason']) =>
        err(
          new V1TransferRefusedError({
            reason,
            message: describeRefusal(reason),
          }),
        )
      // No state means no registrant and no live wrapper owner: gone.
      if (!state) return refuse('expired')
      const gate = getV1TransferGate(state, account)
      if (gate.reason !== 'ok') return refuse(gate.reason)
      // The plan and the options the form offered were built for `actor`; a
      // wallet that has since become the parent instead of the holder (or the
      // reverse) needs a fresh form, not this plan under a different contract.
      if (gate.actor !== actor) return refuse('actor-changed')
      return ok<NameReads>({
        ...params,
        tokenId: null,
        resolverAddress: state.resolverAddress,
      })
    })

  const readV2 = (params: StartTransferParams, registryAddress: Address) =>
    fromPromise(
      queryClient.fetchQuery(
        getOwnResolverQueryOptions({
          label: getLabel(name),
          registryAddress,
        }),
      ),
      (e) => e as GetOwnResolverError,
    ).andThen((resolverAddress) =>
      getEnsTokenId({ label: getLabel(name), registryAddress }).map(
        (tokenId): NameReads => ({ ...params, tokenId, resolverAddress }),
      ),
    )

  // `set-eth-addr` writes through the name's own resolver, and the two kinds
  // take different setters: a V2 PermissionedResolver's `setAddress` takes the
  // DNS-encoded name, a legacy resolver's `setAddr` the node. Read which one it
  // is up front, so the step's intent can still be built synchronously.
  const readResolverKind = (
    reads: NameReads,
  ): ResultAsync<SavedParams, ResolverKindError | GetEthAddressError> => {
    const { resolverAddress } = reads
    const writesResolver = buildTransferPlan(
      reads.options,
      subject.kind,
      actor,
    ).includes('set-eth-addr')
    if (!resolverAddress || !writesResolver)
      return okAsync({
        ...reads,
        isPermissionedResolver: null,
        previousEthAddress: null,
      })
    return fromPromise(
      queryClient.fetchQuery(
        getIsPermissionedResolverQueryOptions({ resolverAddress }),
      ),
      (e) => e as ResolverKindError,
    ).andThen((isPermissionedResolver) =>
      // Fresh, not the form's cached read: this is what a failed move would
      // have to put back.
      fromPromise(
        queryClient.fetchQuery({
          ...getEthAddressQueryOptions({ name }),
          staleTime: 0,
        }),
        (e) => e as GetEthAddressError,
      ).map((record) => ({
        ...reads,
        isPermissionedResolver,
        previousEthAddress:
          record && isAddress(record) ? getAddress(record) : null,
      })),
    )
  }

  // Simulates the step that moves the name before anything is sent. The config
  // steps run first and can't be undone by the sender once the move has
  // failed, so a move that would revert — most likely a contract recipient
  // without the `onERC721Received` / `onERC1155Received` hook — has to be
  // caught here, not when it is reached. This is the same estimate the modal
  // runs per step (including its gas-cap fallback), pulled forward to before
  // the first one, so the two can't disagree about what would revert.
  const preflightMove = (params: SavedParams) =>
    fromPromise(
      (async () => {
        const walletClient = await getWalletClient(config, { account })
        if (!walletClient?.account || !publicClient)
          throw new Error('No connected wallet')
        const move = buildTransferPlan(params.options, subject.kind, actor).at(
          -1,
        )
        if (!move) throw new Error('Transfer plan has no move step')
        const { request } = buildTransferStepIntent(move, {
          ...params,
          name,
          subject,
          walletClient: walletClient as WalletClientWithAccount,
          chainId,
        })
        if (request.type !== 'eoa') throw new Error('Expected an EOA request')
        await estimateGasForCall(publicClient, request)
      })(),
      (cause) =>
        new TransferPreflightError({
          cause,
          message: isRevertError(cause)
            ? 'The transfer itself would fail, so nothing was sent. If the recipient is a contract, it may not be able to receive this name.'
            : 'Couldn’t check that the transfer would succeed. Try again.',
        }),
    ).map(() => params)

  // Named so the two branches' error unions collapse to one for the mutation.
  type PrepareError =
    | ErrorOf<ReturnType<typeof readV1>>
    | ErrorOf<ReturnType<typeof readV2>>
    | ErrorOf<ReturnType<typeof readResolverKind>>
    | NonCanonicalNameError
    | TransferPreflightError

  // Prepares the flow: re-reads the name's state (V1) or its own resolver and
  // token id (V2) up front, so a bad name fails before the modal opens and
  // every step's intent can be built synchronously for the gas estimate. Then
  // stores the plan and opens the modal. Loading and error state come straight
  // from the mutation.
  const prepareMutation = useMutation(
    resultMutationOptions({
      mutationFn: (
        params: StartTransferParams,
      ): ResultAsync<SavedParams, PrepareError> =>
        match({ canonical: isCanonicalName(name), subject })
          .with({ canonical: false }, () =>
            errAsync(
              new NonCanonicalNameError({
                message:
                  'This name isn’t written in its normalized form, so transferring it would move a different name. Nothing was sent.',
              }),
            ),
          )
          .with({ subject: { kind: 'v2' } }, ({ subject }) =>
            readV2(params, subject.registryAddress)
              .andThen(readResolverKind)
              .andThen(preflightMove),
          )
          // Every remaining kind is a V1 subject.
          .otherwise(() =>
            readV1(params).andThen(readResolverKind).andThen(preflightMove),
          ),
      onSuccess: (params) => {
        startedStepsRef.current = new Set()
        setConfirmedSteps(new Set())
        setIsEthAddrUnsettled(false)
        setIsRestoring(false)
        // A retry after a stranded attempt re-reads the record *we* repointed;
        // what to restore is still the value from before the first attempt.
        setSavedParams({
          ...params,
          previousEthAddress:
            recordAheadOfMove?.previousEthAddress ?? params.previousEthAddress,
        })
        // A fresh scope is what keeps an abandoned attempt's finished step
        // actors from satisfying this one; the manager is deliberately not
        // cleared, since that would also stop unrelated in-flight work.
        attempt.start(account)
      },
    }),
  )

  // A `set-eth-addr` that failed after it was sent may still have been mined.
  // Re-read the record rather than trust the cached pre-flow value.
  const flagIfEthAddrSent = (
    step: TransferStepKind,
    txId: string | undefined,
  ) => {
    if (step !== 'set-eth-addr' || !txId) return
    if (!transactionManager.getTransaction(txId)?.getSnapshot().context.hash)
      return
    setIsEthAddrUnsettled(true)
    void queryClient.invalidateQueries({
      queryKey: getEthAddressQueryOptions({ name }).queryKey,
    })
  }

  // Built fresh each render (like useRenewalTransactions) — the modal holds the
  // array in a ref for auto-advance, so referential stability isn't required.
  const buildTransactions = (): Transaction[] => {
    if (!savedParams) return []
    const steps: readonly TransferStepKind[] = isRestoring
      ? ['restore-eth-addr']
      : buildTransferPlan(savedParams.options, subject.kind, actor)
    const stepContext = { ...savedParams, name, subject }

    // Idempotent runner per step: `onStart` may be invoked twice (modal UI +
    // the prior step's auto-advance `onDone`). Errors clear the guard so the
    // step can be retried; the tx error surfaces via the modal's machine state.
    const runners = steps.map((step) => async () => {
      const id = transferStepId(name, step, attempt.scope)
      if (
        !canStartStep({
          startedSteps: startedStepsRef.current,
          id,
          hasActor: Boolean(transactionManager.getTransaction(id)),
        })
      )
        return
      startedStepsRef.current.add(id)
      let txId: string | undefined
      try {
        const walletClient = await getWalletClient(config, { account })
        if (!walletClient?.account || !publicClient)
          throw new Error('No connected wallet')
        txId = transactionManager.startTransaction(
          buildTransferStepIntent(step, {
            ...stepContext,
            walletClient: walletClient as WalletClientWithAccount,
            chainId,
          }),
          createEOASigner(walletClient),
          {
            id,
            description: `${STEP_LABELS[step]} - ${name}`,
            publicClient,
            timeout: 120_000,
          },
        )
        await waitForTransaction(txId)
        setConfirmedSteps((prev) => new Set(prev).add(step))
      } catch (err) {
        // Tx reverts surface via the modal's machine state. Non-tx failures
        // (e.g. the wallet resolving without a connected account, or the step's
        // actor being stopped) aren't tracked there, so log them rather than
        // swallow silently. Clearing the guard allows a retry from the modal.
        // Deliberately not a `finally`: a step that succeeded must stay
        // guarded, or a stray `onStart` would send it a second time.
        console.error(`Transfer step "${step}" failed:`, err)
        startedStepsRef.current.delete(id)
        flagIfEthAddrSent(step, txId)
      }
    })

    return steps.map((step, i) => ({
      id: transferStepId(name, step, attempt.scope),
      title: STEP_LABELS[step],
      transactionName: `${STEP_LABELS[step]} - ${name}`,
      // Same builder as the submit path, so the modal's live gas estimate is
      // for exactly the call that will be sent.
      intent: {
        prepare: (ctx) =>
          buildTransferStepIntent(step, { ...stepContext, ...ctx }),
      },
      onStart: runners[i],
      onDone:
        i < runners.length - 1
          ? runners[i + 1]
          : isRestoring
            ? finishRestore
            : finishFlow,
    }))
  }

  const recipient = savedParams?.recipient
  const liveEthAddressQuery = useQuery({
    ...getEthAddressQueryOptions({ name }),
    enabled: isEthAddrUnsettled && !!recipient,
    refetchInterval: (query) =>
      recordPointsAt(query.state.data, recipient) ? false : 15_000,
  })
  const isRecordRepointedOnChain =
    isEthAddrUnsettled &&
    recordPointsAt(liveEthAddressQuery.data, recipient) &&
    !recordPointsAt(savedParams?.previousEthAddress, recipient)

  // Only once the modal is closed: mid-flow, the gap between the record landing
  // and the move landing is expected, not a stranded state. A restore dismissed
  // before it landed leaves the record stranded, so it shows again.
  const recordAheadOfMove: RecordAheadOfMove | null =
    savedParams &&
    !isOpen &&
    isRecordAheadOfMove(
      buildTransferPlan(savedParams.options, subject.kind, actor),
      confirmedSteps,
      isRecordRepointedOnChain,
    )
      ? {
          recipient: savedParams.recipient,
          previousEthAddress: savedParams.previousEthAddress,
        }
      : null

  const restoreEthAddress = () => {
    if (!recordAheadOfMove?.previousEthAddress) return
    startedStepsRef.current = new Set()
    clearTransaction()
    setIsRestoring(true)
    attempt.start(account)
  }

  return {
    startTransfer: prepareMutation.mutate,
    transactions: buildTransactions(),
    isPreparing: prepareMutation.isPending,
    prepError: prepareMutation.error,
    recordAheadOfMove,
    restoreEthAddress,
  }
}
