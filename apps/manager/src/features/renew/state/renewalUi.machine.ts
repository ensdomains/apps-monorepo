import type { Signer } from '@ens-apps/transaction-manager'
import type { SUPPORTED_TOKEN } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import {
  authorizedPaymentAmount,
  ensureHcaDeployedActor,
  type PermitSignature,
  pollTransactionStatusActor,
  readPaymentTokenAllowanceActor,
  signPermitActor,
  submitApprovalActor,
  submitPermitAndRenewActor,
  submitRenewActor,
} from '@ens-apps/transaction-manager/machines/registration/registration.actors'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromResultAsync } from '@ens-apps/utils/xstate/neverthrow'
import type { Address } from 'viem'
import { assign, setup } from 'xstate'
import { getDurationInSecondsFromYears } from '@/features/register-v2/utils/time'
import { publicClient } from '@/lib/wagmi'
import { getQueryClient } from '@/utils/router/root-context'

type SubmissionData = {
  label: string
  duration: bigint
  token: SUPPORTED_TOKEN
  /** Price in token units */
  priceRaw: bigint

  /** Formatted base price */
  priceNumber: number

  /**
   * Signer used to submit the renewal (and, for rhinestone/HCA, carry the
   * gasless permit). EOA on the pure-EOA path; the HCA on the sponsored path.
   */
  signer: Signer

  /**
   * EOA that actually pays the rent. `ETHRegistrar.renew` charges
   * `_msgSender()`, and the registrar's HCA-aware sender resolution unwraps an
   * HCA caller back to its owner EOA — so the allowance must be authorized by
   * (and read for) this EOA on every signer path. The permit MUST be signed by
   * it too (an HCA can't produce an EIP-2612 signature).
   */
  ownerAddress: Address

  /**
   * EOA signer used ONLY to produce the EIP-2612 permit signature on the
   * rhinestone/HCA path. Absent on the pure-EOA path (which uses a plain
   * on-chain `approve` with the main `signer`).
   */
  approvalSigner?: Signer
}

const isRhinestone = (signer: Signer) => signer.type === 'rhinestone'

export const renewalUiMachine = setup({
  types: {
    context: {} as {
      currentExpiry: bigint
      duration: number
      selectedToken: SUPPORTED_TOKEN | undefined
      lastErrorMessage?: string
      submissionData?: SubmissionData
      permit?: PermitSignature
      approvalTxId?: string
      renewalTxId?: string
    },
    input: {} as {
      currentExpiry: bigint
    },
    events: {} as
      | { type: 'pricing.step.next' }
      | { type: 'pricing.step.previous' }
      | { type: 'pricing.dialog.dismiss' }
      | { type: 'pricing.duration.set'; duration: number }
      | { type: 'pricing.token.select'; token: SUPPORTED_TOKEN | undefined }
      | {
          type: 'renewal.start'
          label: string
          duration: bigint
          token: SUPPORTED_TOKEN
          /** Price in token units */
          priceRaw: bigint
          signer: Signer
          ownerAddress: Address
          approvalSigner?: Signer

          /** Formatted base price */
          priceNumber: number
        }
      | { type: 'retry' }
      | { type: 'cancel' }
      | { type: 'label.changed' },
    tags: '' as 'renewing',
  },
  actors: {
    ensureHcaDeployed: fromResultAsync(
      (input: Parameters<typeof ensureHcaDeployedActor>[0]) =>
        ensureHcaDeployedActor(input),
    ),
    readPaymentTokenAllowance: fromResultAsync(
      (input: Parameters<typeof readPaymentTokenAllowanceActor>[0]) =>
        readPaymentTokenAllowanceActor(input),
    ),
    signPermit: fromResultAsync(
      (input: Parameters<typeof signPermitActor>[0]) => signPermitActor(input),
    ),
    submitTokenApproval: fromResultAsync(
      (input: Parameters<typeof submitApprovalActor>[0]) =>
        submitApprovalActor(input),
    ),
    submitPermitAndRenewal: fromResultAsync(
      (input: Parameters<typeof submitPermitAndRenewActor>[0]) =>
        submitPermitAndRenewActor(input),
    ),
    submitRenewal: fromResultAsync(
      (input: Parameters<typeof submitRenewActor>[0]) =>
        submitRenewActor(input),
    ),
    pollTransactionStatus: fromResultAsync((input: { txId: string }) => {
      return pollTransactionStatusActor(input)
    }),
  },
  guards: {
    // The registrar already has enough allowance from the paying EOA, so no
    // permit/approval is needed — go straight to renew.
    hasSufficientAllowance: ({ context }, params: { allowance: bigint }) =>
      !!context.submissionData &&
      params.allowance >= context.submissionData.priceRaw,
    isRhinestoneSigner: ({ context }) =>
      !!context.submissionData && isRhinestone(context.submissionData.signer),
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
      permit: () => undefined,
      approvalTxId: () => undefined,
      renewalTxId: () => undefined,
      lastErrorMessage: () => undefined,
    }),
    startRenewal: assign({
      lastErrorMessage: () => undefined,
      permit: () => undefined,
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
              approvalSigner: event.approvalSigner,
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
    },
  },
}).createMachine({
  id: 'renewalUi',
  context: ({ input }) => ({
    currentExpiry: input.currentExpiry,
    duration: getDurationInSecondsFromYears(
      1,
      new Date(Number(input.currentExpiry) * 1000),
    ),
    selectedToken: undefined,
    lastErrorMessage: undefined,
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
        tokens: {
          on: {
            'pricing.step.previous': {
              target: 'duration',
            },
            'pricing.token.select': {
              actions: 'setToken',
            },
            'pricing.step.next': {
              guard: ({ context }) => context.selectedToken !== undefined,
              target: 'confirm',
            },
            'pricing.dialog.dismiss': {
              target: 'duration',
            },
          },
        },
        confirm: {
          on: {
            'pricing.step.previous': {
              target: 'tokens',
            },
            'pricing.dialog.dismiss': {
              target: 'duration',
            },
            'renewal.start': {
              target: '#renewalUi.ensuringHcaDeployed',
              actions: 'startRenewal',
            },
          },
        },
      },
    },
    ensuringHcaDeployed: {
      tags: 'renewing',
      invoke: {
        src: 'ensureHcaDeployed',
        input: ({ context }) => ({
          signer: context.submissionData!.signer,
        }),
        onDone: {
          target: 'checkingAllowance',
        },
        onError: {
          target: 'failure',
          actions: assign({
            lastErrorMessage: ({ event }) =>
              event.error instanceof Error
                ? event.error.message
                : 'Smart account deployment failed',
          }),
        },
      },
    },
    // Read the rent payer's (EOA owner's) current allowance to the registrar.
    // The registrar charges `_msgSender()` and unwraps an HCA caller to its
    // owner EOA, so payment authorization is always keyed off the EOA — exactly
    // like the registration flow.
    checkingAllowance: {
      tags: 'renewing',
      invoke: {
        src: 'readPaymentTokenAllowance',
        input: ({ context }) => ({
          owner: context.submissionData!.ownerAddress,
          selectedToken: context.submissionData!.token,
          publicClient,
        }),
        onDone: [
          {
            // Already authorized enough — skip permit/approval entirely.
            guard: {
              type: 'hasSufficientAllowance',
              params: ({ event }) => ({ allowance: event.output }),
            },
            target: 'submittingRenewal',
          },
          {
            // Rhinestone/HCA: authorize via a gasless EIP-2612 permit signed by
            // the EOA and carried into the sponsored renew bundle. No EOA tx.
            guard: 'isRhinestoneSigner',
            target: 'signingPermit',
          },
          // Pure-EOA fallback: set the allowance with a plain on-chain approve.
          { target: 'submittingTokenApproval' },
        ],
        onError: [
          {
            // If the read fails, fall back to authorizing rather than blocking.
            guard: 'isRhinestoneSigner',
            target: 'signingPermit',
          },
          { target: 'submittingTokenApproval' },
        ],
      },
    },
    signingPermit: {
      tags: 'renewing',
      invoke: {
        src: 'signPermit',
        input: ({ context }) => {
          const submission = context.submissionData!
          return {
            owner: submission.ownerAddress,
            selectedToken: submission.token,
            // Authorize only what this renewal needs (+ headroom), never an
            // unlimited allowance. Mirrors registration.
            value: authorizedPaymentAmount(submission.priceRaw),
            // The permit MUST be signed by the EOA (an HCA can't). Use the
            // dedicated EOA approvalSigner; fall back to the main signer for
            // pure-EOA flows that somehow reach here.
            approvalSigner: submission.approvalSigner ?? submission.signer,
            publicClient,
          }
        },
        onDone: {
          target: 'submittingRenewal',
          actions: assign({
            permit: ({ event }) => event.output,
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
    submittingTokenApproval: {
      tags: 'renewing',
      invoke: {
        id: 'submitTokenApproval',
        src: 'submitTokenApproval',
        input: ({ context }) => {
          const submission = context.submissionData!
          return {
            tokenPrice: submission.priceRaw,
            selectedToken: submission.token,
            // The registrar pulls payment from the EOA, so the approve must be
            // signed by the EOA. Pure-EOA flows already sign with the EOA.
            signer: submission.approvalSigner ?? submission.signer,
            publicClient,
            // EOA approve is a normal (non-sponsored) tx — the EOA pays gas.
            sponsored: false,
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
    // Branch on whether a permit was signed. A signed permit means the
    // rhinestone path: submit permit+renew as ONE sponsored bundle so the
    // allowance is set atomically before `renew` pulls payment — this is what
    // fixes the "insufficient allowance" simulation failure. Otherwise
    // (sufficient allowance already, or a pure-EOA approve already landed)
    // submit a standalone renew.
    submittingRenewal: {
      tags: 'renewing',
      always: [
        {
          guard: ({ context }) => !!context.permit,
          target: 'submittingRenewalBundle',
        },
        { target: 'submittingPlainRenewal' },
      ],
    },
    submittingRenewalBundle: {
      tags: 'renewing',
      invoke: {
        id: 'submitPermitAndRenewal',
        src: 'submitPermitAndRenewal',
        input: ({ context }) => {
          const submission = context.submissionData!
          return {
            permit: context.permit!,
            selectedToken: submission.token,
            label: submission.label,
            duration: submission.duration,
            signer: submission.signer,
            publicClient,
            sponsored: true,
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
    submittingPlainRenewal: {
      tags: 'renewing',
      invoke: {
        id: 'submitRenewal',
        src: 'submitRenewal',
        input: ({ context }) => {
          const submission = context.submissionData!
          return {
            label: submission.label,
            duration: submission.duration,
            selectedToken: submission.token,
            signer: submission.signer,
            publicClient,
            sponsored: isRhinestone(submission.signer),
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
    success: {},
    failure: {
      on: {
        // Retry from the allowance check: a prior attempt may have landed (skip
        // to renew) and a fresh permit signature is needed otherwise.
        retry: {
          target: 'checkingAllowance',
          actions: [
            'clearFailure',
            assign({
              permit: () => undefined,
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
