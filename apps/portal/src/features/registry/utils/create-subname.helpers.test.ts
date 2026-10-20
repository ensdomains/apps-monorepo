import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { registrySetSubnodeRecordSnippet } from '@ensdomains/ensjs-abi/registry'
import { nameWrapperSetSubnodeRecordSnippet } from '@ensdomains/ensjs-abi/v1/nameWrapper'
import { userRegistryRegisterSnippet } from '@ensdomains/ensjs-abi/v2/userRegistry'
import {
  type Address,
  decodeFunctionData,
  isAddressEqual,
  labelhash,
  namehash,
  zeroAddress,
} from 'viem'
import { sepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'
import type { V1TransferSubject } from '@/features/transfer/types'
import type { V1NameState } from '@/features/transfer/v1/getV1NameState'
import { ensChain } from '@/lib/wagmi'
import {
  DEFAULT_ROLE_BITMAP,
  getV1SubnameCreateGate,
  prepareCreateSubnameTransaction,
} from './create-subname.helpers'

const OWNER: Address = '0x7Bc153b2a4C8a2f3428bd0da77a901b81c6dD809'
const OTHER: Address = '0x1234567890123456789012345678901234567890'
const REGISTRY: Address = '0x666b3d735e366bb8755b65cb5bf7a14c7f41eb23'
const RESOLVER: Address = '0x2245606Dd6B3ae61205fCf8c843E200CC2f1123d'
const EXPIRES = 1_900_000_000n

// biome-ignore lint/suspicious/noExplicitAny: minimal wallet client mock
const walletClient = { account: { address: OWNER }, chain: sepolia } as any

const eoaCall = ({ request }: CustomTransactionIntent) => {
  if (request.type !== 'eoa' || !request.data) {
    throw new Error('expected an EOA call')
  }
  return { to: request.to, data: request.data }
}

const contract = (name: 'ensLegacyRegistry' | 'ensNameWrapper') =>
  getChainContractAddress({ chain: ensChain, contract: name })
const V1_PUBLIC_RESOLVER = getChainContractAddress({
  chain: ensChain,
  contract: 'ensPublicResolver',
})

describe('prepareCreateSubnameTransaction (V2)', () => {
  const v2 = () =>
    eoaCall(
      prepareCreateSubnameTransaction({
        write: {
          protocol: 'ENSv2',
          registryAddress: REGISTRY,
          resolverAddress: RESOLVER,
        },
        parentName: 'parent.eth',
        label: 'test',
        owner: OWNER,
        walletClient,
        chainId: sepolia.id,
        expires: EXPIRES,
      }),
    )

  // Also the regression for WEB-448: the bitmap must grant every role, never 0n.
  it('registers the label on the subregistry with every role', () => {
    const { to, data } = v2()
    const { args } = decodeFunctionData({
      abi: userRegistryRegisterSnippet,
      data,
    })

    expect(isAddressEqual(to, REGISTRY)).toBe(true)
    // args: [label, owner, registry, resolver, roleBitmap, expiry]
    expect(args).toEqual([
      'test',
      OWNER,
      zeroAddress,
      RESOLVER,
      DEFAULT_ROLE_BITMAP,
      EXPIRES,
    ])
  })
})

describe('prepareCreateSubnameTransaction (V1)', () => {
  const v1 = (isWrapped: boolean) =>
    eoaCall(
      prepareCreateSubnameTransaction({
        write: { protocol: 'ENSv1', isWrapped },
        parentName: 'parent.eth',
        label: 'sub',
        owner: OWNER,
        walletClient,
        chainId: ensChain.id,
      }),
    )

  it('writes an unwrapped parent’s subname to the V1 registry', () => {
    const { to, data } = v1(false)
    const { functionName, args } = decodeFunctionData({
      abi: registrySetSubnodeRecordSnippet,
      data,
    })

    expect(isAddressEqual(to, contract('ensLegacyRegistry'))).toBe(true)
    expect(functionName).toBe('setSubnodeRecord')
    expect(args).toEqual([
      namehash('parent.eth'),
      labelhash('sub'),
      OWNER,
      V1_PUBLIC_RESOLVER,
      0n,
    ])
  })

  it('writes a wrapped parent’s subname through the NameWrapper with no fuses or expiry', () => {
    const { to, data } = v1(true)
    const { args } = decodeFunctionData({
      abi: nameWrapperSetSubnodeRecordSnippet,
      data,
    })

    expect(isAddressEqual(to, contract('ensNameWrapper'))).toBe(true)
    expect(args).toEqual([
      namehash('parent.eth'),
      'sub',
      OWNER,
      V1_PUBLIC_RESOLVER,
      0n,
      0,
      0n,
    ])
  })
})

describe('getV1SubnameCreateGate', () => {
  const wrapped = (
    overrides: { owner?: Address; cannotCreateSubdomain?: boolean } = {},
  ): V1TransferSubject => ({
    kind: 'v1-wrapped',
    owner: overrides.owner ?? OWNER,
    fuses: {
      cannotTransfer: false,
      cannotSetResolver: false,
      cannotUnwrap: false,
      cannotCreateSubdomain: overrides.cannotCreateSubdomain ?? false,
      parentCannotControl: false,
    },
    expiry: null,
  })
  const state = (overrides: Partial<V1NameState>): V1NameState => ({
    subject: { kind: 'v1-registry', owner: OWNER },
    registration: null,
    resolverAddress: null,
    parent: null,
    ancestorRegistration: null,
    ...overrides,
  })

  it('lets the registry owner of an unwrapped name create', () => {
    expect(getV1SubnameCreateGate(state({}), OWNER)).toEqual({
      reason: 'ok',
      target: { protocol: 'ENSv1', isWrapped: false },
    })
  })

  it('lets the wrapper owner of a wrapped name create through the wrapper', () => {
    expect(
      getV1SubnameCreateGate(state({ subject: wrapped() }), OWNER),
    ).toEqual({ reason: 'ok', target: { protocol: 'ENSv1', isWrapped: true } })
  })

  // setSubnodeRecord on the registry needs the registry owner (controller),
  // not the 721 registrant of an unwrapped .eth 2LD.
  it('asks the controller of an unwrapped .eth 2LD, not the registrant', () => {
    const registrar = state({
      subject: { kind: 'v1-registrar', registrant: OTHER, controller: OWNER },
      registration: 'active',
    })

    expect(getV1SubnameCreateGate(registrar, OWNER).reason).toBe('ok')
    expect(getV1SubnameCreateGate(registrar, OTHER).reason).toBe('not-holder')
  })

  it('refuses a .eth 2LD in its grace period', () => {
    expect(
      getV1SubnameCreateGate(
        state({ subject: null, registration: 'gracePeriod' }),
        OWNER,
      ).reason,
    ).toBe('grace')
  })

  it('reports nobody holds a lapsed name or a cleared emancipated one', () => {
    expect(
      getV1SubnameCreateGate(
        state({ subject: null, registration: 'expired' }),
        OWNER,
      ).reason,
    ).toBe('unowned')
    expect(getV1SubnameCreateGate(state({ subject: null }), OWNER).reason).toBe(
      'unowned',
    )
  })

  it('refuses a wrapped name that burned CANNOT_CREATE_SUBDOMAIN', () => {
    expect(
      getV1SubnameCreateGate(
        state({ subject: wrapped({ cannotCreateSubdomain: true }) }),
        OWNER,
      ).reason,
    ).toBe('burned-fuse')
  })

  it('refuses a wallet that does not hold the name', () => {
    expect(getV1SubnameCreateGate(state({}), OTHER).reason).toBe('not-holder')
    expect(
      getV1SubnameCreateGate(state({ subject: wrapped() }), OTHER).reason,
    ).toBe('not-holder')
  })

  it('leaves the holder check to the form when no wallet is connected', () => {
    expect(getV1SubnameCreateGate(state({}), undefined).reason).toBe('ok')
  })
})
