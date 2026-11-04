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
          We can&apos;t read their full names, because only a hashed form was
          ever saved onchain. They stop working once their parent is upgraded
          and can&apos;t be upgraded later. Every other subname is upgraded with
          it.
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
