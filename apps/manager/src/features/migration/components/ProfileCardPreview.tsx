import { SiFarcaster, SiX } from '@icons-pack/react-simple-icons'
import { Trans } from '@lingui/react/macro'
import { ArrowUpRight, Calendar, Copy, Mail } from 'lucide-react'

export const ProfileCardPreview = () => (
  <div className="flex h-80 w-57 flex-col overflow-hidden rounded-2xl border-[0.1px] border-[rgba(25,87,128,0.2)] bg-white shadow-[0px_5.7px_8.2px_0px_rgba(90,0,36,0.3)]">
    <div
      className="relative h-18 shrink-0"
      style={{
        background: [
          'radial-gradient(ellipse at 20% 50%, #6b2d7b 0%, transparent 60%)',
          'radial-gradient(ellipse at 80% 30%, #c4623a 0%, transparent 55%)',
          'radial-gradient(ellipse at 50% 80%, #2d6b5a 0%, transparent 50%)',
          'radial-gradient(ellipse at 70% 70%, #8b5a9b 0%, transparent 45%)',
          'radial-gradient(ellipse at 30% 20%, #3a7b6b 0%, transparent 50%)',
          'linear-gradient(135deg, #5a2d7b 0%, #7b4a3a 30%, #3a6b5a 60%, #9b5a8b 100%)',
        ].join(', '),
      }}
    >
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background: [
            'radial-gradient(circle at 15% 40%, #e0a040 0%, transparent 35%)',
            'radial-gradient(circle at 65% 25%, #40a0c0 0%, transparent 30%)',
            'radial-gradient(circle at 45% 65%, #c06040 0%, transparent 40%)',
          ].join(', '),
        }}
      />
    </div>

    <div className="relative z-10 -mt-4 ml-2.5">
      <div
        className="size-10 rounded-full border-[1.5px] border-white shadow-sm"
        style={{
          background: [
            'radial-gradient(ellipse at 30% 40%, #7b2d8b 0%, transparent 60%)',
            'radial-gradient(ellipse at 70% 60%, #5a8b6d 0%, transparent 55%)',
            'linear-gradient(160deg, #c4623a 0%, #7b4a8b 50%, #4a7b5a 100%)',
          ].join(', '),
        }}
      />
    </div>

    <div className="flex flex-1 flex-col gap-1.5 overflow-hidden px-2.5 pt-1 pb-2.5">
      <span className="w-fit rounded bg-ens-garnet-500 px-1.5 py-px font-medium text-white text-xs leading-snug">
        erni.eth
      </span>

      <div className="flex items-center gap-0.5 text-ens-garnet-500">
        <Calendar className="size-2.5 shrink-0 opacity-60" strokeWidth={1.5} />
        <p className="text-[9px] leading-tight">
          <span className="opacity-60">
            <Trans>Registered</Trans>
          </span>{' '}
          <span className="font-semibold">
            <Trans>August 28, 2024</Trans>
          </span>
        </p>
      </div>

      <p className="text-[11px] text-ens-garnet-900/45 leading-normal">
        <Trans>
          A scrappy generalist builder with taste. Senior Product Designer and
          Researcher at ENS Labs, dedicated to making web3 feel straightforward
          to newcomers.
        </Trans>
      </p>

      <div className="h-px bg-ens-garnet-500/8" />

      <p className="font-semibold text-[9px] text-ens-garnet-500 leading-tight">
        <Trans>links</Trans>
      </p>
      <div className="flex flex-wrap gap-1">
        <span className="inline-flex items-center gap-px rounded-full bg-ens-garnet-500/6 px-1 py-px text-[9px] text-ens-garnet-500">
          <SiX className="mr-1 size-2" />
          @erni_eth
          <ArrowUpRight className="size-2 opacity-50" />
        </span>
        <span className="inline-flex items-center gap-px rounded-full bg-ens-garnet-500/6 px-1 py-px text-[9px] text-ens-garnet-500">
          <SiFarcaster className="mr-1 size-2" />
          @ernieth
          <ArrowUpRight className="size-2 opacity-50" />
        </span>
      </div>
      <span className="inline-flex w-fit items-center gap-px rounded-full bg-ens-garnet-500/6 px-1 py-px text-[9px] text-ens-garnet-500">
        <Mail className="mr-1 size-2" strokeWidth={1.5} />
        asmallrelish@gmail.com
        <Copy className="size-2 opacity-40" strokeWidth={1.5} />
      </span>
    </div>
  </div>
)
