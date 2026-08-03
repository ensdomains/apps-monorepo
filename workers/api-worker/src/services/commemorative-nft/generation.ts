import { KV_KEY } from '#core/kv/index.js'

export interface CommemorativeNftGenerationParams {
  readonly chainId: number
  readonly tokenId: string
}

export const GENERATION_ADMISSION_WINDOW_SECONDS = 60 * 60
export const GENERATION_ADMISSION_RESERVATION_SECONDS = 60
export const GENERATION_RETRY_WINDOW_SECONDS = 60

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

export interface GenerationAdmissionReservation {
  commit(): Promise<void>
  release(): Promise<void>
}

export type GenerationAdmission = (
  tokenId: string,
  options?: { readonly terminalRetry?: boolean },
) => Promise<GenerationAdmissionReservation | undefined>

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
): GenerationAdmission => {
  return async (tokenId, options) => {
    const key = KV_KEY.COMMEMORATIVE_NFT.GENERATION_ADMISSION(tokenId)
    const existingValue = await kv.get(key)
    if (existingValue) {
      const activatedAt = /^(?:activated|retry):(\d+)$/.exec(existingValue)
      const retryWindowElapsed =
        options?.terminalRetry === true &&
        activatedAt !== null &&
        Date.now() - Number(activatedAt[1]) >=
          GENERATION_RETRY_WINDOW_SECONDS * 1_000
      if (!retryWindowElapsed) return undefined
    }

    const reservationValue = `reserved:${crypto.randomUUID()}`

    // KV admission is intentionally token-scoped: deterministic Workflow IDs
    // prevent parallel creation. A short reservation bounds a failed release;
    // successful first activation commits the full cooldown below. A terminal
    // Workflow can be retried after the shorter retry window.
    await kv.put(key, reservationValue, {
      expirationTtl: GENERATION_ADMISSION_RESERVATION_SECONDS,
    })
    return {
      commit: async () => {
        const terminalRetry = options?.terminalRetry === true
        await kv.put(
          key,
          `${terminalRetry ? 'retry' : 'activated'}:${Date.now()}`,
          {
            expirationTtl: terminalRetry
              ? GENERATION_RETRY_WINDOW_SECONDS
              : GENERATION_ADMISSION_WINDOW_SECONDS,
          },
        )
      },
      release: async () => {
        // Do not delete a newer reservation if two eventually-consistent KV
        // reads admitted callers at the same time.
        if ((await kv.get(key)) === reservationValue) await kv.delete(key)
      },
    }
  }
}

const activateWithAdmission = async (
  admit: () => Promise<GenerationAdmissionReservation | undefined>,
  activate: () => Promise<void>,
): Promise<GenerationPreparationStatus> => {
  const reservation = await admit()
  if (!reservation) return 'rate-limited'

  try {
    await activate()
  } catch (error) {
    try {
      await reservation.release()
    } catch {
      // The short reservation TTL bounds a failed cleanup without masking the
      // Workflow activation error.
    }
    throw error
  }

  // A commit failure must not release the reservation after activation. The
  // active Workflow remains deduplicated and the short reservation expires.
  await reservation.commit()
  return 'preparing'
}

const activateReservedWorkflowInstance = async (
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

const activateWorkflowInstance = async (
  instance: WorkflowInstance,
  status: InstanceStatus['status'],
  admit: () => Promise<GenerationAdmissionReservation | undefined>,
): Promise<GenerationPreparationStatus> => {
  if (ACTIVE_WORKFLOW_STATUSES.has(status as ActiveWorkflowStatus)) {
    return 'preparing'
  }

  if (
    status === 'paused' ||
    status === 'errored' ||
    status === 'terminated' ||
    status === 'complete'
  ) {
    return activateWithAdmission(admit, async () => {
      await activateReservedWorkflowInstance(instance, status)
    })
  }

  return 'unavailable'
}

export const createWorkflowGenerationCoordinator = (
  workflow: Workflow<CommemorativeNftGenerationParams> | undefined,
  admit: GenerationAdmission,
): GenerationCoordinator => ({
  prepare: async (tokenId) => {
    if (!workflow) return 'unavailable'

    try {
      const instanceId = getWorkflowInstanceId(tokenId)
      let existingInstance: WorkflowInstance | undefined
      try {
        existingInstance = await workflow.get(instanceId)
      } catch {
        // Cloudflare throws when get() targets an ID that does not exist.
        // Creation below is also safe when this was a transient lookup error:
        // an existing caller-supplied ID makes create() fail closed.
      }

      if (existingInstance) {
        const instanceStatus = await existingInstance.status()
        return await activateWorkflowInstance(
          existingInstance,
          instanceStatus.status,
          () => admit(tokenId, { terminalRetry: true }),
        )
      }

      return await activateWithAdmission(
        () => admit(tokenId),
        async () => {
          try {
            await workflow.create({
              id: instanceId,
              params: { chainId: 11155111, tokenId },
            })
          } catch (createError) {
            // Another request can win the caller-supplied ID race between the
            // failed/missing lookup and create(). Re-read before releasing the
            // reservation and reporting the service unavailable.
            try {
              const racedInstance = await workflow.get(instanceId)
              const racedStatus = await racedInstance.status()
              if (
                await activateReservedWorkflowInstance(
                  racedInstance,
                  racedStatus.status,
                )
              ) {
                return
              }
            } catch {
              // Preserve the original creation failure below.
            }
            throw createError
          }
        },
      )
    } catch {
      return 'unavailable'
    }
  },
})
