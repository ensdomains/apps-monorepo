import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import { ensChain } from '@/lib/wagmi'
import { isOfficialPublicResolver } from './universalResolver'

describe('isOfficialPublicResolver', () => {
  it('runs on Sepolia', () => {
    expect(ensChain.id).toBe(sepolia.id)
  })

  it.each([
    [
      'the current PublicResolver',
      getChainContractAddress({
        chain: ensChain,
        contract: 'ensPublicResolver',
      }),
      true,
    ],
    [
      'the previous PublicResolver',
      '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD',
      true,
    ],
    ['any other resolver', '0x0822d199699f0a9D378617817a1439663234a126', false],
  ] as const)('recognizes %s: %s', (_case, address, expected) => {
    expect(isOfficialPublicResolver(address)).toBe(expected)
  })
})
