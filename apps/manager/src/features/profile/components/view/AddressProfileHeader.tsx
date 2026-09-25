import { Trans, useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Check, Copy } from 'lucide-react'
import type { Address } from 'viem'
import { MSymbol } from '@/components/ui/material-symbol'
import type { ProfileAddressName } from '@/features/profile/service/profileAddressNames'
import { buildNameAvatarUrl } from '@/features/profile/service/profileAvatar'
import {
  getProfileExpiryResultStatus,
  getProfileNameExpiryStatus,
  profileExpiryQuery,
} from '@/features/profile/service/profileExpiry'
import { profileOwnerQuery } from '@/features/profile/service/profileOwner'
import { profileRegistrationQuery } from '@/features/profile/service/profileRegistration'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import type { ProfileRecords } from '@/features/profile/types'
import { useCopyFeedback } from '@/hooks/useCopyFeedback'
import { truncateAddress } from '@/lib/utils'
import { findPrimaryAddressName } from './addressProfilePrimary'
import { ProfileAbout } from './ProfileAbout'
import { ProfileAvatar } from './ProfileAvatar'
import { ProfileDetails } from './ProfileDetails'

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

const useAddressProfileDetails = ({
  address,
  addressNames,
  primaryName,
  isNamesPending,
}: {
  readonly address: Address
  readonly addressNames: readonly ProfileAddressName[]
  readonly primaryName?: string
  readonly isNamesPending: boolean
}) => {
  const primaryEntry = findPrimaryAddressName(addressNames, primaryName)
  const isV1Primary = primaryEntry?.protocol === 'v1'
  const useChainMetadata = !!primaryName && !isNamesPending && !isV1Primary

  const { data: ownerData } = useQuery({
    ...profileOwnerQuery(primaryName ?? ''),
    enabled: useChainMetadata,
  })
  const owner = isV1Primary
    ? address
    : (ownerData?.owner as Address | undefined)
  const { data: registration } = useQuery({
    ...profileRegistrationQuery(primaryName ?? '', ownerData?.protocol),
    enabled: useChainMetadata,
  })
  const { data: expiryData } = useQuery({
    ...profileExpiryQuery(primaryName ?? '', ownerData?.protocol),
    enabled: useChainMetadata,
  })

  const expiry =
    isV1Primary && primaryEntry
      ? getProfileNameExpiryStatus(primaryEntry.expiryDate, 'v1')
      : getProfileExpiryResultStatus(expiryData)
  const registrationDate = isV1Primary
    ? primaryEntry?.createdAt
    : registration?.registrationDate

  return {
    isV1Primary,
    owner,
    displayExpiryDate: expiry.displayExpiryDate,
    registrationDate,
    avatarUrl:
      primaryName && !expiry.isInGrace
        ? buildNameAvatarUrl(primaryName)
        : undefined,
  }
}

const AddressProfileDetailsSection = ({
  primaryName,
  isV1Primary,
  owner,
  displayExpiryDate,
  registrationDate,
}: {
  readonly primaryName: string
  readonly isV1Primary: boolean
  readonly owner?: Address
  readonly displayExpiryDate?: Date | null
  readonly registrationDate?: number | null
}) => {
  const { data: ownerReverseName } = useQuery({
    ...profileReverseNameQuery(owner),
    enabled: !isV1Primary && !!owner,
  })

  return (
    <ProfileDetails
      displayExpiryDate={displayExpiryDate}
      owner={owner}
      ownerReverseName={isV1Primary ? primaryName : ownerReverseName}
      registrationDate={registrationDate}
    />
  )
}

export const AddressProfileHeader = ({
  address,
  addressNames,
  primaryName,
  isNamesPending = false,
  records,
}: {
  readonly address: Address
  readonly addressNames: readonly ProfileAddressName[]
  readonly primaryName?: string
  readonly isNamesPending?: boolean
  readonly records: ProfileRecords | null
}) => {
  const { isV1Primary, owner, displayExpiryDate, registrationDate, avatarUrl } =
    useAddressProfileDetails({
      address,
      addressNames,
      primaryName,
      isNamesPending,
    })

  return (
    <div className="flex w-full flex-col gap-5 lg:landscape:gap-6">
      {primaryName ? (
        <ProfileAvatar
          avatarLoading={false}
          avatarUrl={avatarUrl}
          className="mx-auto -mt-14 size-42.5 rounded-xl shadow-none lg:landscape:hidden"
          name={primaryName}
        />
      ) : null}
      <div className="flex flex-col items-center gap-4 lg:landscape:flex-row lg:landscape:justify-between">
        <AddressLabel address={address} />
        {primaryName ? (
          <Link
            className="inline-flex h-12.5 w-43 items-center justify-center gap-2.5 whitespace-nowrap rounded bg-ens-lapis-core px-4 font-medium font-mono text-[13px] text-white uppercase tracking-[1.56px] hover:bg-ens-lapis-hover lg:landscape:h-11"
            params={{ name: primaryName }}
            to="/$name"
          >
            <MSymbol
              className="ms-opsz-20 shrink-0 text-xs"
              symbol="person_check"
            />
            <Trans>View profile</Trans>
          </Link>
        ) : null}
      </div>

      {primaryName ? (
        <AddressProfileDetailsSection
          displayExpiryDate={displayExpiryDate}
          isV1Primary={isV1Primary}
          owner={owner}
          primaryName={primaryName}
          registrationDate={registrationDate}
        />
      ) : null}

      {primaryName ? (
        <div className="flex flex-col gap-5 lg:landscape:flex-row lg:landscape:items-stretch lg:landscape:gap-5.5">
          {/* Keep the Figma avatar width while letting the bio set their shared height. */}
          <div className="relative hidden w-[152.257px] shrink-0 lg:landscape:block">
            <ProfileAvatar
              avatarLoading={false}
              avatarUrl={avatarUrl}
              className="absolute inset-0 size-full rounded-xl shadow-none"
              name={primaryName}
            />
          </div>
          <ProfileAbout primaryName={primaryName} records={records} />
        </div>
      ) : null}
    </div>
  )
}
