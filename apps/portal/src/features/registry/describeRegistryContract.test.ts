import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import { ensChain } from '@/lib/wagmi'
import { describeRegistryContract } from './describeRegistryContract'

const ETH_REGISTRY = getChainContractAddress({
  chain: ensChain,
  contract: 'ensRegistry',
})
const ROOT = '0x2222222222222222222222222222222222222222' as Address
const OTHER = '0x1111111111111111111111111111111111111111' as Address

describe('describeRegistryContract', () => {
  it('names the .eth registry by the deployment address', () => {
    expect(
      describeRegistryContract({ address: ETH_REGISTRY, rootAddress: ROOT })
        .type,
    ).toBe('Official ENS V2 .eth registry')
  })

  it('names the root registry by the address .eth hangs off', () => {
    expect(
      describeRegistryContract({ address: ROOT, rootAddress: ROOT }).type,
    ).toBe('Official ENS V2 root registry')
  })

  it('does not take an unnamed registry for the root', () => {
    expect(
      describeRegistryContract({ address: OTHER, rootAddress: ROOT }).type,
    ).toBe('Verified ENS V2 permissioned registry')
  })

  it('names nothing root while the root address is unknown', () => {
    expect(
      describeRegistryContract({ address: OTHER, rootAddress: null }).type,
    ).toBe('Verified ENS V2 permissioned registry')
  })

  it('treats every other indexed registry as a verified permissioned one', () => {
    const description = describeRegistryContract({
      address: OTHER,
      rootAddress: ROOT,
    })

    expect(description.type).toBe('Verified ENS V2 permissioned registry')
    expect(description.docsHref).toBe(
      'https://docs.ens.domains/contracts/ensv2/overview/',
    )
  })
})
