import { Trans } from '@lingui/react/macro'
import ethereumIcon from '@/assets/icons/ethereum-color.svg'
import { Button } from '@/components/ens-consumer/button/Button'

export const ConnectedPaymentButtons = ({
  canNext,
  isPreparing,
  onNext,
  onEth,
}: {
  readonly canNext: boolean
  readonly isPreparing: boolean
  readonly onNext: () => void
  readonly onEth?: () => void
}) => (
  <>
    <Button
      className="w-full font-medium font-mono uppercase tracking-widest"
      color="blue"
      disabled={!canNext && !isPreparing}
      loading={isPreparing}
      onClick={isPreparing ? undefined : onNext}
      size="lg"
    >
      {isPreparing ? (
        <Trans>Preparing checkout...</Trans>
      ) : (
        <Trans>Pay with stablecoins</Trans>
      )}
    </Button>
    {onEth && (
      <Button
        className="w-full gap-2 border-ens-lapis-core bg-white font-medium font-mono text-ens-lapis-core uppercase tracking-widest hover:bg-ens-quartz-50 disabled:opacity-50"
        color="none"
        disabled={!canNext || isPreparing}
        onClick={onEth}
        size="lg"
      >
        <img alt="" className="h-5 w-5" src={ethereumIcon} />
        <Trans>Pay with ETH</Trans>
      </Button>
    )}
  </>
)
