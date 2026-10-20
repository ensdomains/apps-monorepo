import type { SubnameRow } from '@/features/names/components/SubnamesTable'
import type { SubnamesPage } from '@/features/profile/hooks/useSubnames'
import type { V1SubnameParentGate } from './create-subname.helpers'
import {
  getV1SubnameDeleteGate,
  type V1SubnameDelete,
  type V1SubnameDeleteGate,
} from './delete-v1-subname.helpers'

const BLOCKED_REASONS: Record<
  Exclude<V1SubnameDeleteGate['reason'], 'ok'>,
  string
> = {
  'has-subnames': 'It has subnames of its own. Delete those first.',
  emancipated:
    'Its parent gave up control of it. Only its owner can delete it.',
  'wrapper-mismatch': 'It is wrapped under an unwrapped name.',
  'unknown-label': 'Its label is unknown, which the NameWrapper needs.',
  'burned-fuse': 'This name burned CANNOT_CREATE_SUBDOMAIN.',
  unknown: 'Couldn’t check whether it can be deleted.',
}

export type V1SubnameRows = {
  readonly rows: readonly SubnameRow[]
  /** The delete each deletable row takes, by row name. */
  readonly deletes: ReadonlyMap<string, V1SubnameDelete>
}

/**
 * The V1 table rows, each gated for delete by the parent's holder. With no
 * holder connected, no row offers a delete.
 */
export const toV1SubnameRows = (
  subnames: SubnamesPage['subnames'],
  parentGate: V1SubnameParentGate | null,
): V1SubnameRows => {
  const gated = subnames.map((subname) => ({
    subname,
    gate:
      parentGate?.reason === 'ok'
        ? getV1SubnameDeleteGate(parentGate.parent, {
            labelName: subname.labelName,
            wrapping: subname.v1Wrapping,
            subnameCount: subname.subnameCount,
          })
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
