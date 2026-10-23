import {
  storeAnalyticsConsent,
  useAnalyticsConsent,
} from '@ens-apps/utils/posthog/analyticsConsent'
import { Trans, useLingui } from '@lingui/react/macro'
import { Button } from './ui/button'

const PRIVACY_POLICY_URL = 'https://ens.domains/legal/privacy-policy'

/** Asks once whether PostHog may collect analytics. Feature flags work either way. */
export const AnalyticsConsentBanner = () => {
  const consent = useAnalyticsConsent()
  const { t } = useLingui()

  // Without a PostHog project there is nothing to ask about.
  if (!import.meta.env.VITE_PUBLIC_POSTHOG_KEY || consent !== null) return null

  return (
    <section
      aria-label={t`Analytics consent`}
      className="fixed inset-x-4 xs:right-auto bottom-4 z-40 flex xs:w-88 flex-col gap-3 rounded-md border bg-popover p-4 text-popover-foreground text-sm shadow-md"
    >
      <p>
        <Trans>
          We&apos;d like to collect usage analytics with PostHog to improve the
          ENS app.
        </Trans>{' '}
        <a
          className="underline underline-offset-2"
          href={PRIVACY_POLICY_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          <Trans>Privacy policy</Trans>
        </a>
      </p>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={() => storeAnalyticsConsent('granted')}
          type="button"
          variant="lightBlue"
        >
          <Trans>Accept</Trans>
        </Button>
        <Button
          className="flex-1"
          onClick={() => storeAnalyticsConsent('denied')}
          type="button"
          variant="lightBlue"
        >
          <Trans>Decline</Trans>
        </Button>
      </div>
    </section>
  )
}
