import { Trans, useLingui } from '@lingui/react/macro'
import { MSymbol } from '@/components/ui/material-symbol'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export const NetworkFeeLabel = () => {
  const { t } = useLingui()

  return (
    <span className="flex items-center gap-1">
      <Trans>Estimated network fee</Trans>
      <Tooltip>
        <TooltipTrigger
          aria-label={t`What is the network fee?`}
          className="flex items-center text-ens-quartz-350"
          type="button"
        >
          <MSymbol className="ms-opsz-20 ms-wght-400" symbol="info" />
        </TooltipTrigger>
        <TooltipContent className="max-w-64 text-center">
          <Trans>
            This funds your ENS account for the network fee. What the network
            doesn't use stays there, as existing balance for your next payment.
          </Trans>
        </TooltipContent>
      </Tooltip>
    </span>
  )
}
