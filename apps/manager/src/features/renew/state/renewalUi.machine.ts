import { type Signer, transactionManager } from '@ens-apps/transaction-manager'
import {
  type SUPPORTED_TOKEN,
  SUPPORTED_TOKENS,
} from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import {
  createTransactionRequest,
  getSignerAddress,
  pollTransactionStatusActor,
  submitApprovalActor,
} from '@ens-apps/transaction-manager/machines/registration/registration.actors'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromResultAsync } from '@ens-apps/utils/xstate/neverthrow'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { renewNameWriteParameters } from '@ensdomains/ensjs/wallet/v2'
import { standardRentPriceOracleIsPaymentTokenSnippet } from '@ensdomains/ensjs-abi/v2/standardRentPriceOracle'
import type { Address } from 'viem'
import { encodeFunctionData, parseAbi } from 'viem'
import { readContract } from 'viem/actions'
import { assign, fromPromise, setup } from 'xstate'
import { SECONDS_IN_YEAR } from '@/features/register-v2/utils/time'
import { publicClient, sepoliaWithEns } from '@/lib/wagmi'
import { getQueryClient } from '@/utils/router/root-context'

const ETH_REGISTRAR = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensEthRegistrar',
})

// The production `ETHRegistrar` does not expose `isPaymentToken` — resolve
// the rent oracle off the registrar and call it there (snippet from
// ensjs-abi). `rentPriceOracle()` getter isn't (yet) exported as a snippet
// from ensjs-abi; keep this inline until it lands upstream.
const ETH_REGISTRAR_RENT_PRICE_ORACLE_ABI = parseAbi([
  'function rentPriceOracle() view returns (address)',
])

type SubmissionData = {
  label: string
  duration: bigint
  token: SUPPORTED_TOKEN
  /** Price in token units */
  priceRaw: bigint

  /** Formatted base price */
  priceNumber: number

  signer: Signer
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
  const accountAddress = getSignerAddress(signer)
  const paymentToken = SUPPORTED_TOKENS[selectedToken]
  // Normalize to lowercase to avoid Rhinestone SDK validation issues
  const normalizedPaymentToken = paymentToken.toLowerCase() as Address
  console.log(
    `🔧 Payment token normalization: ${paymentToken} -> ${normalizedPaymentToken}`,
  )

  // Check if the payment token is supported (query the registrar's rent
  // oracle — the registrar itself doesn't expose `isPaymentToken`).
  const oracle = await readContract(publicClient, {
    address: ETH_REGISTRAR,
    abi: ETH_REGISTRAR_RENT_PRICE_ORACLE_ABI,
    functionName: 'rentPriceOracle',
  })
  const isSupported = await readContract(publicClient, {
    address: oracle,
    abi: standardRentPriceOracleIsPaymentTokenSnippet,
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

  const writeParams = renewNameWriteParameters(
    publicClient as unknown as Parameters<typeof renewNameWriteParameters>[0],
    {
      name: `${label}.eth`,
      duration,
      paymentToken: normalizedPaymentToken,
    },
  )

  const txData = encodeFunctionData({
    ...writeParams,
  })

  const request = createTransactionRequest({
    signer,
    from: accountAddress,
    to: ETH_REGISTRAR,
    data: txData,
    value: 0n,
    chainId: publicClient.chain.id,
    calls: [
      {
        to: ETH_REGISTRAR,
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
              token: event.token,
              priceRaw: event.priceRaw,
              priceNumber: event.priceNumber,
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
    duration: SECONDS_IN_YEAR,
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
        input: ({ context }) => {
          if (!context.submissionData) {
            throw new Error('submissionData is required')
          }
          return {
            tokenPrice: context.submissionData.priceRaw,
            selectedToken: context.submissionData.token,
            signer: context.submissionData.signer,
            publicClient,
            // Use same registrar address as ensjs, which isn't the fast registrar
            useFastRegistrar: false,
            sponsored: true,
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
    submittingRenewal: {
      tags: 'renewing',
      invoke: {
        id: 'submitRenewal',
        src: 'submitRenewal',
        input: ({ context }) => {
          if (!context.submissionData) {
            throw new Error('submissionData is required')
          }
          return {
            label: context.submissionData.label,
            duration: context.submissionData.duration,
            signer: context.submissionData.signer,
            selectedToken: context.submissionData.token,
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
