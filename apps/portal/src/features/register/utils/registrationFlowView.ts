import { isAddress } from 'viem'

export type RegistrationViewObservation = {
  readonly flowId: string
  readonly identity: string
  readonly hasPayment: boolean
}

const ENTRY_EVENTS = [
  'registration:flow_view',
  'registration:duration_view',
] as const

export const getRegistrationFlowViewEvents = (
  previous: RegistrationViewObservation | undefined,
  current: RegistrationViewObservation,
) => {
  // Identifying this browser continues its visit; switching wallets starts another observation.
  const isSameVisitor =
    previous &&
    (previous.identity.toLowerCase() === current.identity.toLowerCase() ||
      (!isAddress(previous.identity, { strict: false }) &&
        isAddress(current.identity, { strict: false })))
  const isSameFlow = previous?.flowId === current.flowId && isSameVisitor
  return [
    ...(!isSameFlow ? ENTRY_EVENTS : []),
    ...(current.hasPayment && (!isSameFlow || !previous?.hasPayment)
      ? (['registration:payment_view'] as const)
      : []),
  ]
}
