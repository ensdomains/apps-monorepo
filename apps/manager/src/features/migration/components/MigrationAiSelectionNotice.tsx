import { Trans } from '@lingui/react/macro'
import { CircleAlert } from 'lucide-react'
import type { proposeRequestedMigrationNames } from './migrationAiPreset'

type Proposal = ReturnType<typeof proposeRequestedMigrationNames>

export const MigrationAiSelectionNotice = ({
  dependencyConflicts,
  requestedProposal,
  isPending,
}: {
  readonly dependencyConflicts: Readonly<Proposal['dependencyConflicts']>
  readonly requestedProposal?: Proposal
  readonly isPending: boolean
}) => {
  if (isPending) return null
  const unselected = requestedProposal
    ? [...requestedProposal.unavailable, ...requestedProposal.excluded]
    : []
  return (
    <>
      {dependencyConflicts.length > 0 && (
        <div
          className="flex w-full max-w-160 items-start gap-3 rounded-lg bg-ens-garnet-50/70 px-4 py-4 text-ens-garnet-900"
          role="alert"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <div className="flex flex-col gap-2 text-sm leading-5">
            <p>
              <Trans>
                Some requested subnames depend on an excluded parent. They start
                unselected so the parent is not added for you. Review this
                before upgrading:
              </Trans>
            </p>
            <ul className="list-disc pl-5">
              {dependencyConflicts.map(({ name, excludedParent }) => (
                <li key={name}>
                  {name} → {excludedParent}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {unselected.length > 0 && (
        <div
          className="w-full max-w-160 rounded-lg bg-ens-garnet-50/70 px-4 py-4 text-ens-garnet-900 text-sm leading-5"
          role="alert"
        >
          <p>
            <Trans>
              These requested names were not selected. They are unavailable,
              ineligible, or conflict with your upgrade choices:
            </Trans>
          </p>
          <ul className="list-disc pl-5">
            {unselected.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
