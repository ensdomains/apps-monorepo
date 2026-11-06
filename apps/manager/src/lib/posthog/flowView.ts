export type AnalyticsView = {
  readonly flow_id: string
} & (
  | {
      readonly flow: 'registration' | 'renewal'
      readonly step: 'duration' | 'payment'
    }
  | { readonly flow: 'migration'; readonly step?: undefined }
)

type Observation = {
  readonly flow: AnalyticsView['flow']
  readonly flow_id: string
  readonly identity: string
  readonly step: 'duration' | 'payment' | undefined
}
const FLOW_EVENTS = {
  registration: 'registration:flow_view',
  renewal: 'renewal:flow_view',
  migration: 'migration:flow_view',
} as const
const SCREEN_EVENTS = {
  registration: {
    duration: 'registration:duration_view',
    payment: 'registration:payment_view',
  },
  renewal: {
    duration: 'renewal:duration_view',
    payment: 'renewal:payment_view',
  },
} as const

/** Compare visible screens only; execution stages and outcomes belong to operations. */
export const getFlowViewEvents = (
  previous: Observation | undefined,
  view: AnalyticsView | undefined,
  identity: string,
) => {
  if (!view?.flow_id)
    return {
      observation: previous ? { ...previous, step: undefined } : undefined,
      events: [],
    }
  const isSameFlow =
    previous?.identity === identity &&
    previous.flow === view.flow &&
    previous.flow_id === view.flow_id
  const isSameScreen = isSameFlow && previous.step === view.step
  const properties = { flow_id: view.flow_id }
  const screenEvent =
    view.flow === 'migration' ? undefined : SCREEN_EVENTS[view.flow][view.step]
  return {
    observation: {
      flow: view.flow,
      flow_id: view.flow_id,
      step: view.step,
      identity,
    },
    events: [
      ...(isSameFlow ? [] : [{ name: FLOW_EVENTS[view.flow], properties }]),
      ...(screenEvent && !isSameScreen
        ? [{ name: screenEvent, properties }]
        : []),
    ],
  }
}
