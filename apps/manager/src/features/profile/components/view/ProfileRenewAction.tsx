import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { LinkButton } from '@/components/ui/button'
import { MSymbol } from '@/components/ui/material-symbol'
import {
  profileExpiryDateFromSeconds,
  profileExpiryQuery,
} from '@/features/profile/service/profileExpiry'
import { ThirdPartyRenewalDialog } from '@/features/renew/components/ThirdPartyRenewalDialog'
import { canRenewV2Name } from '@/features/renew/utils/renewableName'
import { shouldShowThirdPartyRenewalWarning } from '@/features/renew/utils/thirdPartyRenewalWarning'

type ProfileRenewActionProps = {
  readonly className: string
  readonly isOwner?: boolean
  readonly name: string
}

export const ProfileRenewAction = ({
  className,
  isOwner,
  name,
}: ProfileRenewActionProps) => {
  const { data: expiryData } = useQuery({
    ...profileExpiryQuery(name),
  })
  const expiryDate = profileExpiryDateFromSeconds(expiryData?.expiry)

  if (!canRenewV2Name(name, expiryDate)) return null

  const buttonContent = (
    <>
      <Trans>Renew Name</Trans>
      <MSymbol
        aria-hidden="true"
        className="ms-opsz-20 ms-wght-600 text-base leading-none"
        symbol="double_arrow"
      />
    </>
  )

  if (isOwner === undefined) {
    return (
      <button className={className} disabled type="button">
        {buttonContent}
      </button>
    )
  }

  if (shouldShowThirdPartyRenewalWarning(isOwner)) {
    return (
      <ThirdPartyRenewalDialog
        name={name}
        trigger={
          <button className={className} type="button">
            {buttonContent}
          </button>
        }
      />
    )
  }

  return (
    <LinkButton className={className} params={{ name }} to="/renew/$name">
      {buttonContent}
    </LinkButton>
  )
}
