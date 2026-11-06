import { Trans } from '@lingui/react/macro'
import { MSymbol } from '@/components/ui/material-symbol'
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
  ownerBarExploreActionClassName,
  ownerBarExploreLabelClassName,
  ownerBarExploreSymbolClassName,
  renewActionClassName,
} from './ProfileAction.styles'

type ProfileExploreActionProps = {
  /** `ownerBar` fits beside the Edit button on narrow screens. */
  readonly layout?: 'full' | 'ownerBar'
  readonly target: ExplorerTarget
}

export const ProfileExploreAction = ({
  layout = 'full',
  target,
}: ProfileExploreActionProps) => {
  const href = getExplorerUrl(EXPLORER_URL, target)
  if (!href) return null

  const isOwnerBar = layout === 'ownerBar'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          className={
            isOwnerBar ? ownerBarExploreActionClassName : renewActionClassName
          }
          href={href}
          rel="noopener noreferrer"
          target="_blank"
        >
          <span className={iconActionInnerClassName}>
            {isOwnerBar ? (
              <MSymbol
                aria-hidden="true"
                className={ownerBarExploreSymbolClassName}
                symbol="travel_explore"
              />
            ) : null}
            <span
              className={
                isOwnerBar
                  ? ownerBarExploreLabelClassName
                  : actionLabelClassName
              }
            >
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
