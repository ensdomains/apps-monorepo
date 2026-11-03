import { Trans } from '@lingui/react/macro'

/** What upgrading a parent does to its included direct subnames. Shared by the upgrade dialog and the FAQ. */
export const SubnameUpgradeExplanation = () => (
  <ul className="list-disc space-y-2 pl-5">
    <li>
      <Trans>
        Its direct subnames move to ENSv2 with their current owners, including
        subnames held by other wallets. Those owners don&apos;t need to do
        anything.
      </Trans>
    </li>
    <li>
      <Trans>
        Subname records aren&apos;t copied. Each subname keeps its current
        resolver, so its addresses, avatar and other records keep working.
      </Trans>
    </li>
    <li>
      <Trans>
        Editing those records depends on that resolver. If it stops accepting
        changes, the subname owner can switch to a new resolver and set the
        records again.
      </Trans>
    </li>
    <li>
      <Trans>
        You keep control of the subnames as the parent&apos;s owner. They stay
        active for as long as the parent name does.
      </Trans>
    </li>
    <li>
      <Trans>
        Names you don&apos;t select stay on ENSv1, and their subnames keep
        working there.
      </Trans>
    </li>
  </ul>
)
