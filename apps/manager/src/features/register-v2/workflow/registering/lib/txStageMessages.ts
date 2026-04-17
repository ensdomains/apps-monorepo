import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { match } from 'ts-pattern'

export type RegisteringTxSnapshot = {
  value: string
  resolverTxId?: string
  commitmentTxId?: string
  approvalTxId?: string
  registrationTxId?: string
}

export type TransactionState = string | undefined

export const getRegistrationStageMessages = (
  tx: RegisteringTxSnapshot,
  txState: TransactionState,
) =>
  match({ stage: tx.value, txState })
    .returnType<{
      stageLabel: MessageDescriptor
      stageDescription?: MessageDescriptor
      progress: number
    }>()
    .with({ stage: 'idle' }, () => ({
      stageLabel: msg`Idle`,
      stageDescription: msg`The registration flow is idle`,
      progress: 0,
    }))
    .with({ stage: 'deployingResolver' }, () => ({
      stageLabel: msg`Deploying resolver`,
      stageDescription: msg`Deploying the resolver`,
      progress: 8,
    }))
    .with(
      { stage: 'waitingForResolverDeployment', txState: 'submitting' },
      () => ({
        stageLabel: msg`Waiting for resolver submission`,
        progress: 10,
      }),
    )
    .with(
      { stage: 'waitingForResolverDeployment', txState: 'pending' },
      () => ({
        stageLabel: msg`Waiting for resolver deployment`,
        stageDescription: msg`Waiting for the resolver deployment`,
        progress: 15,
      }),
    )
    .with({ stage: 'preparingCommitment' }, () => ({
      stageLabel: msg`Preparing commitment`,
      stageDescription: msg`Preparing the commitment`,
      progress: 23,
    }))
    .with({ stage: 'committingTransaction' }, () => ({
      stageLabel: msg`Submitting commitment transaction`,
      stageDescription: msg`Submitting the commitment transaction`,
      progress: 31,
    }))
    .with({ stage: 'waitingForCommitment', txState: 'submitting' }, () => ({
      stageLabel: msg`Waiting for commitment submission`,
      progress: 31,
    }))
    .with({ stage: 'waitingForCommitment', txState: 'pending' }, () => ({
      stageLabel: msg`Waiting for commitment receipt`,
      progress: 35,
    }))
    .with({ stage: 'waitingForCommitment' }, () => ({
      stageLabel: msg`Waiting for commitment confirmation`,
      stageDescription: msg`Waiting for the commitment confirmation`,
      progress: 38,
    }))
    .with({ stage: 'validatingCommitment' }, () => ({
      stageLabel: msg`Validating commitment`,
      stageDescription: msg`Validating the commitment`,
      progress: 46,
    }))
    .with({ stage: 'submittingRhinestoneBundle' }, () => ({
      stageLabel: msg`Submitting approval and registration`,
      stageDescription: msg`Approving the token and registering your name`,
      progress: 55,
    }))
    .with(
      { stage: 'waitingForRhinestoneBundle', txState: 'submitting' },
      () => ({
        stageLabel: msg`Submitting registration bundle`,
        progress: 82,
      }),
    )
    .with({ stage: 'waitingForRhinestoneBundle', txState: 'pending' }, () => ({
      stageLabel: msg`Waiting for registration confirmation`,
      stageDescription: msg`Waiting for the registration transaction`,
      progress: 90,
    }))
    .with({ stage: 'waitingForRhinestoneBundle' }, () => ({
      stageLabel: msg`Waiting for registration confirmation`,
      stageDescription: msg`Waiting for the registration transaction`,
      progress: 88,
    }))
    .with({ stage: 'approvingToken' }, () => ({
      stageLabel: msg`Approving payment token`,
      stageDescription: msg`Approving the payment token`,
      progress: 54,
    }))
    .with({ stage: 'waitingForApproval' }, () => ({
      stageLabel: msg`Waiting for approval confirmation`,
      stageDescription: msg`Waiting for the approval confirmation`,
      progress: 62,
    }))
    .with({ stage: 'registeringDomain' }, () => ({
      stageLabel: msg`Submitting registration transaction`,
      stageDescription: msg`Submitting the registration transaction`,
      progress: 77,
    }))
    .with({ stage: 'waitingForRegistration' }, () => ({
      stageLabel: msg`Waiting for registration confirmation`,
      stageDescription: msg`Waiting for the registration confirmation`,
      progress: 90,
    }))
    .with({ stage: 'success' }, () => ({
      stageLabel: msg`Registration complete`,
      stageDescription: msg`Registration complete`,
      progress: 100,
    }))
    .with({ stage: 'error' }, () => ({
      stageLabel: msg`Registration failed`,
      stageDescription: msg`Registration failed`,
      progress: 0,
    }))
    .otherwise(() => ({
      stageLabel: msg`Registration in progress`,
      stageDescription: msg`Registration in progress`,
      progress: 0,
    }))
