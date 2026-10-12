import { useAnalyticsConsent } from '@ens-apps/analytics-consent/react'
import { consentBanner } from '@ens-apps/analytics-consent/wording'
import { Link, useHydrated } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

/**
 * The floating analytics-consent card. Bottom-left on desktop, below the
 * header on phones, following the V3 app's banner placement. Mounted once
 * at the root; visible only until the visitor chooses.
 */
export const ConsentBanner = () => {
  const isHydrated = useHydrated()
  const [consent, setConsent] = useAnalyticsConsent()

  if (!isHydrated || consent !== null) return null

  return (
    <section
      aria-label="Analytics consent"
      className="fixed z-40 rounded-lg border border-ens-quartz-200 bg-white p-4 shadow-lg max-sm:top-22 max-sm:right-2.5 max-sm:left-2.5 sm:bottom-6 sm:left-6 sm:max-w-80"
      data-testid="analytics-consent-banner"
    >
      <p className="text-ens-quartz-900 text-sm">{consentBanner.text}</p>
      <div className="mt-3 flex gap-2">
        <Button
          className="flex-1 whitespace-nowrap"
          onClick={() => setConsent('accepted')}
          size="sm"
          variant="outline"
        >
          {consentBanner.acceptLabel}
        </Button>
        <Button
          className="flex-1 whitespace-nowrap"
          onClick={() => setConsent('declined')}
          size="sm"
          variant="outline"
        >
          {consentBanner.declineLabel}
        </Button>
      </div>
      <Link
        className="mt-2 inline-block text-ens-blue-dark text-sm underline"
        hash="analytics"
        to="/legal/privacy-policy"
      >
        {consentBanner.noticeLinkLabel}
      </Link>
    </section>
  )
}
