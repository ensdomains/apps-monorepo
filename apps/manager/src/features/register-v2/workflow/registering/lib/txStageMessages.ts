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
      stageLabel: string
      stageDescription?: string
      progress: number
    }>()
    .with({ stage: 'idle' }, () => ({
      stageLabel: 'Idle',
      stageDescription: 'The registration flow is idle',
      progress: 0,
    }))
    .with({ stage: 'deployingResolver' }, () => ({
      stageLabel: 'Deploying resolver',
      stageDescription: 'Deploying the resolver',
      progress: 8,
    }))
    .with(
      { stage: 'waitingForResolverDeployment', txState: 'submitting' },
      () => ({
        stageLabel: 'Waiting for resolver submission',
        progress: 10,
      }),
    )
    .with(
      { stage: 'waitingForResolverDeployment', txState: 'pending' },
      () => ({
        stageLabel: 'Waiting for resolver deployment',
        stageDescription: 'Waiting for the resolver deployment',
        progress: 15,
      }),
    )
    .with({ stage: 'preparingCommitment' }, () => ({
      stageLabel: 'Preparing commitment',
      stageDescription: 'Preparing the commitment',
      progress: 23,
    }))
    .with({ stage: 'committingTransaction' }, () => ({
      stageLabel: 'Submitting commitment transaction',
      stageDescription: 'Submitting the commitment transaction',
      progress: 31,
    }))
    .with({ stage: 'waitingForCommitment', txState: 'submitting' }, () => ({
      stageLabel: 'Waiting for commitment submission',
      progress: 31,
    }))
    .with({ stage: 'waitingForCommitment', txState: 'pending' }, () => ({
      stageLabel: 'Waiting for commitment receipt',
      progress: 35,
    }))
    .with({ stage: 'waitingForCommitment' }, () => ({
      stageLabel: 'Waiting for commitment confirmation',
      stageDescription: 'Waiting for the commitment confirmation',
      progress: 38,
    }))
    .with({ stage: 'validatingCommitment' }, () => ({
      stageLabel: 'Validating commitment',
      stageDescription: 'Validating the commitment',
      progress: 46,
    }))
    .with({ stage: 'approvingToken' }, () => ({
      stageLabel: 'Approving payment token',
      stageDescription: 'Approving the payment token',
      progress: 54,
    }))
    .with({ stage: 'waitingForApproval' }, () => ({
      stageLabel: 'Waiting for approval confirmation',
      stageDescription: 'Waiting for the approval confirmation',
      progress: 62,
    }))
    .with({ stage: 'registeringDomain' }, () => ({
      stageLabel: 'Submitting registration transaction',
      stageDescription: 'Submitting the registration transaction',
      progress: 77,
    }))
    .with({ stage: 'waitingForRegistration' }, () => ({
      stageLabel: 'Waiting for registration confirmation',
      stageDescription: 'Waiting for the registration confirmation',
      progress: 90,
    }))
    .with({ stage: 'success' }, () => ({
      stageLabel: 'Registration complete',
      stageDescription: 'Registration complete',
      progress: 100,
    }))
    .with({ stage: 'error' }, () => ({
      stageLabel: 'Registration failed',
      stageDescription: 'Registration failed',
      progress: 0,
    }))
    .otherwise(() => ({
      stageLabel: 'Registration in progress',
      stageDescription: 'Registration in progress',
      progress: 0,
    }))
