import {
  getDestinationContracts,
  ONCHAIN_ACCOUNT_ID,
} from '@ens-apps/smart-account'
import { QueryClient } from '@tanstack/react-query'
import {
  type Address,
  createPublicClient,
  custom,
  encodeAbiParameters,
  type Hex,
  toFunctionSelector,
} from 'viem'
import { sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import { getRecordImageHcaQueryOptions } from './getRecordImageHcaQueryOptions'

const SIGNER = '0x1234567890123456789012345678901234567890'
const HCA = '0x2345678901234567890123456789012345678901'
const OTHER_SIGNER = '0x3456789012345678901234567890123456789012'

const makeClient = (owner: Address) => {
  const contracts = getDestinationContracts(sepolia.id)
  const addressResult = (value: Address) =>
    encodeAbiParameters([{ type: 'address' }], [value])
  const calls = {
    [`${HCA}:${toFunctionSelector('owner()')}`]: addressResult(owner),
    [`${HCA}:${toFunctionSelector('accountId()')}`]: encodeAbiParameters(
      [{ type: 'string' }],
      [ONCHAIN_ACCOUNT_ID],
    ),
    [`${contracts.standaloneHcaFactory.toLowerCase()}:${toFunctionSelector('authorizedOwnerOf(address)')}`]:
      addressResult(SIGNER),
    [`${contracts.verifiableFactory.toLowerCase()}:${toFunctionSelector('verifyContract(address)')}`]:
      addressResult(contracts.standaloneHcaImplementation),
  }

  return createPublicClient({
    chain: sepolia,
    transport: custom(
      {
        request: async ({ method, params }) => {
          if (method !== 'eth_call')
            throw new Error(`Unexpected RPC method ${method}`)
          const [call] = params as readonly [
            { readonly to: Address; readonly data: Hex },
          ]
          const result =
            calls[`${call.to.toLowerCase()}:${call.data.slice(0, 10)}`]
          if (!result) throw new Error(`Unexpected contract call to ${call.to}`)
          return result
        },
      },
      { retryCount: 0 },
    ),
  })
}

const verifyHca = (liveOwner: Address) =>
  new QueryClient().fetchQuery(
    getRecordImageHcaQueryOptions(
      { owner: HCA, address: SIGNER, chainId: sepolia.id },
      makeClient(liveOwner),
    ),
  )

describe('getRecordImageHcaQueryOptions', () => {
  it('returns proof for the verified owner account and connected signer', async () => {
    await expect(verifyHca(SIGNER)).resolves.toEqual({
      owner: HCA,
      signer: SIGNER,
    })
  })

  it('rejects a factory-certified signer when the live HCA owner differs', async () => {
    await expect(verifyHca(OTHER_SIGNER)).rejects.toMatchObject({
      cause: { field: 'owner' },
    })
  })
})
