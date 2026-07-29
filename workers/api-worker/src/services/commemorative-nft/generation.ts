export interface CommemorativeNftGenerationParams {
  readonly chainId: number
  readonly tokenId: string
}

export type GenerationPreparationStatus = 'preparing' | 'unavailable'

export interface GenerationCoordinator {
  prepare(tokenId: string): Promise<GenerationPreparationStatus>
}

export interface CommemorativeNftGenerationBindings {
  readonly COMMEMORATIVE_NFT_GENERATION?: Workflow<CommemorativeNftGenerationParams>
}

type ActiveWorkflowStatus = 'queued' | 'running' | 'waiting' | 'waitingForPause'

const ACTIVE_WORKFLOW_STATUSES = new Set<ActiveWorkflowStatus>([
  'queued',
  'running',
  'waiting',
  'waitingForPause',
])

const getWorkflowInstanceId = (tokenId: string): string =>
  `nft-11155111-${tokenId}-v1`

const activateWorkflowInstance = async (
  instance: WorkflowInstance,
  status: InstanceStatus['status'],
): Promise<boolean> => {
  if (ACTIVE_WORKFLOW_STATUSES.has(status as ActiveWorkflowStatus)) return true

  if (status === 'paused') {
    await instance.resume()
    return true
  }
  if (
    status === 'errored' ||
    status === 'terminated' ||
    status === 'complete'
  ) {
    await instance.restart()
    return true
  }

  return false
}

export const createWorkflowGenerationCoordinator = (
  workflow: Workflow<CommemorativeNftGenerationParams> | undefined,
): GenerationCoordinator => ({
  prepare: async (tokenId) => {
    if (!workflow) return 'unavailable'

    try {
      const instanceId = getWorkflowInstanceId(tokenId)
      try {
        const instance = await workflow.get(instanceId)
        const instanceStatus = await instance.status()
        if (await activateWorkflowInstance(instance, instanceStatus.status)) {
          return 'preparing'
        }
      } catch {
        // Cloudflare throws when get() targets an ID that does not exist.
        // Creation below is also safe when this was a transient lookup error:
        // an existing caller-supplied ID makes create() fail closed.
      }

      try {
        await workflow.create({
          id: instanceId,
          params: { chainId: 11155111, tokenId },
        })
      } catch {
        // Another request can win the caller-supplied ID race between the
        // failed/missing lookup and create(). Re-read before reporting the
        // generation service unavailable.
        const racedInstance = await workflow.get(instanceId)
        const racedStatus = await racedInstance.status()
        if (
          !(await activateWorkflowInstance(racedInstance, racedStatus.status))
        ) {
          return 'unavailable'
        }
      }
      return 'preparing'
    } catch {
      return 'unavailable'
    }
  },
})
