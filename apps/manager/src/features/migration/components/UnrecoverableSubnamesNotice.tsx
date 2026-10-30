import { Trans } from '@lingui/react/macro'
import { CircleAlert } from 'lucide-react'

/** Subnames of the selected names that the upgrade leaves behind on ENSv1. */
export const UnrecoverableSubnamesNotice = ({
  names,
}: {
  readonly names: readonly string[]
}) => {
  if (names.length === 0) return null
  return (
    <section className="w-full max-w-189 rounded-xl border border-ens-garnet-900/10 bg-white/60 p-4 text-ens-garnet-900 text-sm leading-5">
      <h2 className="flex items-center gap-2 font-medium">
        <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
        <Trans>These subnames won&apos;t be upgraded</Trans>
      </h2>
      <p className="mt-2 text-ens-garnet-900/75">
        <Trans>
          They were created without publishing their names onchain, so they
          can&apos;t be recreated on ENSv2 and stop working once their parent is
          upgraded. Every other subname is upgraded with it.
        </Trans>
      </p>
      <ul className="mt-3 flex flex-col gap-1">
        {names.map((name) => (
          <li className="break-all font-medium" key={name}>
            {name}
          </li>
        ))}
      </ul>
    </section>
  )
}
