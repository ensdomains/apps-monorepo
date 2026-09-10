export { getRegistrationV2AvailabilityQueryOptions } from './data/queries/availability.query'
export {
  RegisterV2Context,
  RegistrationV2UiProvider,
  useRegistrationV2Context,
} from './state/registrationUi.context'
export { useRegistrationStep } from './state/registrationUi.selectors'
// `useOrphanRegistrationCleanup` is deliberately NOT re-exported: its only
// consumer is the root route, which must deep-import it to keep this barrel —
// and the whole register workflow behind it — out of the every-page chunk.
export type { RegistrationResumeState } from './state/useRegistrationResume'
export { parseName } from './utils/name-parser'

export { ResumeCheckPlaceholder } from './workflow/pricing/components/ResumeCheckPlaceholder'
export { PricingStep } from './workflow/pricing/PricingStep'
export { RegisteringStep } from './workflow/registering/RegisteringStep'
export { FailureStep } from './workflow/result/FailureStep'
export { SuccessStep } from './workflow/result/SuccessStep'
