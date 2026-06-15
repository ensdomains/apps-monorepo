import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { LinkButton } from '@/components/ui/button'
import { MSymbol } from '@/components/ui/material-symbol'
import {
  profileExpiryDateFromSeconds,
  profileExpiryQuery,
} from '@/features/profile/service/profileExpiry'
import { canRenewV2Name } from '../utils/renewableName'

type RenewNameButtonProps = {
  name: string
}

export const RenewNameButton = ({ name }: RenewNameButtonProps) => {
  const { data: expiryData } = useQuery({
    ...profileExpiryQuery(name),
  })
  const expiryDate = profileExpiryDateFromSeconds(expiryData?.expiry)

  if (!canRenewV2Name(name, expiryDate)) {
    return null
  }

  return (
    <LinkButton params={{ name }} size="sm" to="/renew/$name" variant="outline">
      <Trans>Renew</Trans>
      <MSymbol className="ms-opsz-16 ms-wght-300" symbol="double_arrow" />
    </LinkButton>
  )
}
