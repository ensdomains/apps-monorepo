import { startAnalyticsOperation, track } from './events'

export const createAnalyticsFlow = (flowId: string = crypto.randomUUID()) => ({
  flow_id: flowId,
  capture: track,
})

export const bindAnalyticsFlow = (flowId: string) => ({
  flow_id: flowId,
  ...startAnalyticsOperation(),
})

export type AnalyticsFlow = ReturnType<typeof createAnalyticsFlow>
