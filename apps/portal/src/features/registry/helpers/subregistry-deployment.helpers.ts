/**
 * Subregistry Deployment Helpers
 *
 * Pure functions for starting and managing subregistry deployments.
 */

import {
  type StartSubregistryDeploymentParams,
  subregistryDeploymentMachine,
} from '@ens-apps/transaction-manager'
import type { ActorRefFrom } from 'xstate'
import { createActor } from 'xstate'

export type SubregistryDeploymentActor = ActorRefFrom<
  typeof subregistryDeploymentMachine
>

/**
 * Start a subregistry deployment operation.
 *
 * Creates and starts the deployment state machine, which orchestrates:
 * 1. Deploy subregistry contract via factory
 * 2. Set subregistry on parent registry
 *
 * @returns The actor reference for subscribing to state changes
 */
export function startSubregistryDeployment(
  params: StartSubregistryDeploymentParams,
): SubregistryDeploymentActor {
  const actor = createActor(subregistryDeploymentMachine, {
    input: { chainId: params.chainId },
  })

  actor.start()

  actor.send({
    type: 'START_DEPLOYMENT',
    name: params.name,
    factoryAddress: params.factoryAddress,
    implAddress: params.implAddress,
    parentRegistry: params.parentRegistry,
    signer: params.signer,
    publicClient: params.publicClient,
    walletClient: params.walletClient,
    chainId: params.chainId,
  })

  return actor
}
