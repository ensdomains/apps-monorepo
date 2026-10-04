import { ens_normalize } from '@adraffy/ens-normalize'
import {
  fetchAllPages,
  MAX_PAGE_SIZE,
  nullOnNotFound,
  type SubnameRow,
} from '@ens-apps/bigname'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise, ok } from 'neverthrow'
import { type Address, getAddress, type Hex, labelhash } from 'viem'
import { bigname } from '@/lib/bigname'

class GetSubnamesError extends TaggedError('GetSubnamesError')<{
  cause: unknown
}> {}

export type Subname = {
  name: string
  labelName: string
  labelhash: Hex
  namehash: Hex
  /** The token holder: the NameWrapper holder for a wrapped ENSv1 subname. */
  owner: Address
}

type GetSubnamesParameters = {
  name: string
}

const isNormalizedLabel = (label: string) => {
  try {
    return ens_normalize(label) === label
  } catch {
    return false
  }
}

/**
 * The row's label, when bigname could state it as a name. A child whose label
 * it cannot state comes back as `[<labelhash>].<parent>` or as escaped bytes;
 * neither is a name, and neither may reach a name route or a label-keyed write.
 * bigname says to tell them apart by hash rather than by the text, so the
 * label must also hash to the row's `labelhash`. Only the first label is read:
 * the rest of the row's name is not trusted to match the parent (WEB-1542).
 */
const nameFormLabel = (row: SubnameRow) => {
  const label = row.name.split('.')[0] ?? ''
  return isNormalizedLabel(label) && labelhash(label) === row.labelhash
    ? label
    : null
}

/**
 * Maps subname rows to the list the subnames page and the create/delete flows
 * use. Rows without a current owner are dropped (the ENSv1 list this replaces
 * excluded deleted names), and so are non-name rows, which could not be linked
 * or acted on. Each name is built from its label and the parent asked for, so
 * a parent whose own label was learned after the child was indexed still
 * links its children by the parent's name (WEB-1542).
 */
export const toSubnames = (
  rows: readonly SubnameRow[],
  parentName: string,
): Subname[] =>
  rows.flatMap((row) => {
    const labelName = nameFormLabel(row)
    return row.owner && labelName
      ? [
          {
            name: `${labelName}.${parentName}`,
            labelName,
            labelhash: row.labelhash,
            namehash: row.namehash,
            owner: getAddress(row.owner),
          },
        ]
      : []
  })

export const getSubnames = ResultFn(async function* ({
  name,
}: GetSubnamesParameters) {
  // A parent bigname has not indexed has no subnames to list.
  const result = yield* fromPromise(
    nullOnNotFound(
      fetchAllPages((cursor) =>
        bigname.listSubnames(name, {
          include_expired: false,
          sort: 'name',
          page_size: MAX_PAGE_SIZE,
          cursor,
        }),
      ),
    ),
    (e) => new GetSubnamesError({ cause: e }),
  )

  return ok(toSubnames(result?.rows ?? [], name))
})

const getSubnamesQueryKey = createQueryKey<'get-subnames', { name: string }>(
  'get-subnames',
)

export const getSubnamesQueryOptions = ({ name }: GetSubnamesParameters) =>
  resultQueryOptions({
    queryKey: getSubnamesQueryKey({ name }),
    queryFn: ({ queryKey: [, params] }) => getSubnames(params),
  })

/**
 * Exact number of live subnames (bigname's `total_count` with expired children
 * excluded), including children whose label bigname cannot state.
 */
export const getSubnameCount = ResultFn(async function* ({
  name,
}: GetSubnamesParameters) {
  const page = yield* fromPromise(
    nullOnNotFound(
      bigname.listSubnames(name, { include_expired: false, page_size: 1 }),
    ),
    (e) => new GetSubnamesError({ cause: e }),
  )
  return ok(page?.page.total_count ?? 0)
})

// Shares the `get-subnames` prefix, so invalidating a parent's subnames list
// (create/delete/transfer) refreshes its count too.
const getSubnameCountQueryKey = createQueryKey<
  'get-subnames',
  { name: string; view: 'count' }
>('get-subnames')

export const getSubnameCountQueryOptions = ({ name }: GetSubnamesParameters) =>
  resultQueryOptions({
    queryKey: getSubnameCountQueryKey({ name, view: 'count' }),
    queryFn: ({ queryKey: [, { name }] }) => getSubnameCount({ name }),
  })
