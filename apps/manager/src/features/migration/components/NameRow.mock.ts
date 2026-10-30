import { makeClassified } from '../service/_fixtures'
import type { CopyClassifiedName } from '../service/classifyNames'

const name = makeClassified({ name: 'lunaverse.eth' })

export const nameRowFixture = {
  ...name,
  domain: { ...name.domain, labelName: 'lunaverse' },
}

export const nameRowStates = [
  { id: 'selected', isSelected: true, isPrimary: false },
  { id: 'selected-primary', isSelected: true, isPrimary: true },
  { id: 'unselected', isSelected: false, isPrimary: false },
  { id: 'unselected-primary', isSelected: false, isPrimary: true },
]

export const gracePeriodRowFixtures = [
  makeClassified({ name: 'allada.eth', id: 'allada.eth' }),
  makeClassified({ name: 'allana.eth', id: 'allana.eth' }),
]

export const longGracePeriodRowFixture = makeClassified({
  name: 'a-very-long-name-in-grace-period.eth',
})

const SUBNAME_OWNER = '0xc1e1d3bc99fb4b6529ba7be62e628fcd74cd8d8f'
const SUBNAME_RESOLVER = '0xf29100983e058b709f3d539b0c765937b804ac15'

export const subnameParentFixture = makeClassified({
  name: 'echidnas.eth',
  tokenHolder: SUBNAME_OWNER,
})

export const includedSubnameFixtures: readonly CopyClassifiedName[] = [
  {
    ...makeClassified({
      action: 'copy',
      name: 'two.echidnas.eth',
      id: 'two.echidnas.eth',
      tokenHolder: SUBNAME_OWNER,
      v1ResolverAddress: SUBNAME_RESOLVER,
    }),
    recreationRoot: 'echidnas.eth',
    resolverStrategy: 'keep-v1',
  },
  {
    ...makeClassified({
      action: 'copy',
      name: 'another-wallet.echidnas.eth',
      id: 'another-wallet.echidnas.eth',
      tokenHolder: '0x0000000000000000000000000000000000000002',
      v1ResolverAddress: SUBNAME_RESOLVER,
    }),
    recreationRoot: 'echidnas.eth',
    resolverStrategy: 'keep-v1',
  },
  {
    ...makeClassified({
      action: 'copy',
      name: 'a-very-long-subname-without-a-resolver.echidnas.eth',
      id: 'a-very-long-subname-without-a-resolver.echidnas.eth',
      tokenHolder: SUBNAME_OWNER,
      v1ResolverAddress: null,
    }),
    recreationRoot: 'echidnas.eth',
    resolverStrategy: 'keep-v1',
  },
]
