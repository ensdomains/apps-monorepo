import { fromResultAsync } from '@ens-apps/utils/xstate/neverthrow'
import type { Address, Hash, Hex, PublicClient } from 'viem'
import { assign, fromPromise, setup } from 'xstate'
import * as auditTrail from '../../services/audit-trail.service'
import type { Signer } from '../../types/signer.types'
import {
  authorizedPaymentAmount,
  ensureHcaDeployedActor,
  generateCommitmentActor,
  type PermitSignature,
  pollTransactionStatusActor,
  readMinCommitmentAgeActor,
  readPaymentTokenAllowanceActor,
  resolveResolverDeploymentActor,
  signPermitActor,
  submitApprovalActor,
  submitCommitmentActor,
  submitPermitAndRegistrationActor,
  submitRegistrationActor,
  submitResolverAndCommitmentActor,
  submitResolverDeploymentActor,
  validateCommitmentActor,
  verifyRegistrationActor,
} from './registration.actors'

/**
 * Registration Machine
 *
 * Orchestrates the ENS registration flow:
 * 1. Deploy dedicated resolver
 * 2. Generate commitment
 * 3. Submit commitment transaction
 * 4. Wait for commitment confirmation
 * 5. Approve token spend
 * 6. Wait for approval confirmation
 * 7. Submit registration transaction
 * 8. Wait for registration confirmation
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
   * EOA signer used ONLY to produce the EIP-2612 permit signature. The ENS
   * registrar pulls the payment token from the name owner (the EOA), so the
   * allowance must be authorized by the EOA — and `permit` lets the EOA do that
   * with an OFF-CHAIN signature (gasless, no tx). The signed permit is then
   * carried inside the sponsored rhinestone bundle alongside `register`, so the
   * EOA never sends a transaction or needs ETH. Everything else stays on the
   * sponsored rhinestone `signer`.
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

  // Flow state
  resolverTxId?: string
  resolverSalt?: bigint
  resolverAddress?: Address
  commitment?: CommitmentData
  commitmentTxId?: string
  /**
   * Signed EIP-2612 permit (rhinestone flow). Set in `signingPermit` and
   * carried into the sponsored permit+register bundle. Absent on the pure-EOA
   * path (which uses an on-chain `approve`) and when allowance already covers
   * the price.
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
    | 'ensuringHcaDeployed'
    | 'committingTransaction'
    | 'signingPermit'
    | 'approvingToken'
    | 'registeringDomain'
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
       * Optional EOA signer used to sign the EIP-2612 permit (rhinestone/HCA
       * flows). See `RegistrationContext.approvalSigner`. Omit for pure-EOA
       * flows (which use a plain on-chain `approve`).
       */
      approvalSigner?: Signer
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
    ensureHcaDeployed: fromResultAsync((input: { signer: Signer }) => {
      return ensureHcaDeployedActor(input)
    }),
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
    submitResolverAndCommitment: fromResultAsync(
      (input: {
        name: string
        owner: Address
        resolverOwner: Address
        duration: bigint
        selectedToken: 'USDC' | 'DAI'
        signer: Signer
        publicClient: PublicClient
        sponsored?: boolean
        id?: string
      }) => {
        return submitResolverAndCommitmentActor(input)
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
    signPermit: fromResultAsync(
      (input: {
        owner: Address
        selectedToken: 'USDC' | 'DAI'
        value: bigint
        approvalSigner: Signer
        publicClient: PublicClient
      }) => {
        return signPermitActor(input)
      },
    ),
    submitPermitAndRegistration: fromResultAsync(
      (input: {
        permit: PermitSignature
        selectedToken: 'USDC' | 'DAI'
        name: string
        commitment: CommitmentData
        signer: Signer
        duration: bigint
        owner: Address
        publicClient: PublicClient
        sponsored?: boolean
        resolverAddress: Address
        id?: string
      }) => {
        return submitPermitAndRegistrationActor(input)
      },
    ),
    pollTransactionStatus: fromResultAsync((input: { txId: string }) => {
      return pollTransactionStatusActor(input)
    }),
    waitAfterCommitment: fromPromise(
      async ({ input }: { input: { delayMs: number } }) => {
        const safeDelay = Math.max(0, input.delayMs)
        await new Promise<void>((resolve) => setTimeout(resolve, safeDelay))
      },
    ),
    validateCommitment: fromResultAsync(
      (input: { commitment: CommitmentData; publicClient: PublicClient }) => {
        return validateCommitmentActor(input)
      },
    ),
    readMinCommitmentAge: fromResultAsync(
      (input: { publicClient: PublicClient }) => {
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
        name: string
        owner: Address
        resolverAddress: Address
        publicClient: PublicClient
      }) => {
        return verifyRegistrationActor(input)
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

    recordTransition: ({ context, self, event }) => {
      try {
        const state = self.getSnapshot()
        auditTrail.recordTransition({
          machineId: 'registration',
          fromState:
            state.status === 'active' ? String(state.value) : 'unknown',
          toState: String(state.value),
          event: event?.type || 'unknown',
          context: {
            name: context.name,
            duration: context.duration.toString(),
            resolverTxId: context.resolverTxId,
            resolverAddress: context.resolverAddress,
            commitmentTxId: context.commitmentTxId,
            approvalTxId: context.approvalTxId,
            registrationTxId: context.registrationTxId,
          },
          metadata: {
            chainId: context.chainId,
          },
        })
      } catch (auditError) {
        console.warn('Audit service error (non-fatal):', auditError)
      }
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
          // Rhinestone/HCA: deploy the resolver and commit in ONE sponsored
          // Intent (resolver address is predicted, so no need to wait for the
          // deploy to mine; the HCA deploys inline on this first Intent). This
          // is the single-signature setup path.
          guard: 'isRhinestoneSigner',
          target: 'submittingSetupBundle',
        },
        // Pure-EOA: an EOA can't batch, so deploy the resolver, wait for it,
        // then commit as separate transactions.
        { target: 'deployingResolver' },
      ],
    },

    submittingSetupBundle: {
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'submitResolverAndCommitment',
        input: ({ context }) => ({
          name: context.name,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          owner: context.ownerAddress ?? context.accountAddress!,
          // The resolver's EACL grantee must be the address the resolver sees at
          // write time (EOA after SCA→EOA unwrap). Mirrors `deployingResolver`.
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          resolverOwner:
            context.resolverOwnerAddress ??
            context.ownerAddress ??
            context.accountAddress!,
          duration: context.duration,
          selectedToken: context.selectedToken,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          signer: context.signer!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          publicClient: context.publicClient!,
          sponsored: context.sponsored,
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
                '❌ [REGISTRATION] Resolver+commitment bundle failed:',
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
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'deployResolver',
        input: ({ context }) => ({
          name: context.name,
          // Resolver init grants EACL roles to this address. The dedicated
          // resolver unwraps SCA→EOA at write time, so the grantee must be the
          // EOA (not the SCA) or `setText`/etc. will revert with
          // EACUnauthorizedAccountRoles. See discussion in this file's history.
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          owner:
            context.resolverOwnerAddress ??
            context.ownerAddress ??
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
      entry: ['logTransition', 'recordTransition'],
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
      entry: ['logTransition', 'recordTransition'],
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
          target: 'ensuringHcaDeployed',
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

    ensuringHcaDeployed: {
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'ensureHcaDeployed',
        input: ({ context }) => ({
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          signer: context.signer!,
        }),
        onDone: {
          target: 'committingTransaction',
        },
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
              retryTarget: () => 'ensuringHcaDeployed' as const,
            }),
            ({ event }) => {
              console.error(
                '❌ [REGISTRATION] HCA deployment failed:',
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
      entry: ['logTransition', 'recordTransition'],
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
      entry: ['logTransition', 'recordTransition'],
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
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'readMinCommitmentAge',
        input: ({ context }) => ({
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          publicClient: context.publicClient!,
        }),
        onDone: {
          target: 'checkingAllowance',
          actions: assign({
            registerReadyTimestamp: ({ event }) => {
              const minAgeSeconds = Number(event.output as bigint)
              return Date.now() + minAgeSeconds * 1000
            },
          }),
        },
        onError: {
          // Fall back to the default cooldown so registration can still
          // proceed even if the read fails.
          target: 'checkingAllowance',
          actions: 'setFallbackRegisterReadyTimestamp',
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    validatingCommitment: {
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'validateCommitment',
        input: ({ context }) => ({
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          commitment: context.commitment!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          publicClient: context.publicClient!,
        }),
        onDone: {
          target: 'checkingAllowance',
        },
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
              // The commitment never landed, so resubmit it — but via the path
              // that originally produced it. The HCA flow commits inside the
              // sponsored `submittingSetupBundle` (resolver-deploy + commit), so
              // it must re-run the whole bundle with a fresh commitment; a
              // standalone `committingTransaction` would be the wrong path (and
              // is rejected if the prior commitment did land). Pure-EOA commits
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
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'waitAfterCommitment',
        input: ({ context }) => {
          // If the ready timestamp is missing (for example after restoring an
          // older snapshot), do not reintroduce an artificial cooldown when the
          // commitment has already been validated as old enough on-chain.
          const targetTimestamp = context.registerReadyTimestamp ?? Date.now()
          const delayMs = Math.max(0, targetTimestamp - Date.now())
          return { delayMs }
        },
        onDone: [
          {
            // A signed permit means the rhinestone path: submit permit+register
            // as one sponsored bundle.
            guard: ({ context }) => !!context.permit,
            target: 'submittingRhinestoneBundle',
          },
          { target: 'registeringDomain' },
        ],
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) => event.error as Error,
            retryTarget: () => 'committingTransaction' as const,
          }),
        },
      },
      on: {
        CANCEL: 'idle',
      },
    },

    submittingRhinestoneBundle: {
      entry: [
        'logTransition',
        'recordTransition',
        'clearRegisterReadyTimestamp',
      ],
      invoke: {
        src: 'submitPermitAndRegistration',
        input: ({ context }) => ({
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          permit: context.permit!,
          selectedToken: context.selectedToken,
          name: context.name,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          commitment: context.commitment!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          signer: context.signer!,
          duration: context.duration,
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
              retryTarget: () => 'signingPermit' as const,
            }),
            ({ event }) => {
              console.error(
                '❌ [REGISTRATION] Permit+register bundle submission failed:',
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
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'pollTransactionStatus',
        // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
        input: ({ context }) => ({ txId: context.registrationTxId! }),
        onDone: 'success',
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
              retryTarget: () => 'signingPermit' as const,
            }),
            ({ event }) => {
              console.error(
                '❌ [REGISTRATION] Permit+register bundle failed:',
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

    checkingAllowance: {
      entry: ['logTransition', 'recordTransition'],
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
          {
            // Rhinestone/HCA: authorize via a gasless EIP-2612 permit signed by
            // the EOA and carried into the sponsored bundle. No EOA tx.
            guard: 'isRhinestoneSigner',
            target: 'signingPermit',
          },
          // Pure-EOA fallback: a bare EOA can't batch or sponsor, so it sets the
          // allowance with a plain on-chain `approve`.
          { target: 'approvingToken' },
        ],
        onError: [
          {
            // If the read fails, fall back to authorizing rather than blocking.
            guard: 'isRhinestoneSigner',
            target: 'signingPermit',
          },
          { target: 'approvingToken' },
        ],
      },
      on: {
        CANCEL: 'idle',
      },
    },

    signingPermit: {
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'signPermit',
        input: ({ context }) => ({
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          owner: context.ownerAddress ?? context.accountAddress!,
          selectedToken: context.selectedToken,
          // Authorize only what this registration needs — NOT an unlimited
          // allowance. See `authorizedPaymentAmount` for the headroom rationale.
          value: authorizedPaymentAmount(context.tokenPrice),
          // The registrar pulls payment from the name owner (the EOA), so the
          // permit MUST be signed by the EOA. Use the dedicated EOA
          // `approvalSigner`; the rhinestone HCA can't produce a permit.
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          approvalSigner: context.approvalSigner ?? context.signer!,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          publicClient: context.publicClient!,
        }),
        onDone: {
          target: 'commitmentCooldown',
          actions: assign({
            permit: ({ event }) => event.output,
          }),
        },
        onError: {
          target: 'error',
          actions: [
            assign({
              error: ({ event }) => event.error as Error,
              retryTarget: () => 'signingPermit' as const,
            }),
            ({ event }) => {
              console.error(
                '❌ [REGISTRATION] Permit signing failed:',
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

    approvingToken: {
      entry: ['logTransition', 'recordTransition'],
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
      entry: ['logTransition', 'recordTransition'],
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
      entry: ['logTransition', 'recordTransition'],
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
      entry: ['logTransition', 'recordTransition'],
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
      entry: ['logTransition', 'recordTransition'],
      invoke: {
        src: 'verifyRegistration',
        input: ({ context }) => ({
          name: context.name,
          // biome-ignore lint/style/noNonNullAssertion: value guaranteed by machine state
          owner: context.ownerAddress ?? context.accountAddress!,
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
                retryTarget: () => 'registeringDomain' as const,
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
              retryTarget: () => 'registeringDomain' as const,
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
      entry: [
        'logTransition',
        'recordTransition',
        'logRegistrationDuration',
        'clearSnapshot',
      ],
      on: {
        CANCEL: {
          target: 'idle',
        },
      },
    },

    error: {
      entry: [
        'logTransition',
        'recordTransition',
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
            guard: ({ context }) => context.retryTarget === 'signingPermit',
            // Re-read allowance first: a prior attempt may have landed (skip to
            // register) and a fresh permit signature is needed otherwise.
            target: 'checkingAllowance',
            actions: assign(({ context }) => ({
              ...context,
              error: undefined,
              retryTarget: undefined,
              permit: undefined,
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
              context.retryTarget === 'ensuringHcaDeployed',
            target: 'ensuringHcaDeployed',
            actions: assign(({ context }) => ({
              ...context,
              error: undefined,
              retryTarget: undefined,
            })),
          },
          {
            guard: ({ context }) =>
              context.retryTarget === 'submittingSetupBundle',
            target: 'submittingSetupBundle',
            // Re-run the whole bundle: a fresh resolver salt/address and a new
            // commitment are generated, so clear any partial setup state.
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
