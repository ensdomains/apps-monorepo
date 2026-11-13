import { Trans } from '@lingui/react/macro'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { EXPLORER_URL } from '@/constants'
import { type ExplorerTarget, getExplorerUrl } from '@/utils/explorerUrl'
import {
  actionLabelClassName,
  iconActionInnerClassName,
  renewActionClassName,
} from './ProfileAction.styles'

type ProfileExploreActionProps = {
  readonly target: ExplorerTarget
}

export const ProfileExploreAction = ({ target }: ProfileExploreActionProps) => {
  const href = getExplorerUrl(EXPLORER_URL, target)
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
      <TooltipContent className="max-w-50 text-center">
        <Trans>View details and history in ENS Explorer</Trans>
      </TooltipContent>
    </Tooltip>
  )
}
