import { useAnalyticsConsent } from '@ens-apps/utils/posthog/analyticsConsent'
import posthog from 'posthog-js/dist/module.full.no-external'
import { setAnalyticsConsent } from '@/lib/posthog/config'
import { Button } from './ui/button'

const PRIVACY_POLICY_URL = 'https://ens.domains/legal/privacy-policy'

/** Asks once whether PostHog may collect analytics. Feature flags work either way. */
export const AnalyticsConsentBanner = () => {
  const consent = useAnalyticsConsent(posthog)

  // Pending only once PostHog has loaded, which needs a project key.
  if (consent !== 'pending') return null

  return (
    <section
      aria-label="Analytics consent"
      className="fixed inset-x-4 bottom-4 z-40 flex flex-col gap-3 rounded-md border bg-popover p-4 text-popover-foreground shadow-md sm:left-auto sm:w-88"
    >
      <div className="flex flex-col gap-1">
        <p className="font-medium">Help us improve ENS</p>
        <p className="text-small">
          Share usage data to help us find problems and make ENS better for
          everyone. This is optional.{' '}
          <a
            className="underline underline-offset-2"
            href={PRIVACY_POLICY_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            Privacy policy
          </a>
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={() => setAnalyticsConsent(posthog, true)}
          type="button"
          variant="outline"
        >
          Yes, happy to help
        </Button>
        <Button
          className="flex-1"
          onClick={() => setAnalyticsConsent(posthog, false)}
          type="button"
          variant="outline"
        >
          No thanks
        </Button>
      </div>
    </section>
  )
}
