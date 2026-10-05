import { MessageSquareTextIcon, ServerIcon } from 'lucide-react'
import { type ComponentProps, useState } from 'react'
import { ProfileSettingsIcon } from '@/assets/icons'
import { useTelemetryEnabled } from '@/hooks/useTelemetryEnabled'
import { getCustomRpcUrl } from '@/lib/customRpc'
import { displayFeedbackSurvey } from '@/lib/posthog/feedback'
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

const FeedbackMenuItem = () => {
  if (!FEEDBACK_SURVEY_ID) return null

  return (
    <DropdownMenuItem
      onSelect={() =>
        displayFeedbackSurvey(FEEDBACK_SURVEY_ID, {
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

const TelemetryToggle = () => {
  const [enabled, setEnabled] = useTelemetryEnabled()

  return (
    <DropdownMenuCheckboxItem
      checked={enabled}
      onCheckedChange={setEnabled}
      onSelect={(event) => event.preventDefault()}
    >
      Share usage data
    </DropdownMenuCheckboxItem>
  )
}

export const SettingsMenu = ({
  side = 'right',
  className,
}: Pick<ComponentProps<typeof DropdownMenuContent>, 'side'> & {
  readonly className?: string
}) => {
  const [rpcOpen, setRpcOpen] = useState(false)
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
          <TelemetryToggle />
          <DropdownMenuItem onSelect={() => setRpcOpen(true)}>
            <ServerIcon className="size-4" />
            RPC: {customRpc ? new URL(customRpc).host : 'Default'}
          </DropdownMenuItem>
          <FeedbackMenuItem />
          {/* <DropdownMenuItem asChild>
          <ExternalLink href="https://sepolia.etherscan.io">
            <ChipLinkIcon className="size-3" />
            Sepolia explorer
          </ExternalLink>
        </DropdownMenuItem> */}
        </DropdownMenuContent>
      </DropdownMenu>
      <RpcSettingsDialog open={rpcOpen} onOpenChange={setRpcOpen} />
    </>
  )
}
