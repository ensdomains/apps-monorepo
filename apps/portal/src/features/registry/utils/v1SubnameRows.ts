import type { Address } from 'viem'
import type { SubnameRow } from '@/features/names/components/SubnamesTable'
import type { SubnamesPage } from '@/features/profile/hooks/useSubnames'
import type { V1ParentState } from '@/features/transfer/types'
import {
  getV1SubnameDeleteAccess,
  type V1SubnameDelete,
  type V1SubnameDeleteGate,
} from './delete-v1-subname.helpers'

const BLOCKED_REASONS: Record<
  Exclude<V1SubnameDeleteGate['reason'], 'ok'>,
  string
> = {
  'has-subnames': 'It has subnames of its own. Delete those first.',
  emancipated: 'Its owner has full control of it, so only they can delete it.',
  'wrapper-mismatch':
    'It’s wrapped but its parent isn’t. Wrap the parent to delete it here.',
  'unknown-label': 'Its label isn’t known yet, so it can’t be deleted here.',
  'burned-fuse':
    'Deleting it re-issues it first, and its parent can no longer issue subnames.',
  locked: 'It’s locked, so it can’t be deleted.',
  unknown: 'Couldn’t check whether it can be deleted.',
}

export type V1SubnameRows = {
  readonly rows: readonly SubnameRow[]
  /** The delete each deletable row takes, by row name. */
  readonly deletes: ReadonlyMap<string, V1SubnameDelete>
}

/**
 * The V1 table rows, each gated for delete by the connected wallet: as the
 * parent's holder (`parent`, null when it isn't), or as the subname's own
 * holder. A row the wallet holds neither way offers no delete.
 */
export const toV1SubnameRows = (
  subnames: SubnamesPage['subnames'],
  parent: V1ParentState | null,
  account: Address | undefined,
): V1SubnameRows => {
  const gated = subnames.map((subname) => ({
    subname,
    gate: account
      ? getV1SubnameDeleteAccess(
          parent,
          {
            labelName: subname.labelName,
            wrapping: subname.v1Wrapping,
            subnameCount: subname.subnameCount,
            holder: subname.owner,
          },
          account,
        )
      : null,
  }))
  return {
    rows: gated.map(({ subname, gate }) => ({
      name: subname.name,
      owner: subname.owner,
      labelhash: subname.labelhash,
      canDelete: gate?.reason === 'ok',
      deleteBlockedReason:
        gate && gate.reason !== 'ok' ? BLOCKED_REASONS[gate.reason] : undefined,
    })),
    deletes: new Map(
      gated.flatMap(({ subname, gate }) =>
        gate?.reason === 'ok'
          ? [
              [
                subname.name,
                {
                  subname: subname.name,
                  labelhash: subname.labelhash,
                  labelName: subname.labelName,
                  target: gate.target,
                },
              ] as const,
            ]
          : [],
      ),
    ),
  }
}
