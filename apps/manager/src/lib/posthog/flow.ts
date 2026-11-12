import { createAnalyticsFlowId } from '@ens-apps/utils/posthog/flowId'
import { getAnalyticsNameProperties } from '@ens-apps/utils/posthog/nameProperties'
import { startAnalyticsOperation, track } from './events'

const NO_CAPTURE: typeof track = () => {}

export type AnalyticsFlow = {
  readonly flow_id: string
  readonly ens_name?: string
  readonly capture: typeof track
  readonly completionScope?: object
}

export const createAnalyticsFlow = (
  flowId = createAnalyticsFlowId(),
  ensName?: string,
) => ({
  ...getAnalyticsNameProperties(ensName),
  flow_id: flowId ?? '',
  completionScope: {},
  capture: flowId ? track : NO_CAPTURE,
})

export const bindAnalyticsFlow = (flow: AnalyticsFlow | string) => {
  const flowId = typeof flow === 'string' ? flow : flow.flow_id
  return {
    flow_id: flowId,
    ...(typeof flow === 'string'
      ? {}
      : getAnalyticsNameProperties(flow.ens_name)),
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
