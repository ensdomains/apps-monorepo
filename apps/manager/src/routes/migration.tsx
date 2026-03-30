import { Trans } from '@lingui/react/macro'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/migration')({
  component: MigrationPage,
})

function MigrationPage() {
  return (
    <div className="relative flex min-h-[calc(100dvh-56px)] flex-col items-center justify-center overflow-hidden bg-linear-to-b from-[#feeaf0] to-[#ffc6e0]">
      {/* Grain texture */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full opacity-40"
      >
        <filter id="migration-page-grain">
          <feTurbulence
            baseFrequency="0.7"
            numOctaves="4"
            seed="3"
            stitchTiles="stitch"
            type="fractalNoise"
          />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0.96
                    0 0 0 0 0.196
                    0 0 0 0 0.576
                    0 0 0 0.5 0"
          />
        </filter>
        <rect filter="url(#migration-page-grain)" height="100%" width="100%" />
      </svg>
      <div className="relative z-10 flex flex-col items-center gap-4">
        <h1 className="text-[40px] text-ens-garnet-900 leading-[1.1] tracking-[-0.8px]">
          <Trans>Name Migration</Trans>
        </h1>
        <p className="font-semi-mono text-[#e72a96] text-sm uppercase tracking-[0.12px]">
          <Trans>Work in progress</Trans>
        </p>
      </div>
    </div>
  )
}
