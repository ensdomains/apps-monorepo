import type { Address } from 'viem'
import type { ClassifiedName, MigrationTokenType } from '../classifyNames'

const OWNER = '0x000000000000000000000000000000000000dEaD' as Address

const make = (
  name: string,
  tokenType: MigrationTokenType,
  parentName: string | null,
): ClassifiedName => {
  const label = name.split('.')[0] ?? name
  return {
    domain: { name, labelName: label, parent: null } as never,
    tokenType,
    label,
    parentName,
    fuses: 0n,
    tokenHolder: OWNER,
    v1ResolverAddress: null,
    resolverStrategy: 'to-owned-permres',
    managerAddress: null,
  }
}

export const largeClassified: readonly ClassifiedName[] = [
  ...Array.from({ length: 100 }, (_, i) =>
    make(`u${i}.eth`, 'unwrapped', null),
  ),
  ...Array.from({ length: 50 }, (_, i) => make(`w${i}.eth`, 'unlocked', null)),
  ...Array.from({ length: 50 }, (_, i) =>
    make(`l${i}.eth`, 'locked-2ld', null),
  ),
  ...Array.from({ length: 50 }, (_, i) => {
    const parentIdx = i % 5
    return make(`c${i}.l${parentIdx}.eth`, 'locked-child', `l${parentIdx}.eth`)
  }),
]
