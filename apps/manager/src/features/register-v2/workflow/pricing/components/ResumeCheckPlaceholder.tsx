import { useLingui } from '@lingui/react/macro'

/**
 * Stands in for the pricing screen while a stored registration for this name
 * is being checked. Rendering pricing instead would flash it up, only for the
 * registering screen to replace it the moment the resume lands.
 */
export const ResumeCheckPlaceholder = () => {
  const { t } = useLingui()

  return (
    <div
      aria-label={t`Checking for an unfinished registration`}
      className="flex min-h-[60vh] items-center justify-center" // Same height as CenteredWeaveLoader, so a resumed run's loader appears in place.
      role="status"
    >
      <div className="size-5 animate-spin rounded-full border-2 border-ens-blue/20 border-t-ens-blue" />
    </div>
  )
}
