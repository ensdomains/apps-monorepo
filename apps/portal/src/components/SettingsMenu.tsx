import { useAnalyticsConsent } from '@ens-apps/utils/posthog/analyticsConsent'
import { MessageSquareTextIcon, ServerIcon } from 'lucide-react'
import posthog from 'posthog-js/dist/module.full.no-external'
import { type ComponentProps, useState } from 'react'
import { ProfileSettingsIcon } from '@/assets/icons'
import { getCustomRpcUrl } from '@/lib/customRpc'
import { setAnalyticsConsent } from '@/lib/posthog/config'
import { cn } from '@/lib/utils'
import { RpcSettingsDialog } from './RpcSettingsDialog'
import { ThemeToggle } from './ThemeToggle'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

// PostHog feedback survey opened from the menu instead of the floating tab,
// which competed with primary CTAs and covered the search input on mobile.
const FEEDBACK_SURVEY_ID = import.meta.env
  .VITE_PUBLIC_POSTHOG_FEEDBACK_SURVEY_ID

// Changes the answer given in the analytics banner, which the Manager shares.
const AnalyticsMenuItem = () => {
  const consent = useAnalyticsConsent(posthog)

  // Nothing to change until PostHog has loaded, which needs a project key.
  if (!consent) return null

  return (
    <DropdownMenuCheckboxItem
      checked={consent === 'granted'}
      onCheckedChange={(checked) => setAnalyticsConsent(posthog, checked)}
      // Stays open so the visitor sees the change.
      onSelect={(event) => event.preventDefault()}
    >
      Share usage data
    </DropdownMenuCheckboxItem>
  )
}

const FeedbackMenuItem = () => {
  // Surveys load only with analytics consent (lib/posthog/config.ts).
  const consent = useAnalyticsConsent(posthog)

  if (!FEEDBACK_SURVEY_ID || consent !== 'granted') return null

  return (
    <DropdownMenuItem
      onSelect={() =>
        posthog.displaySurvey(FEEDBACK_SURVEY_ID, {
          displayType: 'popover',
          ignoreConditions: true,
          ignoreDelay: true,
        })
      }
    >
      <MessageSquareTextIcon className="size-4" />
      Feedback
    </DropdownMenuItem>
  )
}

export const SettingsMenu = ({
  side = 'right',
  className,
}: Pick<ComponentProps<typeof DropdownMenuContent>, 'side'> & {
  readonly className?: string
}) => {
  const [isRpcOpen, setIsRpcOpen] = useState(false)
  const customRpc = getCustomRpcUrl()

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'size-8 shrink-0 text-muted-foreground hover:text-foreground',
              className,
            )}
            aria-label="Settings"
          >
            <ProfileSettingsIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side={side} align="end" className="min-w-52">
          <ThemeToggle />
          <DropdownMenuItem onSelect={() => setIsRpcOpen(true)}>
            <ServerIcon className="size-4" />
            RPC: {customRpc ? new URL(customRpc).host : 'Default'}
          </DropdownMenuItem>
          <AnalyticsMenuItem />
          <FeedbackMenuItem />
          {/* <DropdownMenuItem asChild>
            <ExternalLink href="https://sepolia.etherscan.io">
              <ChipLinkIcon className="size-3" />
              Sepolia explorer
            </ExternalLink>
          </DropdownMenuItem> */}
        </DropdownMenuContent>
      </DropdownMenu>
      <RpcSettingsDialog isOpen={isRpcOpen} onOpenChange={setIsRpcOpen} />
    </>
  )
}
