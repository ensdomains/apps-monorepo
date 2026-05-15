import { Trans } from '@lingui/react/macro'
import { LinkButton } from '@/components/ui/button'
import { MSymbol } from '@/components/ui/material-symbol'
import { isRenewableName } from '../utils/renewableName'

type RenewNameButtonProps = {
  name: string
}

export const RenewNameButton = ({ name }: RenewNameButtonProps) => {
  if (!isRenewableName(name)) {
    return null
  }

  return (
    <LinkButton params={{ name }} size="sm" to="/renew/$name" variant="outline">
      <Trans>Extend Name</Trans>
      <MSymbol className="ms-opsz-16 ms-wght-300" symbol="double_arrow" />
    </LinkButton>
  )
}
