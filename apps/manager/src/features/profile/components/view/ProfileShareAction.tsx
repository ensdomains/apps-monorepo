import { useLingui } from '@lingui/react/macro'
import { MSymbol } from '@/components/ui/material-symbol'
import { ShareProfileDialog } from '@/features/profile/components/dialogs/ShareProfileDialog'
import {
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

  return (
    <ShareProfileDialog
      avatarUrl={avatarUrl}
      name={name}
      themeColor={themeColor}
      trigger={
        <button
          aria-label={t`Share profile`}
          className={iconActionClassName}
          type="button"
        >
          <span className={iconActionIconInnerClassName}>
            <MSymbol className={iconActionSymbolClassName} symbol="ios_share" />
          </span>
        </button>
      }
      url={url}
    />
  )
}
