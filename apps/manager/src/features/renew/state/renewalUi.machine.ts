import type { RhinestoneSigner, Signer } from '@ens-apps/transaction-manager'
import {
  HcaFundingDeclinedError,
  type HcaFundingPrompt,
} from '@ens-apps/transaction-manager/helpers/hca-intent-funding'
import {
  pollTransactionStatusActor,
  readPaymentTokenAllowanceActor,
  submitApprovalActor,
  submitRenewActor,
} from '@ens-apps/transaction-manager/machines/registration/registration.actors'
import { $qk, qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromResultAsync } from '@ens-apps/utils/xstate/neverthrow'
import type { Address, WalletClient } from 'viem'
import { assign, fromPromise, setup } from 'xstate'
import { envConfig } from '@/config'
import { getExpiry } from '@/features/profile/service/profileExpiry'
import { getDurationInSecondsFromYears } from '@/features/register-v2/utils/time'
import { getV1RenewableQueryOptions } from '@/features/renew/data/queries/v1Renewable.query'
import { submitHcaRenewal } from '@/features/renew/service/hcaRenewal'
import {
  getRenewerAddress,
  type RenewalProtocol,
} from '@/features/renew/utils/renewalProtocol'
import type { RENEWAL_TOKEN } from '@/lib/tokens'
import { publicClient } from '@/lib/wagmi'
import { getQueryClient } from '@/utils/router/root-context'

// Two routes pay for a renewal. A smart-account signer renews as an
// owner-signed HCA intent: no plain transactions, no gas token, and the rent
// (in the chosen stable) and fee (in USDC) come out of the account, funded in
// the same intent when short. An EOA signer keeps the direct-wallet route:
// allowance check, approve and renew as plain wagmi transactions. `renew`
// charges `msg.sender`, so each route pays as itself.

type SubmissionData = {
  label: string
  duration: bigint
  token: RENEWAL_TOKEN
  /** Price in token units */
  priceRaw: bigint

  /** Formatted base price */
  priceNumber: number

  /**
   * The account context's signer. `rhinestone` selects the intent route (the
   * HCA pays, the owner key signs); `eoa` keeps the direct-wallet route.
   */
  signer: Signer

  /**
   * EOA that funds the renewal from its wallet: it pays the rent on the direct
   * route (`renew` charges `msg.sender`), and signs the intent plus any funding
   * permit on the HCA route.
   */
  ownerAddress: Address

  /**
   * Owner wallet client. Signs the HCA intent and the EIP-2612 funding permit;
   * unused on the direct route, where the signer is this wallet itself.
   */
  walletClient: WalletClient
}

const requireSubmissionData = (
  submissionData: SubmissionData | undefined,
): SubmissionData => {
  if (!submissionData) throw new Error('Renewal submission data is required')
  return submissionData
}

const requireRhinestoneSigner = (signer: Signer): RhinestoneSigner => {
  if (signer.type !== 'rhinestone') {
    throw new Error('The HCA renewal route needs a smart-account signer')
  }
  return signer
}

export const renewalUiMachine = setup({
  types: {
    context: {} as {
      currentExpiry: bigint
      protocol: RenewalProtocol
      renewerAddress: Address
      duration: bigint
      selectedToken: RENEWAL_TOKEN | undefined
      lastErrorMessage?: string
      submissionData?: SubmissionData
      approvalTxId?: string
      renewalTxId?: string
      /**
       * Parks the HCA funding on the user's answer. Lives in context so the
       * invoked intent submit can reach the component that renders the prompt.
       */
      confirmFunding?: (prompt: HcaFundingPrompt) => Promise<boolean> | boolean
    },
    input: {} as {
      currentExpiry: bigint
      protocol: RenewalProtocol
      confirmFunding?: (prompt: HcaFundingPrompt) => Promise<boolean> | boolean
    },
    events: {} as
      | { type: 'pricing.step.next' }
      | { type: 'pricing.step.previous' }
      | { type: 'pricing.dialog.dismiss' }
      | { type: 'pricing.duration.set'; duration: bigint }
      | { type: 'pricing.token.select'; token: RENEWAL_TOKEN | undefined }
      | {
          type: 'renewal.start'
          label: string
          duration: bigint
          token: RENEWAL_TOKEN
          /** Price in token units */
          priceRaw: bigint
          signer: Signer
          ownerAddress: Address
          walletClient: WalletClient

          /** Formatted base price */
          priceNumber: number
        }
      | { type: 'renewal.submitted'; txId: string }
      | { type: 'retry' }
      | { type: 'cancel' }
      | { type: 'label.changed' },
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
      (input: Parameters<typeof submitRenewActor>[0]) =>
        submitRenewActor(input),
    ),
    pollTransactionStatus: fromResultAsync((input: { txId: string }) => {
      return pollTransactionStatusActor(input)
    }),
    // The intent route submits and WAITS for the fill here, so there is nothing
    // left to poll afterwards.
    submitHcaRenewalIntent: fromPromise(
      async ({ input }: { input: Parameters<typeof submitHcaRenewal>[0] }) =>
        (await submitHcaRenewal(input)).txId,
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
    }),
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
      lastErrorMessage: () => undefined,
      approvalTxId: () => undefined,
      renewalTxId: () => undefined,
      submissionData: ({ event }) =>
        event.type === 'renewal.start'
          ? {
              label: event.label,
              duration: event.duration,
              signer: event.signer,
              token: event.token,
              priceRaw: event.priceRaw,
              priceNumber: event.priceNumber,
              ownerAddress: event.ownerAddress,
              walletClient: event.walletClient,
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
    lastErrorMessage: undefined,
    confirmFunding: input.confirmFunding,
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
            },
            'pricing.token.select': {
              actions: 'setToken',
            },
            'pricing.dialog.dismiss': {
              target: 'duration',
            },
            'renewal.start': [
              {
                // Smart-account signer: one owner-signed intent, paid out of
                // the account itself.
                guard: 'startsHcaRenewal',
                target: '#renewalUi.submittingHcaRenewal',
                actions: 'startRenewal',
              },
              {
                target: '#renewalUi.checkingAllowance',
                actions: 'startRenewal',
              },
            ],
          },
        },
      },
    },
    // Smart-account route: ONE owner-signed intent renews the name and moves
    // the USDC to pay for it (rent plus fee), so there is no approve
    // transaction and no gas token. `submitHcaRenewal` resolves only once the
    // intent has filled, so success needs no polling step of its own.
    submittingHcaRenewal: {
      tags: 'renewing',
      // Until the intent is submitted the owner is still approving (the
      // funding prompt, then the signature), so the payment dialog stays up
      // as it does for registration; `renewalTxId` marks the hand-over.
      on: {
        'renewal.submitted': {
          actions: assign({ renewalTxId: ({ event }) => event.txId }),
        },
      },
      invoke: {
        id: 'submitHcaRenewal',
        src: 'submitHcaRenewalIntent',
        input: ({ context, self }) => {
          const submission = requireSubmissionData(context.submissionData)
          return {
            onSubmitted: (txId: string) =>
              self.send({ type: 'renewal.submitted', txId }),
            items: [{ label: submission.label, duration: submission.duration }],
            renewerAddress: context.renewerAddress,
            protocol: context.protocol,
            token: submission.token,
            signer: requireRhinestoneSigner(submission.signer),
            ownerAddress: submission.ownerAddress,
            walletClient: submission.walletClient,
            publicClient,
            chainId: envConfig.chain.id,
            ...(context.confirmFunding
              ? { confirmFunding: context.confirmFunding }
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
            // Declining the funding prompt is a cancel, not a failure: nothing
            // was signed and nothing was spent, so hand the user back to the
            // payment step instead of a failure screen (as the bulk route does).
            guard: ({ event }) =>
              event.error instanceof HcaFundingDeclinedError,
            target: '#renewalUi.pricing.tokens',
          },
          {
            target: 'failure',
            actions: assign({
              lastErrorMessage: ({ event }) =>
                event.error instanceof Error
                  ? event.error.message
                  : 'Renewal failed',
            }),
          },
        ],
      },
    },
    // Read the connected EOA's current allowance to the registrar. This is the
    // EOA fallback route: the EOA is `msg.sender` and pays the rent itself.
    checkingAllowance: {
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
          actions: assign({
            lastErrorMessage: ({ event }) =>
              event.error instanceof Error
                ? event.error.message
                : 'Token approval failed',
          }),
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
          actions: assign({
            lastErrorMessage: ({ event }) =>
              event.error instanceof Error
                ? event.error.message
                : 'Token approval polling failed',
          }),
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
      tags: 'renewing',
      invoke: {
        id: 'submitRenewal',
        src: 'submitRenewal',
        input: ({ context }) => {
          const submission = requireSubmissionData(context.submissionData)
          return {
            label: submission.label,
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
          actions: assign({
            lastErrorMessage: ({ event }) =>
              event.error instanceof Error
                ? event.error.message
                : 'Renewal failed',
          }),
        },
      },
    },
    waitingForRenewal: {
      tags: 'renewing',
      invoke: {
        src: 'pollTransactionStatus',
        input: ({ context }) => {
          if (!context.renewalTxId) {
            throw new Error('renewalTxId is required')
          }
          return { txId: context.renewalTxId }
        },
        onDone: {
          target: 'success',
          actions: ['invalidateNameQueries'],
        },
        onError: {
          target: 'failure',
          actions: assign({
            lastErrorMessage: ({ event }) =>
              event.error instanceof Error
                ? event.error.message
                : 'Renewal failed',
          }),
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
          actions: assign({
            lastErrorMessage: () =>
              "Couldn't confirm whether the last attempt renewed this name, so it wasn't retried. Please try again.",
          }),
        },
      },
    },
    success: {},
    failure: {
      on: {
        retry: {
          target: 'checkingRenewed',
          actions: [
            'clearFailure',
            assign({
              approvalTxId: () => undefined,
              renewalTxId: () => undefined,
            }),
          ],
        },
        cancel: {
          target: 'pricing',
          actions: ['clearFailure', 'clearSubmission'],
        },
      },
    },
  },
  on: {
    'label.changed': {
      target: '.pricing',
      actions: ['clearFailure', 'clearSubmission'],
    },
  },
})
