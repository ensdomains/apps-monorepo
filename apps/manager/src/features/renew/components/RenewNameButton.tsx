import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Button, LinkButton } from '@/components/ui/button'
import { MSymbol } from '@/components/ui/material-symbol'
import {
  profileExpiryDateFromSeconds,
  profileExpiryQuery,
} from '@/features/profile/service/profileExpiry'
import { canRenewV2Name } from '../utils/renewableName'
import { shouldShowThirdPartyRenewalWarning } from '../utils/thirdPartyRenewalWarning'
import { ThirdPartyRenewalDialog } from './ThirdPartyRenewalDialog'

type RenewNameButtonProps = {
  readonly isOwner?: boolean
  readonly name: string
}

export const RenewNameButton = ({ isOwner, name }: RenewNameButtonProps) => {
  const { data: expiryData } = useQuery({
    ...profileExpiryQuery(name),
  })
  const expiryDate = profileExpiryDateFromSeconds(expiryData?.expiry)

  if (!canRenewV2Name(name, expiryDate)) {
    return null
  }

  const buttonContent = (
    <>
      <Trans>Renew</Trans>
      <MSymbol className="ms-opsz-16 ms-wght-300" symbol="double_arrow" />
    </>
  )

  if (shouldShowThirdPartyRenewalWarning(isOwner)) {
    return (
      <ThirdPartyRenewalDialog
        name={name}
        trigger={
          <Button size="sm" type="button" variant="outline">
            {buttonContent}
          </Button>
        }
      />
    )
  }

  return (
    <LinkButton params={{ name }} size="sm" to="/renew/$name" variant="outline">
      {buttonContent}
    </LinkButton>
  )
}
