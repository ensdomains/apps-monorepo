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
import { getResolvedAddressQueryOptions } from '@/features/address/queries/getResolvedAddress'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getPrimaryNameQueryOptions } from '@/features/profile/hooks/usePrimaryName'
import { getSubnamesQueryKey } from '@/features/profile/hooks/useSubnames'
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
import {
  getV1Holder,
  getV1TransferGate,
  type V1TransferGate,
} from '../v1/rules'

export type StartTransferParams = {
  /** The raw name-or-address the user typed; re-resolved at submission. */
  readonly recipientInput: string
  /** The address the form showed for `recipientInput`. */
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
  /**
   * Call when the recipient or an option changes: a plan already prepared is
   * dropped and one still in flight never opens its modal, so the calldata
   * can't be built from a recipient the form no longer shows.
   */
  readonly discardPreparation: () => void
  readonly transactions: Transaction[]
  readonly isPreparing: boolean
  readonly prepError: Error | null
  /** Set only once the flow is over (modal closed) with the record stranded. */
  readonly recordAheadOfMove: RecordAheadOfMove | null
  readonly restoreEthAddress: () => void
}

const chainId = sepoliaWithEns.id

// Whether a step's calldata carries the recipient, so the modal shows it. A
// `Record`, not a set of the true ones: a new step kind then fails to compile
// until it is classified rather than defaulting to "no recipient".
const CARRIES_RECIPIENT: Record<TransferStepKind, boolean> = {
  'set-eth-addr': true,
  'detach-resolver': false,
  'detach-registry': false,
  'transfer-token': true,
  reclaim: true,
  'transfer-erc721': true,
  'transfer-erc1155': true,
  'set-registry-owner': true,
  'set-subnode-owner': true,
  'restore-eth-addr': false,
}

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

/** The recipient name no longer resolves to the address the form showed. */
export class RecipientChangedError extends TaggedError(
  'RecipientChangedError',
)<{
  readonly shown: Address
  readonly resolved: Address | null
}> {}

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
  // Steps that were broadcast but whose receipt never came back (polling timed
  // out, or the wait otherwise gave up after the send). They may still have
  // landed, so the chain decides — see `isRecordRepointedOnChain` and
  // `mayHaveMoved`.
  const [unsettledSteps, setUnsettledSteps] = useState<
    ReadonlySet<TransferStepKind>
  >(new Set())
  const [isRestoring, setIsRestoring] = useState(false)

  // Makes each step's `onStart` idempotent — both the modal UI and the prior
  // step's auto-fired `onDone` route into it (as in ConfigureRegistryForm).
  const startedStepsRef = useRef<Set<string>>(new Set())

  // One run per `startTransfer`. The form can move while a run's reads are in
  // flight, so a stale run must not open the modal (Immunefi #91822).
  const runIdRef = useRef(0)

  const finishFlow = () => {
    closeModal()
    clearTransaction()
    setSavedParams(null)
    attempt.end()
    // The parent's subname table lists this name's owner, so it goes stale
    // too. Not for a 2LD: its parent is `eth`, which has no listing here.
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
                queryKey: getSubnamesQueryKey({
                  name: parentName,
                  protocolVersion: subject.kind === 'v2' ? 'ENSv2' : 'ENSv1',
                }),
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
    setUnsettledSteps(new Set())
    attempt.end()
    void queryClient.invalidateQueries({
      queryKey: getEthAddressQueryOptions({ name }).queryKey,
    })
  }

  // The V1 read that gates the write. `staleTime: 0` bypasses the cache the
  // ownership page primed: a name that lapsed into grace since would pass, and
  // the config steps would land before `reclaim` reverts on `live(id)`.
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

  // The form's recipient comes from an hour-fresh query, and the name's addr
  // record can change under it — so re-resolve past the cache and refuse
  // unless it still points at the address the user confirmed.
  const freshenRecipient = (params: StartTransferParams) =>
    isAddress(params.recipientInput, { strict: false })
      ? okAsync<StartTransferParams, RecipientChangedError>(params)
      : fromPromise(
          queryClient.fetchQuery({
            ...getResolvedAddressQueryOptions({
              nameOrAddress: params.recipientInput,
            }),
            staleTime: 0,
          }),
          (cause) =>
            new RecipientChangedError({
              shown: params.recipient,
              resolved: null,
              message: 'Couldn’t re-check the recipient’s address. Try again.',
              cause,
            }),
        ).andThen((resolved) =>
          resolved && isAddressEqual(resolved, params.recipient)
            ? ok(params)
            : err(
                new RecipientChangedError({
                  shown: params.recipient,
                  resolved,
                  message:
                    'The recipient’s address has changed since it was resolved. Check it and try again.',
                }),
              ),
        )

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

  // Simulates the move before anything is sent: the config steps run first
  // and the sender can't undo them once the move fails (most likely a contract
  // recipient with no `onERC721Received` / `onERC1155Received`). Same estimate
  // the modal runs per step, so the two can't disagree about what reverts.
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
    | RecipientChangedError
    | ErrorOf<ReturnType<typeof readV1>>
    | ErrorOf<ReturnType<typeof readV2>>
    | ErrorOf<ReturnType<typeof readResolverKind>>
    | NonCanonicalNameError
    | TransferPreflightError

  // Re-reads the name's state (V1) or its resolver and token id (V2) up front,
  // so a bad name fails before the modal opens and every step's intent can be
  // built synchronously for the gas estimate.
  const prepareMutation = useMutation(
    resultMutationOptions({
      mutationFn: (
        params: StartTransferParams,
      ): ResultAsync<
        { readonly saved: SavedParams; readonly runId: number },
        PrepareError
      > => {
        runIdRef.current += 1
        const runId = runIdRef.current
        const prepared: ResultAsync<SavedParams, PrepareError> = match({
          canonical: isCanonicalName(name),
          subject,
        })
          .with({ canonical: false }, () =>
            errAsync(
              new NonCanonicalNameError({
                message:
                  'This name isn’t written in its normalized form, so transferring it would move a different name. Nothing was sent.',
              }),
            ),
          )
          .with({ subject: { kind: 'v2' } }, ({ subject }) =>
            freshenRecipient(params).andThen((fresh) =>
              readV2(fresh, subject.registryAddress)
                .andThen(readResolverKind)
                .andThen(preflightMove),
            ),
          )
          // Every remaining kind is a V1 subject.
          .otherwise(() =>
            freshenRecipient(params).andThen((fresh) =>
              readV1(fresh).andThen(readResolverKind).andThen(preflightMove),
            ),
          )
        return prepared.map((saved) => ({ saved, runId }))
      },
      onSuccess: ({ saved, runId }) => {
        // Superseded by a newer start or an edit, so the form's values aren't
        // the ones this plan was built from: it never reaches the modal.
        if (runId !== runIdRef.current) return
        startedStepsRef.current = new Set()
        setConfirmedSteps(new Set())
        setUnsettledSteps(new Set())
        setIsRestoring(false)
        // A retry after a stranded attempt re-reads the record *we* repointed;
        // what to restore is still the value from before the first attempt.
        setSavedParams({
          ...saved,
          previousEthAddress:
            recordAheadOfMove?.previousEthAddress ?? saved.previousEthAddress,
        })
        // A fresh scope is what keeps an abandoned attempt's finished step
        // actors from satisfying this one; the manager is deliberately not
        // cleared, since that would also stop unrelated in-flight work.
        attempt.start(account)
      },
    }),
  )

  const discardPreparation = () => {
    runIdRef.current += 1
    setSavedParams(null)
    // Otherwise a failure message for the old values sits under the form until
    // the next start. Any in-flight run is dropped by the run id check above.
    prepareMutation.reset()
  }

  // A step that failed after it was sent may still have been mined. Re-read
  // what it writes rather than trust the cached pre-flow values.
  const flagIfSent = (step: TransferStepKind, txId: string | undefined) => {
    if (!txId) return
    if (!transactionManager.getTransaction(txId)?.getSnapshot().context.hash)
      return
    setUnsettledSteps((prev) => new Set(prev).add(step))
    void Promise.all([
      queryClient.invalidateQueries({
        queryKey: getEthAddressQueryOptions({ name }).queryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: getEnsOwnerQueryOptions({ name }).queryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: getV1NameStateQueryOptions({ name }).queryKey,
      }),
    ])
  }

  // Built fresh each render (like useRenewalTransactions): the modal holds the
  // array in a ref for auto-advance, so referential stability isn't needed.
  const buildTransactions = (): Transaction[] => {
    if (!savedParams) return []
    const steps: readonly TransferStepKind[] = isRestoring
      ? ['restore-eth-addr']
      : buildTransferPlan(savedParams.options, subject.kind, actor)
    const stepContext = { ...savedParams, name, subject }

    // Idempotent per step: `onStart` may fire twice (modal UI + the prior
    // step's auto-advance `onDone`). Errors clear the guard to allow a retry.
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
        // Tx reverts surface via the modal's machine state; non-tx failures
        // (e.g. a wallet with no connected account, or the step's actor being
        // stopped) don't, so log those. Deliberately not a `finally`: a step
        // that succeeded must stay guarded, or a stray `onStart` would send it
        // a second time.
        console.error(`Transfer step "${step}" failed:`, err)
        startedStepsRef.current.delete(id)
        flagIfSent(step, txId)
      }
    })

    return steps.map((step, i) => ({
      id: transferStepId(name, step, attempt.scope),
      title: STEP_LABELS[step],
      transactionName: `${STEP_LABELS[step]} - ${name}`,
      // From the same params the calldata is built from, not the form behind
      // the modal, so what the user confirms is what gets sent.
      details: CARRIES_RECIPIENT[step]
        ? [{ label: 'To', value: savedParams.recipient }]
        : undefined,
      // Same builder as the submit path, so the gas estimate is for exactly
      // the call that gets sent.
      intent: {
        prepare: (ctx) =>
          buildTransferStepIntent(step, { ...stepContext, ...ctx }),
      },
      onStart: runners[i],
      onDone: match({ hasNext: i < runners.length - 1, isRestoring })
        .with({ hasNext: true }, () => runners[i + 1])
        .with({ isRestoring: true }, () => finishRestore)
        .otherwise(() => finishFlow),
    }))
  }

  const recipient = savedParams?.recipient
  const plan = savedParams
    ? buildTransferPlan(savedParams.options, subject.kind, actor)
    : []
  const move = plan.at(-1)

  const isEthAddrUnsettled = unsettledSteps.has('set-eth-addr')
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

  // Who holds the name now, read the way each protocol version defines it:
  // the V2 token owner, or the V1 holder (registrant for an unwrapped 2LD).
  const isMoveUnsettled = !!move && unsettledSteps.has(move)
  const keepPollingUntil = (holder: Address | null | undefined) =>
    recordPointsAt(holder, recipient) ? false : 15_000
  const liveV2OwnerQuery = useQuery({
    ...getEnsOwnerQueryOptions({ name }),
    enabled: isMoveUnsettled && subject.kind === 'v2',
    refetchInterval: (query) => keepPollingUntil(query.state.data?.owner),
  })
  const liveV1StateQuery = useQuery({
    ...getV1NameStateQueryOptions({ name }),
    enabled: isMoveUnsettled && subject.kind !== 'v2',
    refetchInterval: (query) => {
      const live = query.state.data?.subject
      return keepPollingUntil(live ? getV1Holder(live) : null)
    },
  })
  const liveHolder = match(subject.kind)
    .with('v2', () => ({
      isSuccess: liveV2OwnerQuery.isSuccess,
      holder: liveV2OwnerQuery.data?.owner ?? null,
    }))
    .otherwise(() => {
      const live = liveV1StateQuery.data?.subject
      return {
        isSuccess: liveV1StateQuery.isSuccess,
        holder: live ? getV1Holder(live) : null,
      }
    })
  // Unknown until the read lands: better no alert than a restore the sender
  // may no longer be able to authorize.
  const mayHaveMoved =
    isMoveUnsettled &&
    (!liveHolder.isSuccess || recordPointsAt(liveHolder.holder, recipient))

  // Only once the modal is closed: mid-flow, the gap between the record landing
  // and the move landing is expected, not a stranded state. A restore dismissed
  // before it landed leaves the record stranded, so it shows again.
  const recordAheadOfMove: RecordAheadOfMove | null =
    savedParams &&
    !isOpen &&
    isRecordAheadOfMove(plan, confirmedSteps, {
      isRecordRepointedOnChain,
      mayHaveMoved,
    })
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
    discardPreparation,
    transactions: buildTransactions(),
    isPreparing: prepareMutation.isPending,
    prepError: prepareMutation.error,
    recordAheadOfMove,
    restoreEthAddress,
  }
}
