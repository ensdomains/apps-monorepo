import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { match } from 'ts-pattern'

export type RegisteringTxSnapshot = {
  value: string
  resolverTxId?: string
  commitmentTxId?: string
  approvalTxId?: string
  registrationTxId?: string
  voucherOrderId?: string
  voucherMintTxId?: string
  /** Backend fulfilment phase (ui-machine context), voucher path only. */
  voucherPhase?: string
}

export type TransactionState = string | undefined

export type StageMessages = {
  stageLabel: MessageDescriptor
  stageDescription?: MessageDescriptor
}

export const getRegistrationStageMessages = (
  tx: RegisteringTxSnapshot,
  txState: TransactionState,
): StageMessages =>
  match({ stage: tx.value, txState, voucherPhase: tx.voucherPhase })
    .returnType<StageMessages>()
    .with({ stage: 'idle' }, () => ({
      stageLabel: msg`Idle`,
      stageDescription: msg`The registration flow is idle`,
    }))
    .with({ stage: 'settingUpRegistration' }, () => ({
      stageLabel: msg`Setting up registration`,
      stageDescription: msg`Preparing your registration`,
    }))
    .with({ stage: 'deployingResolver' }, () => ({
      stageLabel: msg`Deploying resolver`,
      stageDescription: msg`Deploying the resolver`,
    }))
    .with(
      { stage: 'waitingForResolverDeployment', txState: 'submitting' },
      () => ({
        stageLabel: msg`Waiting for resolver submission`,
      }),
    )
    .with(
      { stage: 'waitingForResolverDeployment', txState: 'pending' },
      () => ({
        stageLabel: msg`Waiting for resolver deployment`,
        stageDescription: msg`Waiting for the resolver deployment`,
      }),
    )
    .with({ stage: 'preparingCommitment' }, () => ({
      stageLabel: msg`Preparing commitment`,
      stageDescription: msg`Preparing the commitment`,
    }))
    .with({ stage: 'committingTransaction' }, () => ({
      stageLabel: msg`Submitting commitment transaction`,
      stageDescription: msg`Submitting the commitment transaction`,
    }))
    .with({ stage: 'waitingForCommitment', txState: 'submitting' }, () => ({
      stageLabel: msg`Waiting for commitment submission`,
    }))
    .with({ stage: 'waitingForCommitment', txState: 'pending' }, () => ({
      stageLabel: msg`Waiting for commitment receipt`,
    }))
    .with({ stage: 'waitingForCommitment' }, () => ({
      stageLabel: msg`Waiting for commitment confirmation`,
      stageDescription: msg`Waiting for the commitment confirmation`,
    }))
    .with({ stage: 'fetchingCommitmentAge' }, () => ({
      stageLabel: msg`Reading commitment window`,
      stageDescription: msg`Reading the commit-reveal window from the registrar`,
    }))
    .with({ stage: 'commitmentCooldown' }, () => ({
      stageLabel: msg`Waiting for commitment cooldown`,
      stageDescription: msg`The registrar requires a short wait between commit and register`,
    }))
    .with({ stage: 'validatingCommitment' }, () => ({
      stageLabel: msg`Validating commitment`,
      stageDescription: msg`Validating the commitment`,
    }))
    .with({ stage: 'checkingAllowance' }, () => ({
      stageLabel: msg`Checking token allowance`,
      stageDescription: msg`Checking whether a payment approval is needed`,
    }))
    .with({ stage: 'signingPermit' }, () => ({
      stageLabel: msg`Approve payment`,
      stageDescription: msg`Sign the gasless payment approval in your wallet`,
    }))
    .with({ stage: 'submittingRhinestoneBundle' }, () => ({
      stageLabel: msg`Submitting approval and registration`,
      stageDescription: msg`Authorizing payment and registering your name`,
    }))
    .with(
      { stage: 'waitingForRhinestoneBundle', txState: 'submitting' },
      () => ({
        stageLabel: msg`Submitting registration bundle`,
      }),
    )
    .with({ stage: 'waitingForRhinestoneBundle' }, () => ({
      stageLabel: msg`Waiting for registration confirmation`,
      stageDescription: msg`Waiting for the registration transaction`,
    }))
    .with({ stage: 'approvingToken' }, () => ({
      stageLabel: msg`Approving payment token`,
      stageDescription: msg`Approving the payment token`,
    }))
    .with({ stage: 'waitingForApproval' }, () => ({
      stageLabel: msg`Waiting for approval confirmation`,
      stageDescription: msg`Waiting for the approval confirmation`,
    }))
    .with({ stage: 'registeringDomain' }, () => ({
      stageLabel: msg`Submitting registration transaction`,
      stageDescription: msg`Submitting the registration transaction`,
    }))
    .with({ stage: 'waitingForRegistration' }, () => ({
      stageLabel: msg`Waiting for registration confirmation`,
      stageDescription: msg`Waiting for the registration confirmation`,
    }))
    .with({ stage: 'verifyingRegistration' }, () => ({
      stageLabel: msg`Verifying registration on-chain`,
      stageDescription: msg`Confirming the name is now owned by your account`,
    }))
    .with({ stage: 'mintingVoucher' }, () => ({
      stageLabel: msg`Minting voucher`,
      stageDescription: msg`Confirm the payment in your wallet`,
    }))
    .with({ stage: 'waitingForVoucherMint' }, () => ({
      stageLabel: msg`Waiting for payment confirmation`,
      stageDescription: msg`Waiting for the transaction receipt`,
    }))
    // Fulfilment is the long tail (~2-3 min); the copy tracks the real
    // backend phase so the wait reads as movement, not a stall.
    .with({ stage: 'fulfillingRegistration' }, ({ voucherPhase }) =>
      match(voucherPhase)
        .returnType<StageMessages>()
        .with('committing', () => ({
          stageLabel: msg`Committing your registration`,
          stageDescription: msg`Submitting the on-chain commitment for your name`,
        }))
        .with('committed', () => ({
          stageLabel: msg`Security cooldown`,
          stageDescription: msg`Waiting out the on-chain anti-frontrunning delay (about a minute)`,
        }))
        .with('registering', () => ({
          stageLabel: msg`Registering your name`,
          stageDescription: msg`Submitting the final registration transaction`,
        }))
        .otherwise(() => ({
          stageLabel: msg`Completing your registration`,
          stageDescription: msg`Verifying your payment and starting registration`,
        })),
    )
    .with({ stage: 'success' }, () => ({
      stageLabel: msg`Registration complete`,
      stageDescription: msg`Registration complete`,
    }))
    .with({ stage: 'error' }, () => ({
      stageLabel: msg`Registration failed`,
      stageDescription: msg`Registration failed`,
    }))
    .otherwise(() => ({
      stageLabel: msg`Registration in progress`,
      stageDescription: msg`Registration in progress`,
    }))
