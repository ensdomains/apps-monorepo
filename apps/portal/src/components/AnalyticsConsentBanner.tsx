import {
  storeAnalyticsConsent,
  useAnalyticsConsent,
} from '@ens-apps/utils/posthog/analyticsConsent'
import { Button } from './ui/button'

const PRIVACY_POLICY_URL = 'https://ens.domains/legal/privacy-policy'

/** Asks once whether PostHog may collect analytics. Feature flags work either way. */
export const AnalyticsConsentBanner = () => {
  const consent = useAnalyticsConsent()

  // Without a PostHog project there is nothing to ask about.
  if (!import.meta.env.VITE_PUBLIC_POSTHOG_KEY || consent !== null) return null

  return (
    <section
      aria-label="Analytics consent"
      className="fixed inset-x-4 bottom-4 z-40 flex flex-col gap-3 rounded-md border bg-popover p-4 text-popover-foreground shadow-md sm:left-auto sm:w-88"
    >
      <p className="text-small">
        We&apos;d like to collect usage analytics with PostHog to improve the
        Explorer.{' '}
        <a
          className="underline underline-offset-2"
          href={PRIVACY_POLICY_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          Privacy policy
        </a>
      </p>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={() => storeAnalyticsConsent('granted')}
          type="button"
          variant="outline"
        >
          Accept
        </Button>
        <Button
          className="flex-1"
          onClick={() => storeAnalyticsConsent('denied')}
          type="button"
          variant="outline"
        >
          Decline
        </Button>
      </div>
    </section>
  )
}
