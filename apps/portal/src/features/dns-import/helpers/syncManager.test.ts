import {
  extendChainWithEns,
  getChainContractAddress,
} from '@ensdomains/ensjs/chain'
import { dnsRegistrarProveAndClaimSnippet } from '@ensdomains/ensjs/contracts'
import { decodeFunctionData, toHex } from 'viem'
import { sepolia } from 'viem/chains'
import { packetToBytes } from 'viem/ens'
import { describe, expect, it } from 'vitest'
import { prepareSyncManagerTransaction } from './syncManager'

const chain = extendChainWithEns(sepolia)
const FROM = '0x55e55C649895940826a852820d9e1A076Ec47b09'
const PROOF = [
  { rrset: '0x0102', sig: '0x0304' },
  { rrset: '0x0506', sig: '0x0708' },
] as const

describe('prepareSyncManagerTransaction', () => {
  const intent = prepareSyncManagerTransaction({
    chain,
    name: 'sgenerisx.xyz',
    dnsImportData: [...PROOF],
    from: FROM,
  })

  it('sends the connected wallet to the DNS registrar on the chain', () => {
    expect(intent).toMatchObject({
      type: 'custom',
      request: {
        type: 'eoa',
        from: FROM,
        to: getChainContractAddress({
          chain,
          contract: 'ensLegacyDnsRegistrar',
        }),
        value: 0n,
        chainId: sepolia.id,
      },
    })
  })

  // No resolver or address: the manager goes to the address in the record.
  it('encodes a plain proveAndClaim of the proof', () => {
    if (intent.request.type !== 'eoa' || !intent.request.data) {
      throw new Error('expected an EOA call with calldata')
    }
    const { functionName, args } = decodeFunctionData({
      abi: dnsRegistrarProveAndClaimSnippet,
      data: intent.request.data,
    })

    expect(functionName).toBe('proveAndClaim')
    expect(args).toEqual([toHex(packetToBytes('sgenerisx.xyz')), PROOF])
  })
})
