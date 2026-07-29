import { KV_KEY } from '#core/kv/index.js'

export interface CommemorativeNftGenerationParams {
  readonly chainId: number
  readonly tokenId: string
}

export const GENERATION_ADMISSION_WINDOW_SECONDS = 60 * 60

export type GenerationPreparationStatus =
  | 'preparing'
  | 'rate-limited'
  | 'unavailable'

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

export const createKvGenerationAdmission = (
  kv: KVNamespace,
): ((tokenId: string) => Promise<boolean>) => {
  return async (tokenId) => {
    const key = KV_KEY.COMMEMORATIVE_NFT.GENERATION_ADMISSION(tokenId)
    if (await kv.get(key)) return false

    // KV admission is intentionally token-scoped: deterministic Workflow IDs
    // prevent parallel creation, while this cooldown prevents public requests
    // from repeatedly restarting the same terminal Workflow.
    await kv.put(key, Date.now().toString(), {
      expirationTtl: GENERATION_ADMISSION_WINDOW_SECONDS,
    })
    return true
  }
}

const activateWorkflowInstance = async (
  instance: WorkflowInstance,
  status: InstanceStatus['status'],
  admit: () => Promise<boolean>,
): Promise<GenerationPreparationStatus> => {
  if (ACTIVE_WORKFLOW_STATUSES.has(status as ActiveWorkflowStatus)) {
    return 'preparing'
  }

  if (status === 'paused') {
    if (!(await admit())) return 'rate-limited'
    await instance.resume()
    return 'preparing'
  }
  if (
    status === 'errored' ||
    status === 'terminated' ||
    status === 'complete'
  ) {
    if (!(await admit())) return 'rate-limited'
    await instance.restart()
    return 'preparing'
  }

  return 'unavailable'
}

export const createWorkflowGenerationCoordinator = (
  workflow: Workflow<CommemorativeNftGenerationParams> | undefined,
  admit: (tokenId: string) => Promise<boolean>,
): GenerationCoordinator => ({
  prepare: async (tokenId) => {
    if (!workflow) return 'unavailable'

    try {
      const instanceId = getWorkflowInstanceId(tokenId)
      try {
        const instance = await workflow.get(instanceId)
        const instanceStatus = await instance.status()
        return await activateWorkflowInstance(
          instance,
          instanceStatus.status,
          () => admit(tokenId),
        )
      } catch {
        // Cloudflare throws when get() targets an ID that does not exist.
        // Creation below is also safe when this was a transient lookup error:
        // an existing caller-supplied ID makes create() fail closed.
      }

      if (!(await admit(tokenId))) return 'rate-limited'

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
        return await activateWorkflowInstance(
          racedInstance,
          racedStatus.status,
          async () => true,
        )
      }
      return 'preparing'
    } catch {
      return 'unavailable'
    }
  },
})
