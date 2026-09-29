import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import type { Address, PublicClient } from 'viem'
import { sepolia } from 'viem/chains'
import type {
  ClassifiedName,
  CopyClassifiedName,
  CopyTokenType,
  DirectClassifiedName,
  MigrationTokenType,
} from '../classifyNames'
import type { V1Domain } from '../v1SubgraphClient'

export const OWNER: Address = '0x0000000000000000000000000000000000000001'
export const OTHER: Address = '0x0000000000000000000000000000000000000002'

// The preflight checks resolve their contracts from the client's chain, so the
// fixture has to carry the ENS-extended one. A chainless client is rejected
// by design.
export const publicClient = {
  chain: extendChainWithEns(sepolia),
} as unknown as PublicClient

export const ok = <T>(result: T) => ({ status: 'success' as const, result })
export const fail = () => ({
  status: 'failure' as const,
  error: new Error('reverted'),
  result: undefined,
})

export type ClassifiedOverrides = {
  action?: ClassifiedName['action']
  tokenType?: ClassifiedName['tokenType']
  copySource?: 'name-wrapper' | 'registry'
  sourceExpiry?: bigint
  resolverStrategy?: ClassifiedName['resolverStrategy']
  v1ResolverAddress?: string | null
  parentName?: string | null
  name?: string
  labelhash?: string
  id?: string
  fuses?: bigint
  label?: string
  managerAddress?: Address | null
  tokenHolder?: Address
}

const makeClassifiedDomain = (o: ClassifiedOverrides): V1Domain =>
  ({
    id: o.id ?? '0x01',
    labelhash: o.labelhash ?? '0x02',
    name: o.name ?? 'alice.eth',
  }) as unknown as V1Domain

const makeClassifiedBase = (o: ClassifiedOverrides) => ({
  label: o.label ?? 'alice',
  parentName: o.parentName === undefined ? 'eth' : o.parentName,
  fuses: o.fuses ?? 0n,
  tokenHolder: o.tokenHolder ?? OWNER,
  v1ResolverAddress:
    o.v1ResolverAddress === undefined ? null : o.v1ResolverAddress,
  domain: makeClassifiedDomain(o),
})

const isCopyOverride = (o: ClassifiedOverrides): boolean =>
  o.action === 'copy' ||
  o.tokenType === 'unlocked-child' ||
  o.tokenType === 'registry-child'

const copyTokenTypeFor = (o: ClassifiedOverrides): CopyTokenType =>
  o.tokenType === 'registry-child' ? 'registry-child' : 'unlocked-child'

export function makeClassified(
  o?: ClassifiedOverrides & {
    action?: 'migrate'
    tokenType?: MigrationTokenType
  },
): DirectClassifiedName
export function makeClassified(
  o: ClassifiedOverrides & ({ action: 'copy' } | { tokenType: CopyTokenType }),
): CopyClassifiedName
export function makeClassified(o?: ClassifiedOverrides): ClassifiedName
export function makeClassified(o: ClassifiedOverrides = {}): ClassifiedName {
  const base = makeClassifiedBase(o)
  if (isCopyOverride(o)) {
    const tokenType = copyTokenTypeFor(o)
    return {
      ...base,
      action: 'copy',
      tokenType,
      copySource:
        o.copySource ??
        (tokenType === 'registry-child' ? 'registry' : 'name-wrapper'),
      sourceExpiry: o.sourceExpiry ?? 4_102_444_800n,
      resolverStrategy: 'to-owned-permres',
      managerAddress: null,
    }
  }

  return {
    ...base,
    action: 'migrate',
    tokenType:
      o.tokenType &&
      o.tokenType !== 'unlocked-child' &&
      o.tokenType !== 'registry-child'
        ? o.tokenType
        : 'unwrapped',
    resolverStrategy: o.resolverStrategy ?? 'to-owned-permres',
    managerAddress: o.managerAddress ?? null,
  }
}
