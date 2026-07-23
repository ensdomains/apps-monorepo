import { getChainClock } from '@ens-apps/utils/time-travel/installChainClock'
import { fromResultAsync } from '@ens-apps/utils/xstate/neverthrow'
import type { Address, Hash, Hex, PublicClient } from 'viem'
import { assign, fromPromise, setup } from 'xstate'
import type { Signer } from '../../types/signer.types'
import {
  generateCommitmentActor,
  type PermitSignature,
  pollTransactionStatusActor,
  readMinCommitmentAgeActor,
  readPaymentTokenAllowanceActor,
  resolveResolverDeploymentActor,
  submitApprovalActor,
  submitCommitmentActor,
  submitRegistrationActor,
  submitResolverDeploymentActor,
  validateCommitmentActor,
  verifyRegistrationActor,
} from './registration.actors'
import {
  defaultHcaBudget,
  type HcaSessionEnableParams,
  hcaRegistrarAddress,
  readHcaUsdcBalanceActor,
  signFundingPermitActor,
  submitFundingAndCommitActor,
  submitRevealBatchActor,
  verifyHcaRegistrationActor,
} from './registration.hca.actors'

/**
 * Registration Machine
 *
 * Orchestrates the ENS registration flow for two signer modes:
 *
 * Pure-EOA (portal; old deployment — unchanged):
 * 1. Deploy dedicated resolver → wait → generate commitment → commit → wait
 * 2. Cooldown spine (fetch age → validate → cooldown), allowance → approve
 * 3. Register → wait → verify
 *
 * Standalone-HCA (manager; new deployment, user-paid USDC, NO gas sponsorship):
 * 1. `checkingHcaFunding` — read HCA USDC balance; skip permit when funded
 * 2. `signingFundingPermit` — EIP-2612 permit (wallet → HCA budget); the 2nd
 *    and last wallet prompt (the 1st was the session authorization, signed in
 *    the app BEFORE the machine starts)
 * 3. `submittingSetupBundle` — ONE session-signed request: permit +
 *    transferFrom + enableSessionWithRefund (until enabled) + commit; deploys
 *    the HCA lazily
 * 4. Shared cooldown spine (against the standalone registrar)
 * 5. `submittingRhinestoneBundle` — price re-read + exact-ordered reveal batch
 *    (deployProxy? → approve → register(wallet) → setters → setNameWithHCA? →
 *    authorizeNameRoles); session-signed, no wallet prompt
 * 6. Verify against the standalone registry
 *
 * Persistence is handled automatically via inspect option (see export at bottom)
 */

type CommitmentData = {
  commitment: Hash
  secret: Hex
}

// Fallback wait used when the machine can't read MIN_COMMITMENT_AGE from the
// registrar (e.g. RPC error). The production v2 ETHRegistrar is configured
// with MIN_COMMITMENT_AGE = 60s.
const COMMITMENT_WAIT_DURATION_MS = 60_000

/**
 * Fixed transaction IDs used by the registration machine.
 * These allow the TransactionModal to track each step by a predictable ID.
 */
export const REGISTRATION_TX_IDS = {
  deployResolver: 'tx-reg-deploy-resolver',
  commit: 'tx-reg-commit',
  approve: 'tx-reg-approve',
  register: 'tx-reg-register',
} as const

export type RegistrationContext = {
  // Account & client
  signer?: Signer
  /**
   * EOA signer used ONLY to produce the EIP-2612 FUNDING permit signature
   * (standalone-HCA route): `owner = wallet`, `spender = HCA`,
   * `value = hcaBudget`. The permit + `transferFrom` pair is carried inside
   * the session-signed commit request, so the wallet never sends a
   * transaction or needs ETH. Everything else is session-signed on `signer`.
   */
  approvalSigner?: Signer
  accountAddress?: Address
  ownerAddress?: Address // ENS name owner — the EOA on every signer path (eoa + rhinestone). The rhinestone smart-session UAP pins `register.owner == EOA` (see @ens-apps/smart-account providers/rhinestone/registration-policy.ts), so this MUST be the EOA for rhinestone flows or the userOp fails orchestrator simulation with `InvalidSignature()`. Defaults to `accountAddress` only as a legacy fallback for the now-removed "simple" account type.
  resolverOwnerAddress?: Address // Address to grant EACL roles to on the dedicated resolver. Must be the EOA that the resolver will see at write time after SCA→EOA unwrap; defaults to ownerAddress.
  publicClient?: PublicClient
  chainId: number

  // Registration params
  name: string
  duration: bigint
  selectedToken: 'USDC' | 'DAI'
  tokenPrice: bigint
  sponsored?: boolean
  /**
   * Standalone-HCA: USDC budget transferred wallet → HCA in the commit leg
   * (covers registration price + execution-cost refunds). Defaults to the
   * manifest's same-chain budget.
   */
  hcaBudget?: bigint
  /**
   * Standalone-HCA: session-enable payload (enable-data + enable-call args).
   * Present ONLY while the session still needs its on-chain
   * `enableSessionWithRefund` — the app omits it when resuming with an
   * already-enabled session (`experimental_isSessionEnabled`).
   */
  hcaSessionEnable?: HcaSessionEnableParams
  /** Standalone-HCA: when set, the reveal batch also sets the primary name. */
  primaryName?: string

  // Flow state
  resolverTxId?: string
  resolverSalt?: bigint
  resolverAddress?: Address
  commitment?: CommitmentData
  commitmentTxId?: string
  /**
   * Signed EIP-2612 FUNDING permit (standalone-HCA flow). Set in
   * `signingFundingPermit` and carried into the session-signed commit request
   * (permit + transferFrom pair). Absent on the pure-EOA path (which uses an
   * on-chain `approve`) and when the HCA balance already covers the budget.
   */
  permit?: PermitSignature
  approvalTxId?: string
  registrationTxId?: string
  registerReadyTimestamp?: number
  registrationStartedAt?: number

  // Error state
  error?: Error
  /** The state to return to on RETRY — set when entering error state */
  retryTarget?:
    | 'deployingResolver'
    | 'submittingSetupBundle'
    | 'committingTransaction'
    | 'signingFundingPermit'
    | 'approvingToken'
    | 'registeringDomain'
    | 'submittingRhinestoneBundle'
}

export type RegistrationEvent =
  | {
      type: 'START_REGISTRATION'
      name: string
      /** Duration in seconds */
      duration: bigint
      token: 'USDC' | 'DAI'
      price: bigint
      signer: Signer
      /**
       * Optional EOA signer used to sign the EIP-2612 FUNDING permit
       * (standalone-HCA flow). See `RegistrationContext.approvalSigner`. Omit
       * for pure-EOA flows (which use a plain on-chain `approve`).
       */
      approvalSigner?: Signer
      /** Standalone-HCA: USDC funding budget override. */
      hcaBudget?: bigint
      /** Standalone-HCA: session-enable payload (omit once enabled). */
      hcaSessionEnable?: HcaSessionEnableParams
      /** Standalone-HCA: set the primary name in the reveal batch. */
      primaryName?: string
      accountAddress: Address
      ownerAddress?: Address // ENS name owner — the EOA on every signer path (eoa + rhinestone). The rhinestone smart-session UAP pins `register.owner == EOA`, so this MUST be the EOA for rhinestone flows or the userOp fails orchestrator simulation with `InvalidSignature()`. Defaults to `accountAddress` only as a legacy fallback for the now-removed "simple" account type.
      resolverOwnerAddress?: Address // EOA to grant EACL roles to on the dedicated resolver (must match the address the resolver checks at write time after SCA→EOA unwrap). Defaults to ownerAddress.
      publicClient: PublicClient
      sponsored?: boolean
    }
  | { type: 'RETRY' }
  | { type: 'CANCEL' }

export type RegistrationInput = {
  chainId: number
}

export const registrationMachine = setup({
  types: {
    context: {} as RegistrationContext,
    events: {} as RegistrationEvent,
    input: {} as RegistrationInput,
  },

  actors: {
    readHcaUsdcBalance: fromResultAsync(
      (input: {
        hca: Address
        publicClient: PublicClient
        chainId: number
      }) => {
        return readHcaUsdcBalanceActor(input)
      },
    ),
    signFundingPermit: fromResultAsync(
      (input: {
        wallet: Address
        hca: Address
        value: bigint
        approvalSigner: Signer
        publicClient: PublicClient
        chainId: number
      }) => {
        return signFundingPermitActor(input)
      },
    ),
    submitFundingAndCommit: fromResultAsync(
      (input: {
        name: string
        wallet: Address
        hca: Address
        duration: bigint
        permit?: PermitSignature
        sessionEnable?: HcaSessionEnableParams
        signer: Signer
        publicClient: PublicClient
        id?: string
      }) => {
        return submitFundingAndCommitActor(input)
      },
    ),
    submitRevealBatch: fromResultAsync(
      (input: {
        name: string
        wallet: Address
        hca: Address
        duration: bigint
        secret: Hex
        signer: Signer
        publicClient: PublicClient
        primaryName?: string
        id?: string
      }) => {
        return submitRevealBatchActor(input)
      },
    ),
    deployResolver: fromResultAsync(
      (input: {
        name: string
        owner: Address
        signer: Signer
        publicClient: PublicClient
        sponsored?: boolean
        id?: string
      }) => {
        return submitResolverDeploymentActor(input)
      },
    ),
    resolveResolverDeployment: fromResultAsync((input: { txId: string }) => {
      return resolveResolverDeploymentActor(input)
    }),
    generateCommitment: fromResultAsync(
      ({
        name,
        owner,
        duration,
        publicClient,
        selectedToken,
        resolverAddress,
      }: {
        name: string
        owner: Address
        duration: bigint
        publicClient: PublicClient
        selectedToken: 'USDC' | 'DAI'
        resolverAddress: Address
      }) => {
        return generateCommitmentActor({
          name,
          owner,
          duration,
          publicClient,
          selectedToken,
          resolverAddress,
        })
      },
    ),
    submitCommitment: fromResultAsync(
      (input: {
        commitment: CommitmentData
        signer: Signer
        name: string
        duration: bigint
        publicClient: PublicClient
        sponsored?: boolean
        id?: string
      }) => {
        return submitCommitmentActor(input)
      },
    ),
    submitApproval: fromResultAsync(
      (input: {
        tokenPrice: bigint
        selectedToken: 'USDC' | 'DAI'
        signer: Signer
        publicClient: PublicClient
        sponsored?: boolean
        id?: string
      }) => {
        return submitApprovalActor(input)
      },
    ),
    submitRegistration: fromResultAsync(
      (input: {
        name: string
        commitment: CommitmentData
        signer: Signer
        duration: bigint
        selectedToken: 'USDC' | 'DAI'
        owner: Address
        publicClient: PublicClient
        sponsored?: boolean
        resolverAddress: Address
        id?: string
      }) => {
        return submitRegistrationActor(input)
      },
    ),
    pollTransactionStatus: fromResultAsync((input: { txId: string }) => {
      return pollTransactionStatusActor(input)
    }),
    waitAfterCommitment: fromPromise(
      async ({
        input,
        signal,
      }: {
        input: { targetMs: number }
        signal: AbortSignal
      }) => {
        if (getChainClock()) {
          // Time-travel dev mode: poll Date.now() so a clock warp releases the
          // cooldown early. The chain clock patches Date.now() but NOT
          // setTimeout, so a single setTimeout would ignore the warp.
          const POLL_INTERVAL_MS = 250
          while (Date.now() < input.targetMs) {
            if (signal.aborted) return
            await new Promise<void>((resolve) =>
              setTimeout(resolve, POLL_INTERVAL_MS),
            )
          }
        } else {
          const delayMs = Math.max(0, input.targetMs - Date.now())
          await new Promise<void>((resolve) => setTimeout(resolve, delayMs))
        }
      },
    ),
    validateCommitment: fromResultAsync(
      (input: {
        commitment: CommitmentData
        publicClient: PublicClient
        registrarAddress?: Address
      }) => {
        return validateCommitmentActor(input)
      },
    ),
    readMinCommitmentAge: fromResultAsync(
      (input: { publicClient: PublicClient; registrarAddress?: Address }) => {
        return readMinCommitmentAgeActor(input)
      },
    ),
    readPaymentTokenAllowance: fromResultAsync(
      (input: {
        owner: Address
        selectedToken: 'USDC' | 'DAI'
        publicClient: PublicClient
      }) => {
        return readPaymentTokenAllowanceActor(input)
      },
    ),
    verifyRegistration: fromResultAsync(
      (input: {
        mode: 'eoa' | 'hca'
        name: string
        owner: Address
        hca: Address
        resolverAddress: Address
        publicClient: PublicClient
      }) => {
        // One machine state, two deployments: the HCA path verifies against
        // the standalone registry, the EOA path against the old deployment.
        return input.mode === 'hca'
          ? verifyHcaRegistrationActor({
              name: input.name,
              wallet: input.owner,
              hca: input.hca,
              publicClient: input.publicClient,
            })
          : verifyRegistrationActor(input)
      },
    ),
  },

  guards: {
    isRhinestoneSigner: ({ context }) => context.signer?.type === 'rhinestone',
  },

  actions: {
    logTransition: ({ context, event }) => {
      console.log('🔧 [REGISTRATION] State transition:', {
        event: event?.type,
        name: context.name,
        hasCommitment: !!context.commitment,
        commitmentTxId: context.commitmentTxId,
        approvalTxId: context.approvalTxId,
        registrationTxId: context.registrationTxId,
      })
    },

    clearSnapshot: async () => {
      // TODO: Implement via persistence service
      // await persistenceService.clearRegistrationSnapshot()
      console.log('🗑️ [REGISTRATION] Cleared snapshot')
    },

    clearRegisterReadyTimestamp: assign({
      registerReadyTimestamp: () => undefined,
    }),

    setFallbackRegisterReadyTimestamp: assign({
      registerReadyTimestamp: () => Date.now() + COMMITMENT_WAIT_DURATION_MS,
    }),

    logRegistrationDuration: ({ context }) => {
      if (
        !context.registrationStartedAt ||
        context.signer?.type !== 'rhinestone'
      ) {
        return
      }

      const totalMs = Date.now() - context.registrationStartedAt
      const totalSeconds = totalMs / 1000

      console.log('✅ [REGISTRATION] START_REGISTRATION elapsed:', {
        name: context.name,
        signerType: context.signer?.type,
        elapsedMs: totalMs,
        elapsedSeconds: Number(totalSeconds.toFixed(2)),
      })
    },

    logRegistrationFailureDuration: ({ context }) => {
      if (
        !context.registrationStartedAt ||
        context.signer?.type !== 'rhinestone'
      ) {
        return
      }

      const totalMs = Date.now() - context.registrationStartedAt
      const totalSeconds = totalMs / 1000

      console.error('❌ [REGISTRATION] START_REGISTRATION elapsed:', {
        name: context.name,
        signerType: context.signer?.type,
        elapsedMs: totalMs,
        elapsedSeconds: Number(totalSeconds.toFixed(2)),
        error: context.error?.message,
        errorName: context.error?.name,
      })
    },
  },

  // Note: Persistence will be handled via inspect option (see export at bottom)
}).createMachine({
  id: 'registration',
  initial: 'idle',

  context: ({ input }) => ({
    signer: undefined,
    accountAddress: undefined,
    ownerAddress: undefined,
    resolverOwnerAddress: undefined,
    publicClient: undefined,
    chainId: input.chainId,
    name: '',
    duration: 0n,
    selectedToken: 'USDC',
    tokenPrice: 0n,
    registrationStartedAt: undefined,
    registerReadyTimestamp: undefined,
    resolverAddress: undefined,
    resolverTxId: undefined,
    resolverSalt: undefined,
  }),

  states: {
    idle: {
      on: {
        START_REGISTRATION: {
          target: 'settingUpRegistration',
          actions: assign({
            name: ({ event }) => event.name,
            duration: ({ event }) => event.duration,
            selectedToken: ({ event }) => event.token,
            tokenPrice: ({ event }) => event.price,
            signer: ({ event }) => event.signer,
            approvalSigner: ({ event }) => event.approvalSigner,
            accountAddress: ({ event }) => event.accountAddress,
            registrationStartedAt: ({ event }) =>
              event.signer.type === 'rhinestone' ? Date.now() : undefined,
            ownerAddress: ({ event }) =>
              event.ownerAddress ?? event.accountAddress, // ENS name owner. Default to accountAddress if not provided
            resolverOwnerAddress: ({ event }) =>
              event.resolverOwnerAddress ??
              event.ownerAddress ??
              event.accountAddress, // EACL grantee for the dedicated resolver. Should be the EOA.
            publicClient: ({ event }) => event.publicClient,
            registerReadyTimestamp: () => undefined,
            sponsored: ({ event }) => event.sponsored ?? true,
            hcaBudget: ({ event }) => event.hcaBudget,
            hcaSessionEnable: ({ event }) => event.hcaSessionEnable,
            primaryName: ({ event }) => event.primaryName,
            resolverAddress: () => undefined,
            resolverTxId: () => undefined,
            resolverSalt: () => undefined,
            commitment: () => undefined,
            commitmentTxId: () => undefined,
            permit: () => undefined,
            approvalTxId: () => undefined,
            registrationTxId: () => undefined,
          }),
        },
      },
    },

    settingUpRegistration: {
      entry: ({ context }) => {
        console.log('📝 [REGISTRATION] Setup complete, context populated:', {
          hasPublicClient: !!context.publicClient,
          hasAccountAddress: !!context.accountAddress,
          hasSigner: !!context.signer,
          name: context.name,
        })
      },
      always: [
        {
          // Standalone-HCA: check whether the HCA already holds enough USDC
          // (skips the funding permit), then fund+enable+commit in ONE
          // session-signed request. The session authorization was signed in
          // the app before the machine started.
          guard: 'isRhinestoneSigner',
          target: 'checkingHcaFunding',
        },
        // Pure-EOA: an EOA can't batch, so deploy the resolver, wait for it,
        // then commit as separate transactions.
        { target: 'deployingResolver' },
      ],
    },

    checkingHcaFunding: {
      entry: ['logTransition'],
      invoke: {
        src: 'readHcaUsdcBalance',
        input: ({ context }) => ({
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          hca: context.accountAddress!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          publicClient: context.publicClient!,
          chainId: context.chainId,
        }),
        onDone: [
          {
            // The HCA already holds enough USDC (e.g. leftover budget from a
            // prior registration) — no funding permit needed. 0 extra prompts.
            guard: ({ context, event }) => {
              const balance = event.output as bigint
              return balance >= (context.hcaBudget ?? defaultHcaBudget())
            },
            target: 'submittingSetupBundle',
          },
          { target: 'signingFundingPermit' },
        ],
        // If the read fails, fall back to authorizing rather than blocking.
        onError: { target: 'signingFundingPermit' },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    signingFundingPermit: {
      entry: ['logTransition'],
      invoke: {
        src: 'signFundingPermit',
        input: ({ context }) => ({
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          wallet: context.ownerAddress ?? context.accountAddress!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          hca: context.accountAddress!,
          value: context.hcaBudget ?? defaultHcaBudget(),
          // The funding permit MUST be signed by the wallet (EOA); the HCA
          // cannot produce an EIP-2612 signature for the wallet's balance.
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          approvalSigner: context.approvalSigner ?? context.signer!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          publicClient: context.publicClient!,
          chainId: context.chainId,
        }),
        onDone: {
          target: 'submittingSetupBundle',
          actions: assign({
            permit: ({ event }) => event.output,
          }),
        },
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
              retryTarget: () => 'signingFundingPermit' as const,
            }),
            ({ event }) => {
              console.error(
                '❌ [REGISTRATION] Funding permit signing failed:',
                event.error,
              )
            },
          ],
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    submittingSetupBundle: {
      entry: ['logTransition'],
      invoke: {
        src: 'submitFundingAndCommit',
        input: ({ context }) => ({
          name: context.name,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          wallet: context.ownerAddress ?? context.accountAddress!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          hca: context.accountAddress!,
          duration: context.duration,
          permit: context.permit,
          sessionEnable: context.hcaSessionEnable,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          signer: context.signer!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          publicClient: context.publicClient!,
          id: REGISTRATION_TX_IDS.commit,
        }),
        onDone: {
          target: 'waitingForCommitment',
          actions: assign({
            resolverAddress: ({ event }) => event.output.resolverAddress,
            commitment: ({ event }) => event.output.commitment,
            commitmentTxId: ({ event }) => event.output.txId,
          }),
        },
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
              retryTarget: () => 'submittingSetupBundle' as const,
            }),
            ({ event }) => {
              console.error(
                '❌ [REGISTRATION] Funding+commit request failed:',
                event.error,
              )
            },
          ],
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    deployingResolver: {
      entry: ['logTransition'],
      invoke: {
        src: 'deployResolver',
        input: ({ context }) => ({
          name: context.name,
          // Resolver init grants EACL roles to this address. The dedicated
          // resolver unwraps SCA→EOA at write time, so the grantee must be the
          // EOA (not the SCA) or `setText`/etc. will revert with
          // EACUnauthorizedAccountRoles. See discussion in this file's history.
          owner:
            context.resolverOwnerAddress ??
            context.ownerAddress ??
            // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
            context.accountAddress!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          signer: context.signer!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          publicClient: context.publicClient!,
          sponsored: context.sponsored,
          id: REGISTRATION_TX_IDS.deployResolver,
        }),
        onDone: {
          target: 'waitingForResolverDeployment',
          actions: assign({
            resolverTxId: ({ event }) => event.output.txId,
            resolverSalt: ({ event }) => event.output.salt,
          }),
        },
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
              retryTarget: () => 'deployingResolver' as const,
            }),
            ({ event }) => {
              console.error(
                '❌ [REGISTRATION] Resolver deployment submission failed:',
                event.error,
              )
            },
          ],
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    waitingForResolverDeployment: {
      entry: ['logTransition'],
      invoke: {
        src: 'resolveResolverDeployment',
        // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
        input: ({ context }) => ({ txId: context.resolverTxId! }),
        onDone: {
          target: 'preparingCommitment',
          actions: assign({
            resolverAddress: ({ event }) => event.output.resolverAddress,
          }),
        },
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
              retryTarget: () => 'deployingResolver' as const,
            }),
            ({ event }) => {
              console.error(
                '❌ [REGISTRATION] Resolver deployment failed:',
                event.error,
              )
            },
          ],
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    preparingCommitment: {
      entry: ['logTransition'],
      invoke: {
        src: 'generateCommitment',
        input: ({ context }) => {
          console.log('🔍 [REGISTRATION] preparingCommitment invoke input:', {
            hasPublicClient: !!context.publicClient,
            hasAccountAddress: !!context.accountAddress,
            name: context.name,
          })

          return {
            name: context.name,
            // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
            owner: context.ownerAddress ?? context.accountAddress!,
            duration: context.duration,
            // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
            publicClient: context.publicClient!,
            selectedToken: context.selectedToken,
            // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
            resolverAddress: context.resolverAddress!,
          }
        },
        onDone: {
          target: 'committingTransaction',
          actions: assign({
            commitment: ({ event }) => event.output,
          }),
        },
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
              retryTarget: () => 'committingTransaction' as const,
            }),
            ({ event }) => {
              console.error(
                '❌ [REGISTRATION] Commitment preparation failed:',
                event.error,
              )
            },
          ],
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    committingTransaction: {
      entry: ['logTransition'],
      invoke: {
        src: 'submitCommitment',
        input: ({ context }) => ({
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          commitment: context.commitment!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          signer: context.signer!,
          name: context.name,
          duration: context.duration,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          publicClient: context.publicClient!,
          sponsored: context.sponsored,
          id: REGISTRATION_TX_IDS.commit,
        }),
        onDone: {
          target: 'waitingForCommitment',
          actions: assign({
            commitmentTxId: ({ event }) => event.output,
          }),
        },
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
              retryTarget: () => 'committingTransaction' as const,
            }),
            ({ event }) => {
              console.error(
                '❌ [REGISTRATION] Commitment submission failed:',
                event.error,
              )
            },
          ],
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    waitingForCommitment: {
      entry: ['logTransition'],
      invoke: {
        src: 'pollTransactionStatus',
        // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
        input: ({ context }) => ({ txId: context.commitmentTxId! }),
        onDone: {
          target: 'fetchingCommitmentAge',
        },
        // Receipt polling can fail (timeout / lost tx actor) even after the
        // commitment lands on-chain — especially for the sponsored HCA bundle,
        // where the commit is one call inside `submittingSetupBundle`. Don't
        // surface a false failure and resubmit a standalone `commit` (the
        // registrar rejects an already-recorded commitment, stranding the user
        // in `error`). Instead verify on-chain via `validatingCommitment`: if
        // `commitmentAt` is set we continue, otherwise that state's retry
        // resubmits the correct (signer-aware) commit path.
        onError: {
          target: 'validatingCommitment',
          actions: ({ event }) => {
            console.warn(
              '⚠️ [REGISTRATION] Commitment receipt polling failed; verifying on-chain before retrying:',
              event.error,
            )
          },
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    fetchingCommitmentAge: {
      entry: ['logTransition'],
      invoke: {
        src: 'readMinCommitmentAge',
        input: ({ context }) => ({
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          publicClient: context.publicClient!,
          // The HCA path committed on the standalone registrar; read ITS
          // cooldown window, not the old deployment's.
          registrarAddress:
            context.signer?.type === 'rhinestone'
              ? hcaRegistrarAddress(context.chainId)
              : undefined,
        }),
        onDone: [
          {
            // Standalone-HCA: the HCA was funded pre-commit and pays the
            // registrar from its own balance in the reveal batch — no
            // allowance/permit step after the cooldown.
            guard: 'isRhinestoneSigner',
            target: 'commitmentCooldown',
            actions: assign({
              registerReadyTimestamp: ({ event }) => {
                const minAgeSeconds = Number(event.output as bigint)
                return Date.now() + minAgeSeconds * 1000
              },
            }),
          },
          {
            target: 'checkingAllowance',
            actions: assign({
              registerReadyTimestamp: ({ event }) => {
                const minAgeSeconds = Number(event.output as bigint)
                return Date.now() + minAgeSeconds * 1000
              },
            }),
          },
        ],
        onError: [
          // Fall back to the default cooldown so registration can still
          // proceed even if the read fails.
          {
            guard: 'isRhinestoneSigner',
            target: 'commitmentCooldown',
            actions: 'setFallbackRegisterReadyTimestamp',
          },
          {
            target: 'checkingAllowance',
            actions: 'setFallbackRegisterReadyTimestamp',
          },
        ],
      },
      on: {
        CANCEL: 'idle',
      },
    },

    validatingCommitment: {
      entry: ['logTransition'],
      invoke: {
        src: 'validateCommitment',
        input: ({ context }) => ({
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          commitment: context.commitment!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          publicClient: context.publicClient!,
          registrarAddress:
            context.signer?.type === 'rhinestone'
              ? hcaRegistrarAddress(context.chainId)
              : undefined,
        }),
        onDone: [
          // The commitment is confirmed on-chain; HCA needs no allowance step.
          { guard: 'isRhinestoneSigner', target: 'commitmentCooldown' },
          { target: 'checkingAllowance' },
        ],
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
              // The commitment never landed, so resubmit it — but via the path
              // that originally produced it. The HCA flow commits inside the
              // session-signed `submittingSetupBundle` (fund + enable +
              // commit), so it must re-run the whole request with a fresh
              // commitment (the batch is atomic: a revert leaves the permit
              // unconsumed, so it is safely reused). Pure-EOA commits
              // standalone, so it retries `committingTransaction`.
              retryTarget: ({ context }) =>
                context.signer?.type === 'rhinestone'
                  ? ('submittingSetupBundle' as const)
                  : ('committingTransaction' as const),
            }),
            ({ event }) => {
              console.error(
                '❌ [REGISTRATION] Commitment validation failed:',
                event.error,
              )
            },
          ],
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    commitmentCooldown: {
      entry: ['logTransition'],
      invoke: {
        src: 'waitAfterCommitment',
        input: ({ context }) => {
          // Wait until the wall-clock (or dev time-travel) clock reaches this
          // timestamp. If it's missing (for example after restoring an older
          // snapshot), fall back to now so we don't reintroduce an artificial
          // cooldown when the commitment is already old enough on-chain.
          const targetMs = context.registerReadyTimestamp ?? Date.now()
          return { targetMs }
        },
        onDone: [
          {
            // Standalone-HCA: cooldown elapsed → session-signed reveal batch
            // (price re-read inside the actor). No wallet prompt.
            guard: 'isRhinestoneSigner',
            target: 'submittingRhinestoneBundle',
          },
          { target: 'registeringDomain' },
        ],
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) => event.error as Error,
            retryTarget: ({ context }) =>
              context.signer?.type === 'rhinestone'
                ? ('submittingSetupBundle' as const)
                : ('committingTransaction' as const),
          }),
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    submittingRhinestoneBundle: {
      entry: ['logTransition', 'clearRegisterReadyTimestamp'],
      invoke: {
        src: 'submitRevealBatch',
        input: ({ context }) => ({
          name: context.name,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          wallet: context.ownerAddress ?? context.accountAddress!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          hca: context.accountAddress!,
          duration: context.duration,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          secret: context.commitment!.secret,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          signer: context.signer!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          publicClient: context.publicClient!,
          primaryName: context.primaryName,
          id: REGISTRATION_TX_IDS.register,
        }),
        onDone: {
          target: 'waitingForRhinestoneBundle',
          actions: assign({
            registrationTxId: ({ event }) => event.output,
          }),
        },
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
              retryTarget: () => 'submittingRhinestoneBundle' as const,
            }),
            ({ event }) => {
              console.error(
                '❌ [REGISTRATION] Reveal batch submission failed:',
                event.error,
              )
            },
          ],
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    waitingForRhinestoneBundle: {
      entry: ['logTransition'],
      invoke: {
        src: 'pollTransactionStatus',
        // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
        input: ({ context }) => ({ txId: context.registrationTxId! }),
        onDone: 'success',
        // Receipt polling can flake after the reveal actually landed. Check
        // the registry before declaring failure — the user may already own
        // the name.
        onError: {
          target: 'verifyingRegistration',
          actions: assign({
            error: ({ event }) => event.error as Error,
          }),
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    checkingAllowance: {
      entry: ['logTransition'],
      invoke: {
        src: 'readPaymentTokenAllowance',
        input: ({ context }) => ({
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          owner: context.ownerAddress ?? context.accountAddress!,
          selectedToken: context.selectedToken,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          publicClient: context.publicClient!,
        }),
        onDone: [
          {
            // Skip payment authorization entirely when the registrar already
            // has enough allowance for this registration's price (e.g. a prior
            // max permit/approve). The EOA signs nothing extra.
            guard: ({ context, event }) => {
              const allowance = event.output as bigint
              return allowance >= context.tokenPrice
            },
            target: 'commitmentCooldown',
          },
          // Pure-EOA: a bare EOA can't batch or sponsor, so it sets the
          // allowance with a plain on-chain `approve`. (The HCA path never
          // reaches this state — it funds pre-commit and pays from the HCA.)
          { target: 'approvingToken' },
        ],
        // If the read fails, fall back to authorizing rather than blocking.
        onError: { target: 'approvingToken' },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    approvingToken: {
      entry: ['logTransition'],
      invoke: {
        src: 'submitApproval',
        input: ({ context }) => ({
          tokenPrice: context.tokenPrice,
          selectedToken: context.selectedToken,
          // The registrar pulls the payment token from the name owner (the
          // EOA), so the approve must be signed by the EOA. Use the dedicated
          // EOA `approvalSigner` when provided (HCA flows); otherwise fall back
          // to the main signer (pure-EOA flows already sign with the EOA).
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          signer: context.approvalSigner ?? context.signer!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          publicClient: context.publicClient!,
          // EOA approve is a normal (non-sponsored) tx — the EOA pays gas.
          sponsored: false,
          id: REGISTRATION_TX_IDS.approve,
        }),
        onDone: {
          target: 'waitingForApproval',
          actions: assign({
            approvalTxId: ({ event }) => event.output,
          }),
        },
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
              retryTarget: () => 'approvingToken' as const,
            }),
            ({ event }) => {
              console.error(
                '❌ [REGISTRATION] Token approval submission failed:',
                event.error,
              )
            },
          ],
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    waitingForApproval: {
      entry: ['logTransition'],
      invoke: {
        src: 'pollTransactionStatus',
        // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
        input: ({ context }) => ({ txId: context.approvalTxId! }),
        onDone: 'commitmentCooldown',
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
              retryTarget: () => 'approvingToken' as const,
            }),
            ({ event }) => {
              console.error(
                '❌ [REGISTRATION] Token approval transaction failed:',
                event.error,
              )
            },
          ],
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    registeringDomain: {
      entry: ['logTransition'],
      invoke: {
        src: 'submitRegistration',
        input: ({ context }) => ({
          name: context.name,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          commitment: context.commitment!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          signer: context.signer!,
          duration: context.duration,
          selectedToken: context.selectedToken,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          owner: context.ownerAddress ?? context.accountAddress!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          publicClient: context.publicClient!,
          sponsored: context.sponsored,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          resolverAddress: context.resolverAddress!,
          id: REGISTRATION_TX_IDS.register,
        }),
        onDone: {
          target: 'waitingForRegistration',
          actions: assign({
            registrationTxId: ({ event }) => event.output,
          }),
        },
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
              retryTarget: () => 'registeringDomain' as const,
            }),
            ({ event }) => {
              console.error(
                '❌ [REGISTRATION] Registration submission failed:',
                event.error,
              )
            },
          ],
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    waitingForRegistration: {
      entry: ['logTransition'],
      invoke: {
        src: 'pollTransactionStatus',
        // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
        input: ({ context }) => ({ txId: context.registrationTxId! }),
        onDone: 'success',
        // If the poll fails (wallet flake, retry storm, persistence loss…)
        // fall back to a fresh on-chain check before declaring the flow
        // failed. The user may have already paid for and received the name.
        onError: {
          target: 'verifyingRegistration',
          actions: assign({
            error: ({ event }) => event.error as Error,
          }),
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    verifyingRegistration: {
      entry: ['logTransition'],
      invoke: {
        src: 'verifyRegistration',
        input: ({ context }) => ({
          mode:
            context.signer?.type === 'rhinestone'
              ? ('hca' as const)
              : ('eoa' as const),
          name: context.name,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          owner: context.ownerAddress ?? context.accountAddress!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          hca: context.accountAddress!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          resolverAddress: context.resolverAddress!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          publicClient: context.publicClient!,
        }),
        onDone: [
          {
            guard: ({ event }) => event.output.verified,
            target: 'success',
            actions: assign({
              error: () => undefined,
            }),
          },
          {
            target: 'error',
            actions: [
              assign({
                retryTarget: ({ context }) =>
                  context.signer?.type === 'rhinestone'
                    ? ('submittingRhinestoneBundle' as const)
                    : ('registeringDomain' as const),
              }),
              ({ context }) => {
                console.error(
                  '❌ [REGISTRATION] Registration not present on-chain after fallback check:',
                  context.error,
                )
              },
            ],
          },
        ],
        onError: {
          target: 'error',
          actions: [
            assign({
              retryTarget: ({ context }) =>
                context.signer?.type === 'rhinestone'
                  ? ('submittingRhinestoneBundle' as const)
                  : ('registeringDomain' as const),
            }),
            ({ event }) => {
              console.error(
                '❌ [REGISTRATION] Registration transaction failed:',
                event.error,
              )
            },
          ],
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    success: {
      // Not `type: 'final'` so `CANCEL` can return to `idle` for a new registration
      // (e.g. register-v2 after another name); `START_REGISTRATION` only runs from `idle`.
      entry: ['logTransition', 'logRegistrationDuration', 'clearSnapshot'],
      on: {
        CANCEL: {
          target: 'idle',
        },
      },
    },

    error: {
      entry: [
        'logTransition',
        'logRegistrationFailureDuration',
        ({ context }) => {
          console.error('❌ [REGISTRATION MACHINE] Entered error state:', {
            error: context.error?.message,
            errorName: context.error?.name,
            errorStack: context.error?.stack,
            registrationTxId: context.registrationTxId,
            approvalTxId: context.approvalTxId,
            commitmentTxId: context.commitmentTxId,
          })
        },
      ],
      on: {
        RETRY: [
          {
            guard: ({ context }) => context.retryTarget === 'registeringDomain',
            target: 'registeringDomain',
            actions: assign(({ context }) => ({
              ...context,
              error: undefined,
              retryTarget: undefined,
              registrationTxId: undefined,
            })),
          },
          {
            guard: ({ context }) =>
              context.retryTarget === 'signingFundingPermit',
            // Re-check the HCA balance first: a prior attempt may have funded
            // the HCA already (skip the permit) and a fresh permit signature
            // is needed otherwise.
            target: 'checkingHcaFunding',
            actions: assign(({ context }) => ({
              ...context,
              error: undefined,
              retryTarget: undefined,
              permit: undefined,
              registrationTxId: undefined,
            })),
          },
          {
            guard: ({ context }) =>
              context.retryTarget === 'submittingRhinestoneBundle',
            // Re-submit the reveal batch: the actor re-reads the CURRENT price
            // and re-checks resolver deployment, so a stale quote or transient
            // relayer failure self-heals.
            target: 'submittingRhinestoneBundle',
            actions: assign(({ context }) => ({
              ...context,
              error: undefined,
              retryTarget: undefined,
              registrationTxId: undefined,
            })),
          },
          {
            guard: ({ context }) => context.retryTarget === 'approvingToken',
            target: 'approvingToken',
            actions: assign(({ context }) => ({
              ...context,
              error: undefined,
              retryTarget: undefined,
              approvalTxId: undefined,
              registrationTxId: undefined,
            })),
          },
          {
            guard: ({ context }) =>
              context.retryTarget === 'committingTransaction',
            target: 'committingTransaction',
            actions: assign(({ context }) => ({
              ...context,
              error: undefined,
              retryTarget: undefined,
              commitmentTxId: undefined,
              approvalTxId: undefined,
              registrationTxId: undefined,
              registerReadyTimestamp: undefined,
            })),
          },
          {
            guard: ({ context }) =>
              context.retryTarget === 'submittingSetupBundle',
            target: 'submittingSetupBundle',
            // Re-run the whole commit request: a fresh secret + commitment are
            // generated, so clear any partial setup state. The funding permit
            // is KEPT — the atomic batch reverted, so the permit's nonce is
            // unconsumed and it is safely reused.
            actions: assign(({ context }) => ({
              ...context,
              error: undefined,
              retryTarget: undefined,
              resolverAddress: undefined,
              resolverTxId: undefined,
              resolverSalt: undefined,
              commitment: undefined,
              commitmentTxId: undefined,
              registerReadyTimestamp: undefined,
            })),
          },
          {
            target: 'deployingResolver',
            actions: assign(({ context }) => ({
              ...context,
              error: undefined,
              retryTarget: undefined,
              resolverAddress: undefined,
              resolverTxId: undefined,
              resolverSalt: undefined,
              commitment: undefined,
              commitmentTxId: undefined,
              approvalTxId: undefined,
              registrationTxId: undefined,
              registerReadyTimestamp: undefined,
            })),
          },
        ],
        CANCEL: 'idle',
      },
    },
  },
})

// TODO: Add persistence wrapper with inspect option
// const savedSnapshot = await persistenceService.loadRegistrationSnapshot()
// export const registrationMachine = savedSnapshot
//   ? baseMachine.provide({ snapshot: savedSnapshot })
