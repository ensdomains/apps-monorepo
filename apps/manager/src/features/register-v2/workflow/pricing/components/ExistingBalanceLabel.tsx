import { Trans, useLingui } from '@lingui/react/macro'
import { MSymbol } from '@/components/ui/material-symbol'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export const ExistingBalanceLabel = () => {
  const { t } = useLingui()

  return (
    <span className="flex items-center gap-1">
      <Trans>Existing balance</Trans>
      <Tooltip>
        <TooltipTrigger
          aria-label={t`Where did this come from?`}
          className="flex items-center text-ens-quartz-350"
          type="button"
        >
          <MSymbol className="ms-opsz-20 ms-wght-400" symbol="info" />
        </TooltipTrigger>
        <TooltipContent className="max-w-64 text-center">
          <Trans>
            Your own USDC, left in your ENS account by a payment you started
            earlier. It is spent first, so your wallet pays the rest. Nothing
            extra is charged for it.
          </Trans>
        </TooltipContent>
      </Tooltip>
    </span>
  )
}
