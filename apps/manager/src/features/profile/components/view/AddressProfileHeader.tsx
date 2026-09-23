import { Trans, useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { Check, Copy } from 'lucide-react'
import type { Address } from 'viem'
import { MSymbol } from '@/components/ui/material-symbol'
import { buildNameAvatarUrl } from '@/features/profile/service/profileAvatar'
import type { ProfileRecords } from '@/features/profile/types'
import { useCopyFeedback } from '@/hooks/useCopyFeedback'
import { truncateAddress } from '@/lib/utils'
import { ProfileAbout } from './ProfileAbout'
import { ProfileAvatar } from './ProfileAvatar'

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
  records,
}: {
  readonly address: Address
  readonly primaryName?: string
  readonly records: ProfileRecords | null
}) => {
  return (
    <div className="flex w-full flex-col gap-5 lg:landscape:gap-6">
      {primaryName ? (
        <ProfileAvatar
          avatarLoading={false}
          avatarUrl={buildNameAvatarUrl(primaryName)}
          className="mx-auto -mt-14 size-40 rounded-xl shadow-none lg:landscape:hidden"
          name={primaryName}
        />
      ) : null}
      <div className="flex flex-col items-center gap-4 lg:landscape:flex-row lg:landscape:justify-between">
        <AddressLabel address={address} />
        {primaryName ? (
          <Link
            className="inline-flex h-11 w-44 items-center justify-center gap-2 rounded bg-ens-lapis-core px-4 font-medium font-mono text-sm text-white uppercase tracking-[1.12px] hover:bg-[#026B9C]"
            params={{ name: primaryName }}
            to="/$name"
          >
            <MSymbol className="ms-opsz-20 text-lg" symbol="person_check" />
            <Trans>View profile</Trans>
          </Link>
        ) : null}
      </div>

      {primaryName ? (
        <div className="flex flex-col gap-5 lg:landscape:flex-row lg:landscape:items-stretch">
          <ProfileAvatar
            avatarLoading={false}
            avatarUrl={buildNameAvatarUrl(primaryName)}
            className="hidden rounded-xl shadow-none lg:landscape:block lg:landscape:size-auto lg:landscape:w-35 lg:landscape:self-stretch"
            name={primaryName}
          />
          <ProfileAbout primaryName={primaryName} records={records} />
        </div>
      ) : null}
    </div>
  )
}
