import { Trans, useLingui } from '@lingui/react/macro'
import { MSymbol } from '@/components/ui/material-symbol'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ShareProfileDialog } from '@/features/profile/components/dialogs/ShareProfileDialog'
import {
  actionTooltipClassName,
  iconActionClassName,
  iconActionIconInnerClassName,
  iconActionSymbolClassName,
} from './ProfileAction.styles'
import { useProfileThemeColor } from './ProfileThemeColor'

type ProfileShareActionProps = {
  readonly avatarUrl?: string
  readonly name: string
  readonly url: string
}

export const ProfileShareAction = ({
  avatarUrl,
  name,
  url,
}: ProfileShareActionProps) => {
  const { t } = useLingui()
  const themeColor = useProfileThemeColor()

  // The tooltip wraps the dialog so its trigger can sit inside the dialog's trigger
  return (
    <Tooltip>
      <ShareProfileDialog
        avatarUrl={avatarUrl}
        name={name}
        themeColor={themeColor}
        trigger={
          <TooltipTrigger asChild>
            <button
              aria-label={t`Share profile`}
              className={iconActionClassName}
              type="button"
            >
              <span className={iconActionIconInnerClassName}>
                <MSymbol
                  className={iconActionSymbolClassName}
                  symbol="ios_share"
                />
              </span>
            </button>
          </TooltipTrigger>
        }
        url={url}
      />
      <TooltipContent className={actionTooltipClassName}>
        <Trans>Share</Trans>
      </TooltipContent>
    </Tooltip>
  )
}
