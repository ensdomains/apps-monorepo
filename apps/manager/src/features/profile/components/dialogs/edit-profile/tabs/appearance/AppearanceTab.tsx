import type { Address } from 'viem'
import {
  DEFAULT_THEME_COLOR,
  type ThemeColorValue,
} from '@/features/profile/constants'
import type { ProfileRecords } from '@/features/profile/types'
import { resolveThemeColor } from '@/features/profile/utils/themeColor'
import { cn, truncateAddress } from '@/lib/utils'
import { useEditProfileDialogStatus } from '../../EditProfileDialog.context'

interface AppearanceTheme {
  readonly activeRingClassName: string
  readonly addressClassName: string
  readonly backgroundImage: string
  readonly badgeClassName: string
  readonly badgeTextClassName: string
  readonly label: string
  readonly value: ThemeColorValue
}

const appearanceThemes = [
  {
    activeRingClassName: 'ring-ens-quartz-350',
    addressClassName: 'text-ens-quartz-500',
    backgroundImage:
      'linear-gradient(185deg, var(--color-ens-quartz-75) 7%, var(--color-ens-quartz-200) 146%)',
    badgeClassName: 'bg-ens-lapis-900',
    badgeTextClassName: 'text-[#f6fbfd]', // no exact ENS token
    label: 'Quartz',
    value: '#02293B',
  },
  {
    activeRingClassName: 'ring-ens-garnet-400',
    addressClassName: 'text-ens-garnet-900',
    backgroundImage:
      'linear-gradient(185deg, var(--color-ens-garnet-100) 7%, var(--color-ens-garnet-200) 146%)',
    badgeClassName: 'bg-ens-garnet-500',
    badgeTextClassName: 'text-[#fdf1f5]', // no exact ENS token
    label: 'Garnet',
    value: '#E72A96',
  },
  {
    activeRingClassName: 'ring-ens-lapis-400',
    addressClassName: 'text-ens-lapis-900',
    backgroundImage:
      'linear-gradient(185deg, var(--color-ens-lapis-bg) 7%, #a3e0fd 146%)',
    badgeClassName: 'bg-ens-lapis-500',
    badgeTextClassName: 'text-[#f6fbfd]', // no exact ENS token
    label: 'Lapis',
    value: '#0082BB',
  },
  {
    activeRingClassName: 'ring-ens-peridot-400',
    addressClassName: 'text-ens-peridot-900',
    backgroundImage: 'linear-gradient(185deg, #e4ffe3 7%, #a3fda6 146%)',
    badgeClassName: 'bg-ens-peridot-500',
    badgeTextClassName: 'text-[#e9f7ef]', // no exact ENS token
    label: 'Peridot',
    value: '#007C20',
  },
  {
    activeRingClassName: 'ring-ens-citrine-400',
    addressClassName: 'text-ens-citrine-900',
    backgroundImage:
      'linear-gradient(185deg, var(--color-ens-citrine-100) 7%, var(--color-ens-citrine-300) 146%)',
    badgeClassName: 'bg-ens-citrine-500',
    badgeTextClassName: 'text-[#fcfcf3]', // no exact ENS token
    label: 'Citrine',
    value: '#984D1B',
  },
] as const satisfies readonly AppearanceTheme[]

const themeValues: ReadonlySet<string> = new Set(
  appearanceThemes.map((theme) => theme.value.toLowerCase()),
)

const getSelectedThemeValue = (theme?: string | null) => {
  const resolvedTheme = resolveThemeColor(theme).toLowerCase()
  return themeValues.has(resolvedTheme)
    ? resolvedTheme
    : DEFAULT_THEME_COLOR.toLowerCase()
}

const getPreviewAddress = (values: ProfileRecords, owner?: Address): string => {
  const ethAddress = values.addresses.find(
    (record) => record.coinType === 60,
  )?.value

  return truncateAddress(ethAddress || owner)
}

interface ThemePreviewButtonProps {
  readonly address: string
  readonly disabled?: boolean
  readonly isActive: boolean
  readonly name: string
  readonly onSelect: () => void
  readonly theme: AppearanceTheme
}

const ThemePreviewButton = ({
  address,
  disabled,
  isActive,
  name,
  onSelect,
  theme,
}: ThemePreviewButtonProps) => (
  <button
    aria-label={`${theme.label} theme${isActive ? ' (selected)' : ''}`}
    aria-pressed={isActive}
    className={cn(
      'flex shrink-0 cursor-pointer flex-col items-start gap-0.5 overflow-hidden rounded-md p-3 text-left transition-shadow focus-visible:outline-2 focus-visible:outline-ens-lapis-500 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
      isActive && ['ring-2', theme.activeRingClassName],
    )}
    disabled={disabled}
    onClick={onSelect}
    style={{ backgroundImage: theme.backgroundImage }}
    type="button"
  >
    <span
      className={cn(
        'w-fit max-w-full truncate rounded-[0.717px] px-0.75 py-0.5 font-semi-mono text-[14px] leading-ens-none tracking-[-0.28px] md:text-[16px] md:tracking-[-0.32px]',
        theme.badgeClassName,
        theme.badgeTextClassName,
      )}
    >
      {name}
    </span>
    <span
      className={cn(
        'font-mono text-[7px] leading-normal tracking-normal md:text-[9px]',
        theme.addressClassName,
      )}
    >
      {address}
    </span>
  </button>
)

interface AppearanceTabProps {
  readonly name: string
  readonly onBaseChange: (base: ProfileRecords['base']) => void
  readonly owner?: Address
  readonly values: ProfileRecords
}

export const AppearanceTab = ({
  name,
  onBaseChange,
  owner,
  values,
}: AppearanceTabProps) => {
  const { isSaving } = useEditProfileDialogStatus()
  const selectedThemeValue = getSelectedThemeValue(values.base.theme)
  const previewAddress = getPreviewAddress(values, owner)

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex flex-col gap-1.5">
        <p className="font-bold font-sans text-[#525252] text-base leading-ens-none tracking-[-0.32px]">
          Appearance
        </p>
        <p className="text-base text-ens-quartz-400 leading-ens-normal">
          Choose a theme that fits your style
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {appearanceThemes.map((theme) => (
          <ThemePreviewButton
            address={previewAddress}
            disabled={isSaving}
            isActive={theme.value.toLowerCase() === selectedThemeValue}
            key={theme.value}
            name={name}
            onSelect={() =>
              onBaseChange({ ...values.base, theme: theme.value })
            }
            theme={theme}
          />
        ))}
      </div>
    </div>
  )
}
