import { Trans, useLingui } from '@lingui/react/macro'
import { Check, Copy } from 'lucide-react'
import type { Address } from 'viem'
import { MSymbol } from '@/components/ui/material-symbol'
import { useCopyFeedback } from '@/hooks/useCopyFeedback'
import { cn, truncateAddress } from '@/lib/utils'
import { formatProfileDetailDate } from './ProfileViewNew.helpers'

type ProfileDetailsProps = {
  readonly displayExpiryDate?: Date | null
  readonly owner?: Address
  readonly ownerReverseName?: string | null
  readonly registrationDate?: number | null
}

const detailLabelClassName =
  'flex items-center text-ens-quartz-400 text-xs leading-[21px] lg:landscape:text-base lg:landscape:leading-normal'
const detailValueClassName =
  'font-sans text-[11px] text-ens-quartz-700 leading-[18px] tracking-[0.77px] lg:landscape:text-[13px] lg:landscape:leading-normal lg:landscape:tracking-[0.91px]'

export const ProfileViewNewNameBadge = ({
  name,
}: {
  readonly name: string
}) => (
  <div className="inline-flex max-w-full items-center rounded-[3px] bg-(--theme-color) px-3 py-1.5 text-white">
    <h1 className="truncate font-semi-mono text-[32px] leading-[1.12]">
      {name}
    </h1>
  </div>
)

const ProfileDetailCopyButton = ({ value }: { readonly value: string }) => {
  const { t } = useLingui()
  const { copied, copy } = useCopyFeedback()

  return (
    <button
      aria-label={t`Copy to clipboard`}
      className="inline-flex size-4 shrink-0 items-center justify-center text-ens-quartz-400 lg:landscape:size-5"
      onClick={() => copy(value)}
      title={t`Copy to clipboard`}
      type="button"
    >
      {copied ? (
        <Check className="size-3.5 lg:landscape:size-4" />
      ) : (
        <Copy className="size-3.5 lg:landscape:size-4" />
      )}
    </button>
  )
}

const ProfileDetailDateValue = ({
  date,
}: {
  readonly date: Date | null | undefined
}) => {
  const mobileValue = formatProfileDetailDate(date)
  const desktopValue = formatProfileDetailDate(date, 'desktop')

  if (!mobileValue || !desktopValue) return null

  return (
    <>
      <span className="lg:landscape:hidden">{mobileValue}</span>
      <span className="hidden lg:landscape:inline">{desktopValue}</span>
    </>
  )
}

const ProfileDetail = ({
  icon,
  label,
  value,
  copyValue,
  iconGapClassName = 'gap-3',
}: {
  readonly icon: React.ReactNode
  readonly label: React.ReactNode
  readonly value: React.ReactNode
  readonly copyValue?: string
  readonly iconGapClassName?: string
}) => (
  <div className="flex min-w-0 flex-col items-start gap-0 lg:landscape:flex-row lg:landscape:items-center lg:landscape:gap-1.5">
    <div className={cn(detailLabelClassName, iconGapClassName)}>
      {icon}
      <span>{label}</span>
    </div>
    <div className="flex min-w-0 items-center gap-1 pl-6 lg:landscape:pl-0">
      <span className={`${detailValueClassName} truncate`}>{value}</span>
      {copyValue ? <ProfileDetailCopyButton value={copyValue} /> : null}
    </div>
  </div>
)

export const ProfileViewNewDetails = ({
  displayExpiryDate,
  owner,
  ownerReverseName,
  registrationDate,
}: ProfileDetailsProps) => {
  const registrationDetailDate = registrationDate
    ? new Date(registrationDate * 1000)
    : undefined
  const formattedRegistrationDate = formatProfileDetailDate(
    registrationDetailDate,
  )
  const formattedExpiryDate = formatProfileDetailDate(displayExpiryDate)

  return (
    <div className="grid w-full grid-cols-3 gap-3 lg:landscape:flex lg:landscape:max-w-full lg:landscape:flex-wrap lg:landscape:items-center lg:landscape:gap-x-6 lg:landscape:gap-y-3">
      {owner ? (
        <ProfileDetail
          copyValue={owner}
          icon={
            <MSymbol className="ms-opsz-20 ms-wght-300" symbol="key_vertical" />
          }
          iconGapClassName="gap-0.5"
          label={<Trans>Owner</Trans>}
          value={ownerReverseName || truncateAddress(owner)}
        />
      ) : null}
      {formattedRegistrationDate ? (
        <ProfileDetail
          icon={
            <MSymbol
              className="ms-opsz-20 ms-wght-300"
              symbol="calendar_clock"
            />
          }
          label={<Trans>Registered</Trans>}
          value={<ProfileDetailDateValue date={registrationDetailDate} />}
        />
      ) : null}
      {formattedExpiryDate ? (
        <ProfileDetail
          icon={<MSymbol className="ms-opsz-20 ms-wght-300" symbol="history" />}
          label={<Trans>Expires</Trans>}
          value={<ProfileDetailDateValue date={displayExpiryDate} />}
        />
      ) : null}
    </div>
  )
}
