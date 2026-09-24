import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import { getNameRegistries } from '@ensdomains/ensjs/public/v2'
import {
  createPublicClient,
  custom,
  encodeAbiParameters,
  zeroAddress,
} from 'viem'
import { sepolia } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'
import { getPrimaryNameForwardAddress } from '@/features/profile/service/primaryNameForwardAddress'
import { managerEnsChain } from './ensChain'

const ownerAddress = '0x1234567890123456789012345678901234567890'

describe('Manager ENS deployment', () => {
  it('uses the current Sepolia Universal Resolver instead of a pinned deployment', () => {
    expect(managerEnsChain.contracts.ensUniversalResolver.address).toBe(
      extendChainWithEns(sepolia).contracts.ensUniversalResolver.address,
    )
  })

  it('routes registry ancestry lookup through the ENS helper', async () => {
    const registries = [
      zeroAddress,
      managerEnsChain.contracts.ensRegistry.address,
      '0x8115186E8f2E0B0281e86ab91f0f48Ba90364354',
    ] as const
    const request = vi
      .fn()
      .mockResolvedValue(
        encodeAbiParameters([{ type: 'address[]' }], [registries]),
      )
    const client = createPublicClient({
      chain: managerEnsChain,
      transport: custom({ request }),
    })

    await expect(
      getNameRegistries(client, { name: 'young-zebra.eth' }),
    ).resolves.toEqual(registries)
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'eth_call',
        params: [
          expect.objectContaining({
            to: managerEnsChain.contracts.ensUniversalHelper.address,
          }),
          'latest',
        ],
      }),
      undefined,
    )
  })

  it('uses the current Universal Resolver for the primary-name forward check', async () => {
    const record = encodeAbiParameters([{ type: 'bytes' }], [ownerAddress])
    const request = vi
      .fn()
      .mockResolvedValue(
        encodeAbiParameters(
          [{ type: 'bytes' }, { type: 'address' }],
          [record, ownerAddress],
        ),
      )
    const client = createPublicClient({
      chain: managerEnsChain,
      transport: custom({ request }),
    })

    await expect(
      getPrimaryNameForwardAddress(client, 'young-zebra.eth'),
    ).resolves.toEqual(ownerAddress)
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'eth_call',
        params: [
          expect.objectContaining({
            to: managerEnsChain.contracts.ensUniversalResolver.address,
          }),
          'latest',
        ],
      }),
      undefined,
    )
  })
})
