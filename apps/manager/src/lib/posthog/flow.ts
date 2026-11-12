import { createAnalyticsFlowId } from '@ens-apps/utils/posthog/flowId'
import { getAnalyticsNameProperties } from '@ens-apps/utils/posthog/nameProperties'
import { startAnalyticsOperation, track } from './events'

const NO_CAPTURE: typeof track = () => {}

export type AnalyticsFlow = {
  readonly flow_id: string
  readonly ens_name?: string
  readonly capture: typeof track
  readonly claimCompletion: () => boolean
}

export const createAnalyticsFlow = (
  flowId = createAnalyticsFlowId(),
  ensName?: string,
) => {
  let isComplete = false
  return {
    ...getAnalyticsNameProperties(ensName),
    flow_id: flowId ?? '',
    claimCompletion: () => {
      if (isComplete) return false
      isComplete = true
      return true
    },
    capture: flowId ? track : NO_CAPTURE,
  }
}

export const bindAnalyticsFlow = (flow: AnalyticsFlow | string) => {
  const flowId = typeof flow === 'string' ? flow : flow.flow_id
  return {
    flow_id: flowId,
    ...(typeof flow === 'string'
      ? {}
      : getAnalyticsNameProperties(flow.ens_name)),
    claimCompletion:
      typeof flow === 'string'
        ? createAnalyticsFlow(flow).claimCompletion
        : flow.claimCompletion,
    ...(flowId ? startAnalyticsOperation() : { capture: NO_CAPTURE }),
  }
}

/** The connected wallet and the execution account are separate concepts. */
export const getAnalyticsExecutionMethod = (
  signerType: string | undefined,
): 'eoa' | 'hca' | undefined =>
  signerType === undefined
    ? undefined
    : signerType === 'rhinestone'
      ? 'hca'
      : 'eoa'
