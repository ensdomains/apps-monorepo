import { useAnalyticsConsent } from '@ens-apps/analytics-consent/react'
import {
  analyticsNoticeHeadings,
  analyticsNoticeParagraphs,
  consentChoiceLabels,
} from '@ens-apps/analytics-consent/wording'
import { Switch } from '@/components/ui/switch'

export const PORTAL_USAGE_EVENTS_PARAGRAPH =
  'Usage events: wallet connections and disconnections, and DNSSEC debugger checks (the name checked, where the check was opened from, the verdict, and the failed step).'

/**
 * The analytics notice: what the Explorer collects, why, who processes it,
 * how to ask for deletion, and the visitor's current choice with a switch.
 * Rendered as the last section of the privacy policy page.
 */
export const AnalyticsNotice = () => {
  const [consent, setConsent] = useAnalyticsConsent()
  const [collected, usageEvents, purposes, processor, declined, deletion] =
    analyticsNoticeParagraphs(PORTAL_USAGE_EVENTS_PARAGRAPH)

  return (
    <div>
      <p className="text-p text-foreground">{collected}</p>
      <p className="mt-4 text-p text-foreground">{usageEvents}</p>
      <h3 className="mt-6 font-medium text-foreground text-lg">
        {analyticsNoticeHeadings.purposes}
      </h3>
      <p className="mt-4 text-p text-foreground">{purposes}</p>
      <p className="mt-4 text-p text-foreground">{processor}</p>
      <p className="mt-4 text-p text-foreground">{declined}</p>
      <p className="mt-4 text-p text-foreground">{deletion}</p>
      <h3 className="mt-6 font-medium text-foreground text-lg">
        {analyticsNoticeHeadings.yourChoice}
      </h3>
      <div className="mt-4 flex items-center gap-3">
        <Switch
          aria-label="Analytics"
          checked={consent === 'accepted'}
          data-testid="analytics-consent-switch"
          onCheckedChange={(checked) =>
            setConsent(checked ? 'accepted' : 'declined')
          }
        />
        <p
          className="text-p text-foreground"
          data-testid="analytics-consent-status"
        >
          {consent === null
            ? consentChoiceLabels.none
            : consent === 'accepted'
              ? consentChoiceLabels.accepted
              : consentChoiceLabels.declined}
        </p>
      </div>
    </div>
  )
}
