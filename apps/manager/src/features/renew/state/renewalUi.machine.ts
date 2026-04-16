import {
  ENS_SEPOLIA_CONTRACTS,
  type Signer,
  transactionManager,
} from '@ens-apps/transaction-manager'
import { FAST_TEST_ETH_REGISTRAR_ABI } from '@ens-apps/transaction-manager/abis/FastTestETHRegistrar.abi.js'
import {
  REFERER_ADDRESS,
  type SUPPORTED_TOKEN,
  SUPPORTED_TOKENS,
} from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import {
  createTransactionRequest,
  getSignerAddress,
  pollTransactionStatusActor,
  submitApprovalActor,
} from '@ens-apps/transaction-manager/machines/registration/registration.actors'
import { fromResultAsync } from '@ens-apps/utils/xstate/neverthrow'
import { secondsInYear } from 'date-fns/constants'
import { type Address, encodeFunctionData } from 'viem'
import { readContract } from 'viem/actions'
import { assign, fromPromise, setup } from 'xstate'
import { publicClient } from '@/lib/wagmi'

type SubmissionData = {
  label: string
  duration: bigint
  token: SUPPORTED_TOKEN
  /** Price in token units */
  priceRaw: bigint

  /** Formatted base price */
  priceNumber: number

  signer: Signer
  accountAddress: Address
}

const startRenewalTransaction = async ({
  label,
  duration,
  signer,
  selectedToken,
}: {
  label: string
  duration: bigint
  signer: Signer
  selectedToken: SUPPORTED_TOKEN
}) => {
  console.log('input', { label, duration, signer, selectedToken })
  const accountAddress = getSignerAddress(signer)

  if (!signer || !accountAddress) {
    throw new Error('Account not ready')
  }
  const paymentToken = SUPPORTED_TOKENS[selectedToken]
  // Normalize to lowercase to avoid Rhinestone SDK validation issues
  const normalizedPaymentToken = paymentToken.toLowerCase() as Address
  console.log(
    `🔧 Payment token normalization: ${paymentToken} -> ${normalizedPaymentToken}`,
  )

  // Check if the payment token is supported
  const isSupported = await readContract(publicClient, {
    address: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
    abi: FAST_TEST_ETH_REGISTRAR_ABI,
    functionName: 'isPaymentToken',
    args: [normalizedPaymentToken],
  })

  console.log(
    `🔍 Payment token ${normalizedPaymentToken} is supported:`,
    isSupported,
  )

  if (!isSupported) {
    throw new Error(
      `Payment token ${normalizedPaymentToken} is not supported by the ENS registrar`,
    )
  }

  const txData = encodeFunctionData({
    abi: FAST_TEST_ETH_REGISTRAR_ABI,
    functionName: 'renew',
    args: [label, duration, normalizedPaymentToken, REFERER_ADDRESS],
  })

  console.log('txdata', {
    functionName: 'renew',
    args: [label, duration, normalizedPaymentToken, REFERER_ADDRESS],
  })

  const request = createTransactionRequest({
    signer,
    from: accountAddress,
    to: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
    data: txData,
    value: 0n,
    chainId: publicClient.chain.id,
    calls: [
      {
        to: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
        data: txData,
        value: 0n,
      },
    ],
    sponsored: true,
  })

  const txId = transactionManager.startTransaction(
    {
      type: 'custom',
      request,
    },
    signer,
    {
      chainId: publicClient.chain.id,
      description: `Renew ${label}.eth`,
      publicClient,
    },
  )

  return txId
}

export const renewalUiMachine = setup({
  types: {
    context: {} as {
      currentExpiry: bigint
      duration: number
      selectedToken: SUPPORTED_TOKEN | undefined
      lastErrorMessage?: string
      submissionData?: SubmissionData
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
          accountAddress: Address

          /** Formatted base price */
          priceNumber: number
        }
      | { type: 'retry' }
      | { type: 'cancel' }
      | { type: 'label.changed' },
    tags: '' as 'renewing',
  },
  actors: {
    submitTokenApproval: fromResultAsync(
      (input: Parameters<typeof submitApprovalActor>[0]) =>
        submitApprovalActor(input),
    ),
    submitRenewal: fromPromise(
      async ({
        input,
      }: {
        input: Parameters<typeof startRenewalTransaction>[0]
      }) => startRenewalTransaction(input),
    ),
    pollTransactionStatus: fromResultAsync((input: { txId: string }) => {
      return pollTransactionStatusActor(input)
    }),
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
      submissionData: ({ event }) =>
        event.type === 'renewal.start'
          ? {
              label: event.label,
              duration: event.duration,
              signer: event.signer,
              accountAddress: event.accountAddress,
              token: event.token,
              priceRaw: event.priceRaw,
              priceNumber: event.priceNumber,
            }
          : undefined,
    }),
  },
}).createMachine({
  id: 'renewalUi',
  context: ({ input }) => ({
    currentExpiry: input.currentExpiry,
    duration: secondsInYear,
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
              target: '#renewalUi.submittingTokenApproval',
              actions: 'startRenewal',
            },
          },
        },
      },
    },
    submittingTokenApproval: {
      tags: 'renewing',
      invoke: {
        id: 'submitTokenApproval',
        src: 'submitTokenApproval',
        input: ({ context }) => ({
          tokenPrice: context.submissionData!.priceRaw,
          selectedToken: context.submissionData!.token,
          signer: context.submissionData!.signer,
          publicClient,
          useFastRegistrar: true,
          sponsored: true,
        }),
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
        input: ({ context }) => ({ txId: context.approvalTxId! }),
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
    submittingRenewal: {
      tags: 'renewing',
      invoke: {
        id: 'submitRenewal',
        src: 'submitRenewal',
        input: ({ context }) => ({
          label: context.submissionData!.label,
          duration: context.submissionData!.duration,
          signer: context.submissionData!.signer,
          accountAddress: context.submissionData!.accountAddress,
          selectedToken: context.submissionData!.token,
        }),
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
        input: ({ context }) => ({ txId: context.renewalTxId! }),
        onDone: {
          target: 'success',
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
        retry: {
          target: 'submittingTokenApproval',
          actions: 'clearFailure',
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
