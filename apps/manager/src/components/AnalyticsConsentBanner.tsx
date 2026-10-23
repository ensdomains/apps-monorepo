import { useAnalyticsConsent } from '@ens-apps/utils/posthog/analyticsConsent'
import { Trans, useLingui } from '@lingui/react/macro'
import posthog from 'posthog-js/dist/module.full.no-external'
import { setAnalyticsConsent } from '@/lib/posthog/config'
import { Button } from './ui/button'

const PRIVACY_POLICY_URL = 'https://ens.domains/legal/privacy-policy'

/** Asks once whether PostHog may collect analytics. Feature flags work either way. */
export const AnalyticsConsentBanner = () => {
  const consent = useAnalyticsConsent(posthog)
  const { t } = useLingui()

  // Pending only once PostHog has loaded, which needs a project key.
  if (consent !== 'pending') return null

  return (
    <section
      aria-label={t`Analytics consent`}
      className="fixed inset-x-4 xs:right-auto bottom-4 z-40 flex xs:w-88 flex-col gap-3 rounded-md border bg-popover p-4 text-popover-foreground text-sm shadow-md"
    >
      <div className="flex flex-col gap-1">
        <p className="font-medium">
          <Trans>Help us improve ENS</Trans>
        </p>
        <p>
          <Trans>
            Share usage data to help us find problems and make ENS better for
            everyone. This is optional, and you can change your choice in
            Settings.
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
      </div>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={() => setAnalyticsConsent(posthog, true)}
          type="button"
          variant="lightBlue"
        >
          <Trans>Yes, happy to help</Trans>
        </Button>
        <Button
          className="flex-1"
          onClick={() => setAnalyticsConsent(posthog, false)}
          type="button"
          variant="lightBlue"
        >
          <Trans>No thanks</Trans>
        </Button>
      </div>
    </section>
  )
}
