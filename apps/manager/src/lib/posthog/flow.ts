import { createAnalyticsFlowId } from '@ens-apps/utils/posthog/flowId'
import { startAnalyticsOperation, track } from './events'

const NO_CAPTURE: typeof track = () => {}

export type AnalyticsFlow = {
  readonly flow_id: string
  readonly capture: typeof track
  readonly completionScope?: object
}

export const createAnalyticsFlow = (flowId = createAnalyticsFlowId()) => ({
  flow_id: flowId ?? '',
  completionScope: {},
  capture: flowId ? track : NO_CAPTURE,
})

export const bindAnalyticsFlow = (flow: AnalyticsFlow | string) => {
  const flowId = typeof flow === 'string' ? flow : flow.flow_id
  return {
    flow_id: flowId,
    completionScope:
      typeof flow === 'string' ? {} : (flow.completionScope ?? flow),
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
