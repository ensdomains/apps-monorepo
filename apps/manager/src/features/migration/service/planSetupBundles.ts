import { match } from 'ts-pattern'
import { chunkWalletBundle } from './batchMigrate.constants'
import type { MigrationApproval } from './migrationApprovals'

export type SetupStep =
  | { readonly type: 'deploy-hca' }
  | { readonly type: 'approval'; readonly approval: MigrationApproval }
  /** A planned step a previous attempt already completed. */
  | { readonly type: 'done' }

/**
 * Setup steps in preview order, chunked into the wallet bundles the preview
 * counted. The deployment leads the first bundle.
 */
export const planSetupBundles = (params: {
  readonly isHcaDeployed: boolean
  readonly isDeploymentPlanned: boolean
  /** Planned approvals in preview order, `undefined` once granted. */
  readonly missingApprovals: readonly (MigrationApproval | undefined)[]
}): readonly (readonly SetupStep[])[] => {
  const deployment = match(params)
    .returnType<readonly SetupStep[]>()
    .with({ isHcaDeployed: false }, () => [{ type: 'deploy-hca' }])
    .with({ isDeploymentPlanned: true }, () => [{ type: 'done' }])
    .otherwise(() => [])
  return chunkWalletBundle([
    ...deployment,
    ...params.missingApprovals.map(
      (approval): SetupStep =>
        approval ? { type: 'approval', approval } : { type: 'done' },
    ),
  ])
}
