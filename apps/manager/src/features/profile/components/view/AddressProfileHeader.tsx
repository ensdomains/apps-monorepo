import { Trans, useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { motion, useReducedMotion } from 'motion/react'
import type { Address } from 'viem'
import { MSymbol } from '@/components/ui/material-symbol'
import type { ProfileAddressName } from '@/features/profile/service/profileAddressNames'
import { buildNameAvatarUrl } from '@/features/profile/service/profileAvatar'
import {
  getProfileExpiryResultStatus,
  getProfileNameExpiryStatus,
  profileExpiryQuery,
} from '@/features/profile/service/profileExpiry'
import type { ProfileRecords } from '@/features/profile/types'
import { useCopyFeedback } from '@/hooks/useCopyFeedback'
import { cn, truncateAddress } from '@/lib/utils'
import { findPrimaryAddressName } from './addressProfilePrimary'
import { ProfileAbout } from './ProfileAbout'
import { ProfileAvatar } from './ProfileAvatar'

const AddressLabel = ({ address }: { readonly address: Address }) => {
  const { t } = useLingui()
  const { copied, copy } = useCopyFeedback()
  const shouldReduceMotion = useReducedMotion()
  const iconTransition = shouldReduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 420, damping: 28 }

  return (
    <h1 className="w-full max-w-full text-center font-semi-mono text-[28px] text-ens-quartz-900 leading-[0.96] tracking-[-0.56px] md:text-[32px] md:tracking-[-0.64px] lg:landscape:w-auto lg:landscape:text-left">
      <button
        aria-label={`${address} — ${t`Copy to clipboard`}`}
        className="group relative inline-block max-w-[calc(100%-34px)] cursor-pointer rounded-sm text-left focus-visible:outline-2 focus-visible:outline-ens-lapis-core focus-visible:outline-offset-2 lg:landscape:max-w-full"
        onClick={() => copy(address)}
        title={t`Copy to clipboard`}
        type="button"
      >
        <span className="block truncate">{truncateAddress(address)}</span>
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-1/2 left-full ml-1 size-7.5 -translate-y-1/2 text-ens-quartz-400 group-hover:opacity-100 group-focus-visible:opacity-100',
            copied ? 'opacity-100' : 'opacity-0',
          )}
        >
          <motion.span
            animate={{ opacity: copied ? 0 : 1, scale: copied ? 0.7 : 1 }}
            className="absolute inset-0 flex items-center justify-center"
            initial={false}
            transition={iconTransition}
          >
            <MSymbol className="ms-opsz-30 ms-wght-500" symbol="content_copy" />
          </motion.span>
          <motion.span
            animate={{ opacity: copied ? 1 : 0, scale: copied ? 1 : 0.7 }}
            className="absolute inset-0 flex items-center justify-center"
            initial={false}
            transition={iconTransition}
          >
            <MSymbol className="ms-opsz-30 ms-wght-500" symbol="check" />
          </motion.span>
        </span>
      </button>
    </h1>
  )
}

const useAddressProfileAvatarUrl = ({
  addressNames,
  primaryName,
  isNamesPending,
}: {
  readonly addressNames: readonly ProfileAddressName[]
  readonly primaryName?: string
  readonly isNamesPending: boolean
}) => {
  const primaryEntry = findPrimaryAddressName(addressNames, primaryName)
  const isV1Primary = primaryEntry?.protocol === 'v1'
  const { data: expiryData } = useQuery({
    ...profileExpiryQuery(primaryName ?? ''),
    enabled: !!primaryName && !isNamesPending && !isV1Primary,
  })

  const isInGrace =
    isV1Primary && primaryEntry
      ? getProfileNameExpiryStatus(primaryEntry.expiryDate, 'v1').isInGrace
      : getProfileExpiryResultStatus(expiryData).isInGrace

  return primaryName && !isInGrace ? buildNameAvatarUrl(primaryName) : undefined
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
  const avatarUrl = useAddressProfileAvatarUrl({
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
        <div className="flex flex-col gap-5 lg:landscape:grid lg:landscape:grid-cols-[max-content_minmax(0,1fr)] lg:landscape:items-start lg:landscape:gap-5.5">
          <div className="relative hidden size-45 lg:landscape:block">
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
