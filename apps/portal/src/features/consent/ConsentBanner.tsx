import { useAnalyticsConsent } from '@ens-apps/analytics-consent/react'
import { consentBanner } from '@ens-apps/analytics-consent/wording'
import { Link } from '@tanstack/react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

/**
 * The floating analytics-consent card. Bottom-right on desktop, below the
 * header on phones, following the V3 app's banner placement. Mounted once
 * at the root; visible only until the visitor chooses.
 */
export const ConsentBanner = () => {
  const [consent, setConsent] = useAnalyticsConsent()

  if (consent !== null) return null

  return (
    <Alert
      className="fixed z-40 max-sm:top-22 max-sm:right-2.5 max-sm:left-2.5 sm:right-6 sm:bottom-6 sm:max-w-80"
      data-testid="analytics-consent-banner"
      variant="neutral"
    >
      <AlertTitle className="font-sans text-sm font-medium">
        Analytics
      </AlertTitle>
      <AlertDescription>{consentBanner.text}</AlertDescription>
      <div className="col-start-2 mt-3 flex gap-2">
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
        className="col-start-2 mt-2 justify-self-start text-sm underline underline-offset-4"
        to="/privacy"
      >
        {consentBanner.noticeLinkLabel}
      </Link>
    </Alert>
  )
}
