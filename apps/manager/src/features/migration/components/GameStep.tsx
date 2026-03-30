import { Trans } from '@lingui/react/macro'

type GameStepProps = {
  readonly onNext: () => void
}

export const GameStep = ({ onNext }: GameStepProps) => {
  return (
    <div className="relative z-10 mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-8 px-5 py-4">
      <p className="text-[32px] text-ens-garnet-900 leading-[1.1] tracking-[-0.64px]">
        <Trans>Upgrading your names...</Trans>
      </p>
      <p className="font-semi-mono text-[#e72a96] text-sm uppercase tracking-[0.12px]">
        WIP — Game Step
      </p>
      <button
        className="rounded-sm bg-ens-garnet-900 px-8 py-3 font-semi-mono text-[#fff6f9] text-sm uppercase tracking-[1.68px] shadow-[inset_0px_-3px_0px_0px_rgba(0,0,0,0.35)]"
        onClick={onNext}
        type="button"
      >
        <Trans>Complete</Trans>
      </button>
    </div>
  )
}
