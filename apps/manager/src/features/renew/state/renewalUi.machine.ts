import type {
  HcaDisplayedDebit,
  HcaFundingApprovalCapability,
  HcaFundingPrompt,
  RhinestoneSigner,
  Signer,
} from '@ens-apps/transaction-manager'
import { HcaFundingApprovalDeclinedError } from '@ens-apps/transaction-manager/helpers/hca-funding-approval'
import { HcaFundingDeclinedError } from '@ens-apps/transaction-manager/helpers/hca-intent-funding'
import {
  pollTransactionStatusActor,
  readPaymentTokenAllowanceActor,
  submitApprovalActor,
  submitRenewActor,
} from '@ens-apps/transaction-manager/machines/registration/registration.actors'
import { getAnalyticsNameProperties } from '@ens-apps/utils/posthog/nameProperties'
import { $qk, qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromResultAsync } from '@ens-apps/utils/xstate/neverthrow'
import type { Address, WalletClient } from 'viem'
import { assign, fromPromise, setup } from 'xstate'
import { envConfig } from '@/config'
import { getExpiry } from '@/features/profile/service/profileExpiry'
import type {
  FundingSourceOrigin,
  PaymentAsset,
} from '@/features/register-v2/state/registrationUi.machine'
import { getDurationInSecondsFromYears } from '@/features/register-v2/utils/time'
import { getV1RenewableQueryOptions } from '@/features/renew/data/queries/v1Renewable.query'
import {
  type HcaRenewalL2Funding,
  submitHcaRenewal,
} from '@/features/renew/service/hcaRenewal'
import type { HcaRenewalEthFunding } from '@/features/renew/service/renewalEthSwap'
import {
  getRenewerAddress,
  type RenewalProtocol,
} from '@/features/renew/utils/renewalProtocol'
import {
  type AnalyticsFlow,
  bindAnalyticsFlow,
  createAnalyticsFlow,
  getAnalyticsExecutionMethod,
} from '@/lib/posthog/flow'
import type { RENEWAL_TOKEN } from '@/lib/tokens'
import { publicClient } from '@/lib/wagmi'
import { getQueryClient } from '@/utils/router/root-context'

// Two routes pay for a renewal. A smart-account signer renews as an
// owner-signed HCA intent: price
// (in the chosen stable) and fee (in USDC) come out of the account, funded in
// the same intent when short, or bridged in from an L2 first when the user
// pays from one. An EOA signer keeps the direct-wallet route:
// allowance check, approve and renew as plain wagmi transactions. `renew`
// charges `msg.sender`, so each route pays as itself.

type SubmissionData = {
  label: string
  duration: bigint
  readonly referrer?: `0x${string}`
  token: RENEWAL_TOKEN
  /** Price in token units */
  priceRaw: bigint

  /** Formatted base price */
  priceNumber: number

  /** What the payment screen showed the wallet would pay; absent when it showed the price alone. */
  readonly displayedDebit?: HcaDisplayedDebit

  /**
   * The account context's signer. `rhinestone` selects the intent route (the
   * HCA pays, the owner key signs); `eoa` keeps the direct-wallet route.
   */
  signer: Signer

  /**
   * EOA that funds the renewal from its wallet: it pays the price on the direct
   * route (`renew` charges `msg.sender`), and signs the intent plus any funding
   * permit on the HCA route.
   */
  ownerAddress: Address

  /**
   * Owner wallet client. Signs the HCA intent and the EIP-2612 funding permit;
   * unused on the direct route, where the signer is this wallet itself.
   */
  walletClient: WalletClient

  /** HCA route: bridge the account's shortfall in from an L2 instead. */
  l2Funding?: HcaRenewalL2Funding
  /** HCA route: swap the wallet's ETH for the USDC its permit moves. */
  readonly ethFunding?: HcaRenewalEthFunding
}

const requireSubmissionData = (
  submissionData: SubmissionData | undefined,
): SubmissionData => {
  if (!submissionData) throw new Error('Renewal submission data is required')
  return submissionData
}

/**
 * The current intent attempt's increased payment: waiting on the user, who
 * answers through `decide`, or accepted and being signed.
 */
type PaymentUpdateState =
  | {
      readonly status: 'reviewing'
      readonly prompt: HcaFundingPrompt
      readonly decide: (isAccepted: boolean) => void
    }
  | { readonly status: 'accepted'; readonly prompt: HcaFundingPrompt }

/** The receipt an intent attempt shows once its payment went up. */
export type RenewalPaymentUpdate = {
  readonly status: PaymentUpdateState['status']
  readonly prompt: HcaFundingPrompt
}

/** Resolves `false` once the signal aborts, so a waiting question is declined. */
const declineOnAbort = (signal: AbortSignal) =>
  new Promise<boolean>((resolve) => {
    if (signal.aborted) resolve(false)
    signal.addEventListener('abort', () => resolve(false), { once: true })
  })

const requireRhinestoneSigner = (signer: Signer): RhinestoneSigner => {
  if (signer.type !== 'rhinestone') {
    throw new Error('The HCA renewal route needs a smart-account signer')
  }
  return signer
}

const getAnalyticsProperties = (
  context: {
    readonly analytics: AnalyticsFlow
    readonly protocol: RenewalProtocol
    readonly submissionData?: SubmissionData
  },
  chainId: number,
) => ({
  ...getAnalyticsNameProperties(
    context.submissionData
      ? `${context.submissionData.label}.eth`
      : context.analytics.ens_name,
  ),
  flow_id: context.analytics.flow_id,
  protocol_version: context.protocol,
  chain_id: chainId,
  execution_method: getAnalyticsExecutionMethod(
    context.submissionData?.signer.type,
  ),
})

const completedAnalytics = new WeakSet<object>()

const captureRenewalComplete = (
  context: Parameters<typeof getAnalyticsProperties>[0],
) => {
  const scope = context.analytics.completionScope ?? context.analytics
  if (completedAnalytics.has(scope)) return
  completedAnalytics.add(scope)
  context.analytics.capture('renewal:flow_complete', {
    ...getAnalyticsProperties(context, envConfig.chain.id),
    item_count: 1,
  })
}

type RenewalReceiptInput = {
  readonly txId: string
  readonly completion: Parameters<typeof getAnalyticsProperties>[0]
}

const renewalReceipts = new WeakMap<
  SubmissionData,
  {
    readonly txId: string
    readonly status: ReturnType<typeof pollTransactionStatusActor>
  }
>()

const startRenewalReceiptObservation = (input: RenewalReceiptInput) => {
  const submission = requireSubmissionData(input.completion.submissionData)
  const status = pollTransactionStatusActor({ txId: input.txId })
  status.andTee(() => captureRenewalComplete(input.completion))
  renewalReceipts.set(submission, { txId: input.txId, status })
  return status
}

const getRenewalReceiptObservation = (input: RenewalReceiptInput) => {
  const submission = requireSubmissionData(input.completion.submissionData)
  const receipt = renewalReceipts.get(submission)
  return receipt?.txId === input.txId
    ? receipt.status
    : startRenewalReceiptObservation(input)
}

export const renewalUiMachine = setup({
  types: {
    context: {} as {
      readonly analytics: AnalyticsFlow
      currentExpiry: bigint
      protocol: RenewalProtocol
      renewerAddress: Address
      duration: bigint
      selectedToken: RENEWAL_TOKEN | undefined
      /** The L2 row picked to pay from; the renewal then pays in USDC. */
      fundingSourceChainId?: number
      /** A fallback pick gives way to the wallet once the wallet can pay again. */
      fundingSourceOrigin?: FundingSourceOrigin
      /** ETH is swapped into USDC, so it pays a USDC renewal. */
      paymentAsset: PaymentAsset
      lastErrorMessage?: string
      submissionData?: SubmissionData
      approvalTxId?: string
      renewalTxId?: string
      /**
       * Parks the HCA funding on the user's answer. Lives in context so the
       * invoked intent submit can reach the component that renders the prompt.
       */
      approvalFallback?: HcaFundingApprovalCapability
      /** The current attempt's increased payment, once it went up. */
      paymentUpdate?: PaymentUpdateState
    },
    input: {} as {
      readonly analyticsName?: string
      currentExpiry: bigint
      protocol: RenewalProtocol
      approvalFallback?: HcaFundingApprovalCapability
    },
    events: {} as
      | { type: 'pricing.step.next' }
      | { type: 'pricing.step.previous' }
      | { type: 'pricing.dialog.dismiss' }
      | { type: 'pricing.duration.set'; duration: bigint }
      | {
          type: 'pricing.token.select'
          token: RENEWAL_TOKEN | undefined
          /** Who picked it; a click when absent. */
          origin?: FundingSourceOrigin
        }
      | {
          type: 'pricing.fundingSource.select'
          chainId: number
          origin?: FundingSourceOrigin
        }
      | {
          type: 'pricing.paymentAsset.select'
          asset: PaymentAsset
          origin?: FundingSourceOrigin
        }
      | {
          type: 'renewal.start'
          label: string
          duration: bigint
          readonly referrer?: `0x${string}`
          token: RENEWAL_TOKEN
          /** Price in token units */
          priceRaw: bigint
          signer: Signer
          ownerAddress: Address
          walletClient: WalletClient

          /** Formatted base price */
          priceNumber: number
          readonly displayedDebit?: HcaDisplayedDebit
          /** HCA route: pay from the wallet's USDC on an L2. */
          l2Funding?: HcaRenewalL2Funding
          /** HCA route: pay with the wallet's ETH, swapped into USDC. */
          readonly ethFunding?: HcaRenewalEthFunding
        }
      | { type: 'renewal.submitted'; txId: string }
      | {
          type: 'renewal.payment.increased'
          readonly prompt: HcaFundingPrompt
          readonly decide: (isAccepted: boolean) => void
        }
      | { type: 'renewal.payment.accept' }
      | { type: 'retry' }
      | { type: 'cancel' }
      | { type: 'label.changed'; readonly analyticsName?: string },
    tags: '' as 'renewing',
  },
  actors: {
    readPaymentTokenAllowance: fromResultAsync(
      (input: Parameters<typeof readPaymentTokenAllowanceActor>[0]) =>
        readPaymentTokenAllowanceActor(input),
    ),
    submitTokenApproval: fromResultAsync(
      (input: Parameters<typeof submitApprovalActor>[0]) =>
        submitApprovalActor(input),
    ),
    submitRenewal: fromResultAsync(
      (
        input: Parameters<typeof submitRenewActor>[0] & {
          readonly completion: Parameters<typeof getAnalyticsProperties>[0]
        },
      ) => {
        const { completion, ...submission } = input
        return submitRenewActor(submission).andTee((txId) => {
          startRenewalReceiptObservation({ txId, completion })
        })
      },
    ),
    pollTransactionStatus: fromResultAsync(
      (input: {
        readonly txId: string
        readonly completion?: Parameters<typeof getAnalyticsProperties>[0]
      }) =>
        input.completion
          ? getRenewalReceiptObservation({
              txId: input.txId,
              completion: input.completion,
            })
          : pollTransactionStatusActor(input),
    ),
    // The intent route submits and WAITS for the fill here, so there is nothing
    // left to poll afterwards.
    submitHcaRenewalIntent: fromPromise(
      async ({
        input,
        signal,
      }: {
        input: Parameters<typeof submitHcaRenewal>[0] & {
          readonly completion: Parameters<typeof getAnalyticsProperties>[0]
        }
        signal: AbortSignal
      }) => {
        const { confirmIncreasedPayment, completion, ...submission } = input
        const result = await submitHcaRenewal({
          ...submission,
          signal,
          // An abandoned attempt never asks, and its open question is declined.
          ...(confirmIncreasedPayment
            ? {
                confirmIncreasedPayment: (prompt: HcaFundingPrompt) =>
                  signal.aborted
                    ? Promise.resolve(false)
                    : Promise.race([
                        confirmIncreasedPayment(prompt),
                        declineOnAbort(signal),
                      ]),
              }
            : {}),
        })
        captureRenewalComplete(completion)
        return result.txId
      },
    ),
    readExpiry: fromResultAsync(
      (input: { name: string; protocol: RenewalProtocol }) =>
        getExpiry(input.name, input.protocol),
    ),
  },
  guards: {
    // The registrar already has enough allowance from the paying EOA, so no
    // approval is needed — go straight to renew.
    hasSufficientAllowance: ({ context }, params: { allowance: bigint }) =>
      !!context.submissionData &&
      params.allowance >= context.submissionData.priceRaw,
    // Read off the EVENT, not context: guards are evaluated before the
    // transition's `startRenewal` assignment lands.
    startsHcaRenewal: ({ event }) =>
      event.type === 'renewal.start' && event.signer.type === 'rhinestone',
    // Same question for a retry, whose event carries no signer.
    isHcaRenewal: ({ context }) =>
      context.submissionData?.signer.type === 'rhinestone',
    alreadyRenewed: ({ context }, params: { expiry: bigint | null }) =>
      params.expiry !== null && params.expiry > context.currentExpiry,
  },
  actions: {
    resetAnalytics: assign({
      analytics: ({ context, event }) =>
        createAnalyticsFlow(
          undefined,
          event.type === 'label.changed'
            ? event.analyticsName
            : context.analytics.ens_name,
        ),
    }),
    analyticsStart: ({ context }) =>
      context.analytics.capture('renewal:flow_start', {
        ...getAnalyticsProperties(context, envConfig.chain.id),
      }),
    analyticsExecution: ({ context }) =>
      context.analytics.capture('renewal:stage_enter', {
        ...getAnalyticsProperties(context, envConfig.chain.id),
        stage: 'execution',
      }),
    analyticsApproval: ({ context }) =>
      context.analytics.capture('renewal:stage_enter', {
        ...getAnalyticsProperties(context, envConfig.chain.id),
        stage: 'approval',
      }),
    analyticsVerification: ({ context }) =>
      context.analytics.capture('renewal:stage_enter', {
        ...getAnalyticsProperties(context, envConfig.chain.id),
        stage: 'verification',
      }),
    analyticsPaymentSelect: ({ context, event }) => {
      if (
        !(
          event.type === 'pricing.token.select' ||
          event.type === 'pricing.fundingSource.select' ||
          event.type === 'pricing.paymentAsset.select'
        )
      )
        return
      if (event.origin === 'fallback') return
      context.analytics.capture('renewal:payment_option_select', {
        ...getAnalyticsProperties(context, envConfig.chain.id),
        payment_asset: context.paymentAsset,
        funding_chain_id: context.fundingSourceChainId,
      })
    },
    analyticsComplete: ({ context }) => captureRenewalComplete(context),
    analyticsFailure: (
      { context },
      params: { readonly stage: 'approval' | 'execution' | 'verification' },
    ) =>
      context.analytics.capture('renewal:stage_fail', {
        ...getAnalyticsProperties(context, envConfig.chain.id),
        stage: params.stage,
        is_retryable: true,
      }),
    analyticsRetry: ({ context }) =>
      context.analytics.capture('renewal:flow_retry', {
        ...getAnalyticsProperties(context, envConfig.chain.id),
      }),
    setDuration: assign({
      duration: ({ event, context }) =>
        event.type === 'pricing.duration.set'
          ? event.duration
          : context.duration,
    }),
    setToken: assign({
      selectedToken: ({ event, context }) =>
        event.type === 'pricing.token.select'
          ? event.token
          : context.selectedToken,
      // A wallet coin replaces the L2 row and ETH.
      fundingSourceChainId: () => undefined,
      paymentAsset: () => 'stablecoin' as const,
      fundingSourceOrigin: ({ event }) =>
        event.type === 'pricing.token.select'
          ? (event.origin ?? 'user')
          : undefined,
    }),
    setFundingSource: assign({
      fundingSourceChainId: ({ event, context }) =>
        event.type === 'pricing.fundingSource.select'
          ? event.chainId
          : context.fundingSourceChainId,
      fundingSourceOrigin: ({ event }) =>
        event.type === 'pricing.fundingSource.select'
          ? (event.origin ?? 'user')
          : undefined,
      // Bridged in as USDC, so the price is paid in USDC.
      selectedToken: () => 'USDC' as const,
      paymentAsset: () => 'stablecoin' as const,
    }),
    setPaymentAsset: assign(({ event, context }) =>
      event.type === 'pricing.paymentAsset.select'
        ? {
            paymentAsset: event.asset,
            // ETH is swapped into USDC, which is what the renewal pays.
            selectedToken:
              event.asset === 'eth' ? ('USDC' as const) : context.selectedToken,
            fundingSourceChainId:
              event.asset === 'eth' ? undefined : context.fundingSourceChainId,
            fundingSourceOrigin:
              event.asset === 'eth'
                ? (event.origin ?? ('user' as const))
                : context.fundingSourceOrigin,
          }
        : {},
    ),
    // Closing the sheet forgets the pick, so the next open starts from the fallback.
    clearPaymentPick: assign({
      selectedToken: () => undefined,
      fundingSourceChainId: () => undefined,
      fundingSourceOrigin: () => undefined,
      paymentAsset: () => 'stablecoin' as const,
    }),
    beginIntentAttempt: assign({ paymentUpdate: () => undefined }),
    reviewPayment: assign({
      paymentUpdate: ({ event }) =>
        event.type === 'renewal.payment.increased'
          ? {
              status: 'reviewing' as const,
              prompt: event.prompt,
              decide: event.decide,
            }
          : undefined,
    }),
    answerPaymentReview: ({ context }, params: { isAccepted: boolean }) => {
      if (context.paymentUpdate?.status === 'reviewing')
        context.paymentUpdate.decide(params.isAccepted)
    },
    keepAcceptedPayment: assign({
      paymentUpdate: ({ context }) =>
        context.paymentUpdate && {
          status: 'accepted' as const,
          prompt: context.paymentUpdate.prompt,
        },
    }),
    clearPaymentUpdate: assign({ paymentUpdate: () => undefined }),
    clearFailure: assign({
      lastErrorMessage: () => undefined,
    }),
    clearSubmission: assign({
      submissionData: () => undefined,
      approvalTxId: () => undefined,
      renewalTxId: () => undefined,
      lastErrorMessage: () => undefined,
    }),
    startRenewal: assign({
      analytics: ({ context }) => bindAnalyticsFlow(context.analytics),
      lastErrorMessage: () => undefined,
      approvalTxId: () => undefined,
      renewalTxId: () => undefined,
      submissionData: ({ event }) =>
        event.type === 'renewal.start'
          ? {
              label: event.label,
              duration: event.duration,
              referrer: event.referrer,
              signer: event.signer,
              token: event.token,
              priceRaw: event.priceRaw,
              priceNumber: event.priceNumber,
              displayedDebit: event.displayedDebit,
              ownerAddress: event.ownerAddress,
              walletClient: event.walletClient,
              l2Funding: event.l2Funding,
              ethFunding: event.ethFunding,
            }
          : undefined,
    }),
    invalidateNameQueries: ({ context }) => {
      const name = context.submissionData?.label
      const queryClient = getQueryClient()
      if (!name || !queryClient) {
        return
      }

      queryClient.invalidateQueries({
        queryKey: $qk({
          name: `${name}.eth`,
        }),
      })

      if (context.protocol === 'v1') {
        queryClient.invalidateQueries({
          queryKey: getV1RenewableQueryOptions(`${name}.eth`).queryKey,
        })
        queryClient.invalidateQueries({
          queryKey: qk('migration', 'v1_names'),
        })
      }
    },
  },
}).createMachine({
  id: 'renewalUi',
  context: ({ input }) => ({
    analytics: createAnalyticsFlow(undefined, input.analyticsName),
    currentExpiry: input.currentExpiry,
    protocol: input.protocol,
    renewerAddress: getRenewerAddress(input.protocol),
    duration: BigInt(
      getDurationInSecondsFromYears(
        1,
        new Date(Number(input.currentExpiry) * 1000),
      ),
    ),
    selectedToken: undefined,
    paymentAsset: 'stablecoin',
    lastErrorMessage: undefined,
    approvalFallback: input.approvalFallback,
  }),
  initial: 'pricing',
  states: {
    pricing: {
      initial: 'duration',
      states: {
        duration: {
          on: {
            'pricing.duration.set': {
              actions: 'setDuration',
            },
            'pricing.step.next': {
              target: 'tokens',
            },
          },
        },
        // One confirmation: picking the coin and starting the renewal happen here.
        tokens: {
          on: {
            'pricing.step.previous': {
              target: 'duration',
              actions: 'clearPaymentPick',
            },
            'pricing.token.select': {
              actions: ['setToken', 'analyticsPaymentSelect'],
            },
            'pricing.fundingSource.select': {
              actions: ['setFundingSource', 'analyticsPaymentSelect'],
            },
            'pricing.paymentAsset.select': {
              actions: ['setPaymentAsset', 'analyticsPaymentSelect'],
            },
            'pricing.dialog.dismiss': {
              target: 'duration',
              actions: 'clearPaymentPick',
            },
            'renewal.start': [
              {
                // Smart-account signer: one owner-signed intent, paid out of
                // the account itself.
                guard: 'startsHcaRenewal',
                target: '#renewalUi.submittingHcaRenewal',
                actions: [
                  'startRenewal',
                  'analyticsStart',
                  'analyticsExecution',
                ],
              },
              {
                // Only the account can be paid from an L2 or with ETH, so a
                // wallet start naming either is refused.
                guard: ({ event }) =>
                  event.l2Funding === undefined &&
                  event.ethFunding === undefined,
                target: '#renewalUi.checkingAllowance',
                actions: [
                  'startRenewal',
                  'analyticsStart',
                  'analyticsExecution',
                ],
              },
            ],
          },
        },
      },
    },
    // Smart-account route: ONE owner-signed intent renews the name and moves
    // the USDC to pay for it (price plus fee), so there is no approve
    // intent, with a separately consented USDC approval fallback when needed.
    // `submitHcaRenewal` resolves only once the
    // intent has filled, so success needs no polling step of its own.
    submittingHcaRenewal: {
      tags: 'renewing',
      entry: 'beginIntentAttempt',
      exit: 'clearPaymentUpdate',
      // Until the intent is submitted the owner is still approving (the
      // funding permit, then the signature), so the payment dialog stays up
      // as it does for registration; `renewalTxId` marks the hand-over.
      on: {
        'renewal.submitted': {
          actions: assign({ renewalTxId: ({ event }) => event.txId }),
        },
      },
      initial: 'signing',
      states: {
        signing: {
          on: {
            'renewal.payment.increased': {
              target: 'reviewingPayment',
              actions: 'reviewPayment',
            },
          },
        },
        // The re-quote asks the wallet for more than the user confirmed:
        // nothing is signed until they accept the updated receipt.
        reviewingPayment: {
          on: {
            'renewal.payment.accept': {
              target: 'signing',
              actions: [
                { type: 'answerPaymentReview', params: { isAccepted: true } },
                'keepAcceptedPayment',
              ],
            },
            cancel: {
              target: '#renewalUi.pricing.tokens',
              actions: 'resetAnalytics',
            },
          },
        },
      },
      invoke: {
        id: 'submitHcaRenewal',
        src: 'submitHcaRenewalIntent',
        input: ({ context, self }) => {
          const submission = requireSubmissionData(context.submissionData)
          return {
            completion: context,
            onSubmitted: (txId: string) =>
              self.send({ type: 'renewal.submitted', txId }),
            confirmIncreasedPayment: (prompt: HcaFundingPrompt) =>
              new Promise<boolean>((decide) =>
                self.send({
                  type: 'renewal.payment.increased',
                  prompt,
                  decide,
                }),
              ),
            ...(submission.l2Funding
              ? { l2Funding: submission.l2Funding }
              : {}),
            ...(submission.ethFunding
              ? { ethFunding: submission.ethFunding }
              : {}),
            items: [
              {
                label: submission.label,
                referrer: submission.referrer,
                duration: submission.duration,
              },
            ],
            renewerAddress: context.renewerAddress,
            protocol: context.protocol,
            token: submission.token,
            signer: requireRhinestoneSigner(submission.signer),
            ownerAddress: submission.ownerAddress,
            walletClient: submission.walletClient,
            publicClient,
            chainId: envConfig.chain.id,
            ...(context.approvalFallback
              ? { approvalFallback: context.approvalFallback }
              : {}),
            ...(submission.displayedDebit
              ? { displayedDebit: submission.displayedDebit }
              : {}),
          }
        },
        onDone: {
          target: 'success',
          actions: [
            assign({ renewalTxId: ({ event }) => event.output }),
            'invalidateNameQueries',
          ],
        },
        onError: [
          {
            // Either consent can be declined without submitting a renewal.
            // A permit may already be signed before the separate approval consent.
            guard: ({ event }) =>
              event.error instanceof HcaFundingDeclinedError ||
              event.error instanceof HcaFundingApprovalDeclinedError,
            target: '#renewalUi.pricing.tokens',
          },
          {
            target: 'failure',
            actions: [
              { type: 'analyticsFailure', params: { stage: 'execution' } },
              assign({
                lastErrorMessage: ({ event }) =>
                  event.error instanceof Error
                    ? event.error.message
                    : 'Renewal failed',
              }),
            ],
          },
        ],
      },
    },
    // Read the connected EOA's current allowance to the registrar. This is the
    // EOA fallback route: the EOA is `msg.sender` and pays the price itself.
    checkingAllowance: {
      entry: 'analyticsApproval',
      tags: 'renewing',
      invoke: {
        src: 'readPaymentTokenAllowance',
        input: ({ context }) => {
          const submission = requireSubmissionData(context.submissionData)
          return {
            owner: submission.ownerAddress,
            selectedToken: submission.token,
            publicClient,
            registrarAddress: context.renewerAddress,
          }
        },
        onDone: [
          {
            // Already authorized enough — skip approval entirely.
            guard: {
              type: 'hasSufficientAllowance',
              params: ({ event }) => ({ allowance: event.output }),
            },
            target: 'submittingRenewal',
          },
          // Set the allowance with a plain on-chain approve (EOA pays gas).
          { target: 'submittingTokenApproval' },
        ],
        // If the read fails, fall back to authorizing rather than blocking.
        onError: { target: 'submittingTokenApproval' },
      },
    },
    submittingTokenApproval: {
      tags: 'renewing',
      invoke: {
        id: 'submitTokenApproval',
        src: 'submitTokenApproval',
        input: ({ context }) => {
          const submission = requireSubmissionData(context.submissionData)
          return {
            tokenPrice: submission.priceRaw,
            selectedToken: submission.token,
            // Direct wallet route — the connected EOA signs the approve.
            signer: submission.signer,
            publicClient,
            registrarAddress: context.renewerAddress,
          }
        },
        onDone: {
          target: 'waitingForTokenApproval',
          actions: assign({
            approvalTxId: ({ event }) => event.output,
          }),
        },
        onError: {
          target: 'failure',
          actions: [
            { type: 'analyticsFailure', params: { stage: 'approval' } },
            assign({
              lastErrorMessage: ({ event }) =>
                event.error instanceof Error
                  ? event.error.message
                  : 'Token approval failed',
            }),
          ],
        },
      },
    },
    waitingForTokenApproval: {
      tags: 'renewing',
      invoke: {
        src: 'pollTransactionStatus',
        input: ({ context }) => {
          if (!context.approvalTxId) {
            throw new Error('approvalTxId is required')
          }
          return { txId: context.approvalTxId }
        },
        onDone: {
          target: 'submittingRenewal',
        },
        onError: {
          target: 'failure',
          actions: [
            { type: 'analyticsFailure', params: { stage: 'approval' } },
            assign({
              lastErrorMessage: ({ event }) =>
                event.error instanceof Error
                  ? event.error.message
                  : 'Token approval polling failed',
            }),
          ],
        },
      },
    },
    // Direct wallet route: a plain on-chain `renew` from the EOA (allowance is
    // already sufficient, or was just set by `submittingTokenApproval`).
    submittingRenewal: {
      tags: 'renewing',
      always: { target: 'submittingPlainRenewal' },
    },
    submittingPlainRenewal: {
      entry: 'analyticsExecution',
      tags: 'renewing',
      invoke: {
        id: 'submitRenewal',
        src: 'submitRenewal',
        input: ({ context }) => {
          const submission = requireSubmissionData(context.submissionData)
          return {
            completion: context,
            label: submission.label,
            referrer: submission.referrer,
            duration: submission.duration,
            selectedToken: submission.token,
            signer: submission.signer,
            publicClient,
            renewerAddress: context.renewerAddress,
          }
        },
        onDone: {
          target: 'waitingForRenewal',
          actions: assign({
            renewalTxId: ({ event }) => event.output,
          }),
        },
        onError: {
          target: 'failure',
          actions: [
            { type: 'analyticsFailure', params: { stage: 'execution' } },
            assign({
              lastErrorMessage: ({ event }) =>
                event.error instanceof Error
                  ? event.error.message
                  : 'Renewal failed',
            }),
          ],
        },
      },
    },
    waitingForRenewal: {
      entry: 'analyticsVerification',
      tags: 'renewing',
      invoke: {
        src: 'pollTransactionStatus',
        input: ({ context }) => {
          if (!context.renewalTxId) {
            throw new Error('renewalTxId is required')
          }
          return { txId: context.renewalTxId, completion: context }
        },
        onDone: {
          target: 'success',
          actions: ['invalidateNameQueries'],
        },
        onError: {
          target: 'failure',
          actions: [
            { type: 'analyticsFailure', params: { stage: 'verification' } },
            assign({
              lastErrorMessage: ({ event }) =>
                event.error instanceof Error
                  ? event.error.message
                  : 'Renewal failed',
            }),
          ],
        },
      },
    },
    // A failed attempt can still have renewed the name (it landed, but its wait
    // errored), so a retry re-reads the expiry before paying again.
    checkingRenewed: {
      tags: 'renewing',
      invoke: {
        src: 'readExpiry',
        input: ({ context }) => ({
          name: `${requireSubmissionData(context.submissionData).label}.eth`,
          protocol: context.protocol,
        }),
        onDone: [
          {
            guard: {
              type: 'alreadyRenewed',
              params: ({ event }) => ({ expiry: event.output.expiry }),
            },
            target: 'success',
            actions: 'invalidateNameQueries',
          },
          // Intent route: the funding is quoted again inside the retry.
          { guard: 'isHcaRenewal', target: 'submittingHcaRenewal' },
          // EOA route: a prior approval may have landed, so start from the
          // allowance check.
          { target: 'checkingAllowance' },
        ],
        onError: {
          target: 'failure',
          actions: [
            { type: 'analyticsFailure', params: { stage: 'verification' } },
            assign({
              lastErrorMessage: () =>
                "Couldn't confirm whether the last attempt renewed this name, so it wasn't retried. Please try again.",
            }),
          ],
        },
      },
    },
    success: { entry: 'analyticsComplete' },
    failure: {
      on: {
        retry: {
          target: 'checkingRenewed',
          actions: [
            'analyticsRetry',
            'clearFailure',
            assign({
              approvalTxId: () => undefined,
              renewalTxId: () => undefined,
            }),
          ],
        },
        cancel: {
          target: 'pricing',
          actions: ['resetAnalytics', 'clearFailure', 'clearSubmission'],
        },
      },
    },
  },
  on: {
    'label.changed': {
      target: '.pricing',
      actions: ['resetAnalytics', 'clearFailure', 'clearSubmission'],
    },
  },
})
