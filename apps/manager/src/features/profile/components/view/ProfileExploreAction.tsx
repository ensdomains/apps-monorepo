import { Trans } from '@lingui/react/macro'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { EXPLORER_URL } from '@/constants'
import { getExplorerNameUrl } from '@/utils/explorerUrl'
import {
  actionLabelClassName,
  actionTooltipClassName,
  iconActionInnerClassName,
  renewActionClassName,
} from './ProfileAction.styles'

type ProfileExploreActionProps = {
  /** Owners are sent to Explorer to manage the name, so the tooltip says so. */
  readonly isOwner?: boolean
  readonly name: string
}

export const ProfileExploreAction = ({
  isOwner = false,
  name,
}: ProfileExploreActionProps) => {
  const href = getExplorerNameUrl(EXPLORER_URL, name)
  if (!href) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          className={renewActionClassName}
          href={href}
          rel="noopener noreferrer"
          target="_blank"
        >
          <span className={iconActionInnerClassName}>
            <span className={actionLabelClassName}>
              <Trans>Explore</Trans>
            </span>
          </span>
        </a>
      </TooltipTrigger>
      <TooltipContent className={actionTooltipClassName}>
        {isOwner ? (
          <Trans>Manage advanced settings in ENS Explorer</Trans>
        ) : (
          <Trans>View details and history in ENS Explorer</Trans>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
