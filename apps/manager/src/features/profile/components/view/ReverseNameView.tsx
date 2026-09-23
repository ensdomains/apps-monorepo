import { Trans } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import type { Address } from 'viem'
import { truncateAddress } from '@/lib/utils'

export const ReverseNameView = ({
  name,
  address,
}: {
  readonly name: string
  readonly address: Address
}) => (
  <main className="mx-auto w-full max-w-[805px] space-y-6 px-4 pt-6 pb-12 md:pt-10">
    <div className="rounded-xl border border-ens-quartz-250 bg-white p-6">
      <h1 className="break-all font-semi-mono text-2xl text-ens-quartz-900">
        {name}
      </h1>
      <p className="mt-4 text-ens-quartz-500 text-sm">
        <Trans>Reverse record for {truncateAddress(address)}</Trans>
      </p>
      <Link
        className="mt-6 inline-flex h-12 items-center justify-center rounded bg-ens-lapis-core px-4 font-mono text-ens-lapis-bg text-sm uppercase hover:opacity-80"
        params={{ address }}
        to="/$address"
      >
        <Trans>View address</Trans>
      </Link>
    </div>
  </main>
)
