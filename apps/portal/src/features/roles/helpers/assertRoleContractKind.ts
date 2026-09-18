import { TaggedError } from '@ens-apps/utils/neverthrow'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { queryClient } from '@/utils/queryClient'
import { getRoleContractKindQueryOptions } from '../queries/getRoleContractKind'
import type { RoleContractKind } from '../utils/roleContractKind'

export class RoleContractMismatchError extends TaggedError(
  'RoleContractMismatchError',
)<{
  readonly address: Address
  readonly expected: RoleContractKind
  readonly actual: RoleContractKind
}> {}

const describeKind = (kind: RoleContractKind) =>
  match(kind)
    .with('permissioned-resolver', () => 'an ENS permissioned resolver')
    .with('registry', () => 'an ENS registry')
    .with(
      'unsupported',
      () => 'neither an ENS registry nor a permissioned resolver',
    )
    .exhaustive()

/**
 * Throws unless `address` uses the `expected` role model. Called by every
 * role-write helper before it encodes a bitmap, so a page that skipped its own
 * gate still can't send one model's bits to the other. Reads fresh rather than
 * trusting a page-load answer.
 */
export const assertRoleContractKind = async (
  address: Address,
  expected: Exclude<RoleContractKind, 'unsupported'>,
): Promise<void> => {
  const actual = await queryClient.fetchQuery({
    ...getRoleContractKindQueryOptions({ address }),
    staleTime: 0,
  })

  if (actual !== expected) {
    throw new RoleContractMismatchError({
      address,
      expected,
      actual,
      message: `${address} is ${describeKind(actual)}, not ${describeKind(expected)}. No roles were changed.`,
    })
  }
}
