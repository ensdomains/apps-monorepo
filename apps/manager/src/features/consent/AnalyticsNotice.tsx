import { useAnalyticsConsent } from '@ens-apps/analytics-consent/react'
import {
  analyticsNoticeHeadings,
  analyticsNoticeParagraphs,
  consentChoiceLabels,
} from '@ens-apps/analytics-consent/wording'
import { useHydrated } from '@tanstack/react-router'
import { Switch } from '@/components/ui/switch'

export const MANAGER_USAGE_EVENTS_PARAGRAPH =
  'Usage events: the names you search for and select, wallet connections and disconnections, and commemorative NFT activity (completion checks, claim outcomes, display fallbacks, and download failures).'

/**
 * The analytics notice: what the Manager collects, why, who processes it,
 * how to ask for deletion, and the visitor's current choice with a switch.
 * Rendered as a section of the privacy policy page.
 */
export const AnalyticsNotice = () => {
  const isHydrated = useHydrated()
  const [consent, setConsent] = useAnalyticsConsent()
  // The server renders the no-choice state; show it until hydration so a
  // returning visitor gets no markup mismatch.
  const shown = isHydrated ? consent : null
  const [collected, usageEvents, purposes, processor, declined, deletion] =
    analyticsNoticeParagraphs(MANAGER_USAGE_EVENTS_PARAGRAPH)

  return (
    <div>
      <p className="mt-4 text-gray-700">{collected}</p>
      <p className="mt-4 text-gray-700">{usageEvents}</p>
      <h3 className="mt-6 font-semibold text-ens-blue-dark text-lg">
        {analyticsNoticeHeadings.purposes}
      </h3>
      <p className="mt-4 text-gray-700">{purposes}</p>
      <p className="mt-4 text-gray-700">{processor}</p>
      <p className="mt-4 text-gray-700">{declined}</p>
      <p className="mt-4 text-gray-700">{deletion}</p>
      <h3 className="mt-6 font-semibold text-ens-blue-dark text-lg">
        {analyticsNoticeHeadings.yourChoice}
      </h3>
      <div className="mt-4 flex items-center gap-3">
        <Switch
          aria-label="Analytics"
          checked={shown === 'accepted'}
          data-testid="analytics-consent-switch"
          onCheckedChange={(checked) =>
            setConsent(checked ? 'accepted' : 'declined')
          }
        />
        <p className="text-gray-700" data-testid="analytics-consent-status">
          {shown === null
            ? consentChoiceLabels.none
            : shown === 'accepted'
              ? consentChoiceLabels.accepted
              : consentChoiceLabels.declined}
        </p>
      </div>
    </div>
  )
}
