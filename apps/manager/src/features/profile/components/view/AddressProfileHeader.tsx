import { Trans, useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, Copy } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { Address } from 'viem'
import { buildNameAvatarUrl } from '@/features/profile/service/profileAvatar'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { getThemeVars } from '@/features/profile/utils/themeColor'
import { transformProfileRecords } from '@/features/profile/utils/transformRecords'
import { useCopyFeedback } from '@/hooks/useCopyFeedback'
import { truncateAddress } from '@/lib/utils'
import { ProfileAbout } from './ProfileAbout'
import { ProfileAvatar } from './ProfileAvatar'
import { ProfileThemeColorProvider } from './ProfileThemeColor'

const AddressLabel = ({ address }: { readonly address: Address }) => {
  const { t } = useLingui()
  const { copied, copy } = useCopyFeedback()

  return (
    <div className="inline-flex max-w-full items-center gap-1">
      <h1 className="truncate font-semi-mono text-[28px] text-ens-quartz-900 leading-[0.96] tracking-[-0.56px] md:text-[32px] md:tracking-[-0.64px]">
        {truncateAddress(address)}
      </h1>
      <button
        aria-label={t`Copy to clipboard`}
        className="inline-flex size-6 shrink-0 items-center justify-center text-ens-quartz-400"
        onClick={() => copy(address)}
        title={t`Copy to clipboard`}
        type="button"
      >
        {copied ? (
          <Check className="size-5" />
        ) : (
          <Copy className="size-5" strokeWidth={1.5} />
        )}
      </button>
    </div>
  )
}

export const AddressProfileHeader = ({
  address,
  primaryName,
}: {
  readonly address: Address
  readonly primaryName?: string
}) => {
  const { data: profileRecords } = useQuery({
    ...profileRecordsQuery(primaryName ?? ''),
    enabled: !!primaryName,
  })
  const records = profileRecords
    ? transformProfileRecords(profileRecords)
    : null
  const themeVars = records ? getThemeVars(records.base.theme) : undefined
  const themeColor = themeVars?.['--theme-color']

  return (
    <div
      className="w-full space-y-6"
      style={themeVars as CSSProperties | undefined}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <AddressLabel address={address} />
        {primaryName ? (
          <Link
            className="inline-flex h-13.5 w-full items-center justify-center rounded border border-ens-quartz-900 px-4 font-medium font-mono text-ens-quartz-700 text-sm uppercase tracking-[1.12px] hover:bg-ens-quartz-50 sm:w-[185px]"
            params={{ name: primaryName }}
            to="/$name"
          >
            <Trans>View profile</Trans>
          </Link>
        ) : null}
      </div>

      {primaryName ? (
        <ProfileThemeColorProvider value={themeColor}>
          <div className="flex flex-col gap-6 lg:landscape:flex-row lg:landscape:items-stretch">
            <ProfileAvatar
              avatarLoading={false}
              avatarUrl={buildNameAvatarUrl(primaryName)}
              className="mx-auto size-38 rounded-xl shadow-none lg:landscape:mx-0 lg:landscape:size-[147px]"
              name={primaryName}
            />
            <ProfileAbout primaryName={primaryName} records={records} />
          </div>
        </ProfileThemeColorProvider>
      ) : null}
    </div>
  )
}
