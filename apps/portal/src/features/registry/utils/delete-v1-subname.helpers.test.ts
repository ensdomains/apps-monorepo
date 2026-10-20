import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { registrySetSubnodeRecordSnippet } from '@ensdomains/ensjs-abi/registry'
import {
  nameWrapperSetSubnodeOwnerSnippet,
  nameWrapperSetSubnodeRecordSnippet,
} from '@ensdomains/ensjs-abi/v1/nameWrapper'
import {
  type Address,
  decodeFunctionData,
  isAddressEqual,
  labelhash,
  namehash,
  zeroAddress,
} from 'viem'
import { describe, expect, it } from 'vitest'
import type { V1ParentState } from '@/features/transfer/types'
import { ensChain } from '@/lib/wagmi'
import {
  getV1SubnameDeleteGate,
  prepareDeleteV1SubnameTransactions,
  type V1SubnameDeleteChild,
} from './delete-v1-subname.helpers'

const ACCOUNT: Address = '0x7Bc153b2a4C8a2f3428bd0da77a901b81c6dD809'

// biome-ignore lint/suspicious/noExplicitAny: minimal wallet client mock
const walletClient = { account: { address: ACCOUNT }, chain: ensChain } as any

const parent = (overrides: Partial<V1ParentState> = {}): V1ParentState => ({
  owner: ACCOUNT,
  registrant: null,
  isWrapped: false,
  cannotCreateSubdomain: false,
  ...overrides,
})
const child = (
  overrides: Partial<V1SubnameDeleteChild> = {},
): V1SubnameDeleteChild => ({
  labelName: 'sub',
  wrapping: { isWrapped: false },
  subnameCount: 0,
  ...overrides,
})
const WRAPPED = { isWrapped: true, parentCannotControl: false } as const

describe('getV1SubnameDeleteGate', () => {
  it.each([
    ['unwrapped under unwrapped', parent(), child(), 'registry'],
    // The registry path takes the labelhash, so an unknown label is fine.
    [
      'an unknown label under an unwrapped parent',
      parent(),
      child({ labelName: null }),
      'registry',
    ],
    [
      'wrapped under wrapped',
      parent({ isWrapped: true }),
      child({ wrapping: WRAPPED }),
      'wrapper',
    ],
    [
      'unwrapped under wrapped',
      parent({ isWrapped: true }),
      child(),
      'wrap-then-delete',
    ],
  ])('deletes %s', (_, parentState, childState, target) => {
    expect(getV1SubnameDeleteGate(parentState, childState)).toEqual({
      reason: 'ok',
      target,
    })
  })

  it.each([
    [
      'a subname with subnames of its own',
      parent(),
      child({ subnameCount: 2 }),
      'has-subnames',
    ],
    [
      'an uncounted subname',
      parent(),
      child({ subnameCount: undefined }),
      'unknown',
    ],
    [
      'a subname whose wrapping is unknown',
      parent(),
      child({ wrapping: null }),
      'unknown',
    ],
    [
      'an emancipated subname',
      parent({ isWrapped: true }),
      child({ wrapping: { isWrapped: true, parentCannotControl: true } }),
      'emancipated',
    ],
    [
      'a wrapped subname under an unwrapped parent',
      parent(),
      child({ wrapping: WRAPPED }),
      'wrapper-mismatch',
    ],
    [
      'an unknown label under a wrapped parent',
      parent({ isWrapped: true }),
      child({ labelName: null, wrapping: WRAPPED }),
      'unknown-label',
    ],
    [
      'the wrap step under a parent that burned CANNOT_CREATE_SUBDOMAIN',
      parent({ isWrapped: true, cannotCreateSubdomain: true }),
      child(),
      'burned-fuse',
    ],
  ])('refuses %s', (_, parentState, childState, reason) => {
    expect(getV1SubnameDeleteGate(parentState, childState).reason).toBe(reason)
  })

  // The fuse only blocks re-issuing; zeroing a wrapped subname is unaffected.
  it('deletes a wrapped subname under a parent that burned CANNOT_CREATE_SUBDOMAIN', () => {
    expect(
      getV1SubnameDeleteGate(
        parent({ isWrapped: true, cannotCreateSubdomain: true }),
        child({ wrapping: WRAPPED }),
      ),
    ).toEqual({ reason: 'ok', target: 'wrapper' })
  })
})

const calls = (intents: readonly CustomTransactionIntent[]) =>
  intents.map(({ request }) => {
    if (request.type !== 'eoa' || !request.data) {
      throw new Error('expected an EOA call')
    }
    return { to: request.to, data: request.data }
  })
const contract = (name: 'ensLegacyRegistry' | 'ensNameWrapper') =>
  getChainContractAddress({ chain: ensChain, contract: name })

describe('prepareDeleteV1SubnameTransactions', () => {
  const prepare = (
    target: 'registry' | 'wrapper' | 'wrap-then-delete',
    labelName: string | null = 'sub',
  ) =>
    calls(
      prepareDeleteV1SubnameTransactions({
        target,
        parentName: 'parent.eth',
        labelhash: labelhash('sub'),
        labelName,
        walletClient,
        chainId: ensChain.id,
      }),
    )

  it('zeroes an unwrapped parent’s subname in the V1 registry, by its labelhash', () => {
    const [call, ...rest] = prepare('registry', null)

    expect(rest).toEqual([])
    expect(call && isAddressEqual(call.to, contract('ensLegacyRegistry'))).toBe(
      true,
    )
    expect(
      call &&
        decodeFunctionData({
          abi: registrySetSubnodeRecordSnippet,
          data: call.data,
        }).args,
    ).toEqual([
      namehash('parent.eth'),
      labelhash('sub'),
      zeroAddress,
      zeroAddress,
      0n,
    ])
  })

  it('zeroes a wrapped subname through the NameWrapper', () => {
    const [call] = prepare('wrapper')

    expect(call && isAddressEqual(call.to, contract('ensNameWrapper'))).toBe(
      true,
    )
    expect(
      call &&
        decodeFunctionData({
          abi: nameWrapperSetSubnodeRecordSnippet,
          data: call.data,
        }).args,
    ).toEqual([
      namehash('parent.eth'),
      'sub',
      zeroAddress,
      zeroAddress,
      0n,
      0,
      0n,
    ])
  })

  it('wraps an unwrapped subname to the caller, then zeroes it', () => {
    const [wrap, remove] = prepare('wrap-then-delete')

    expect(
      wrap &&
        decodeFunctionData({
          abi: nameWrapperSetSubnodeOwnerSnippet,
          data: wrap.data,
        }).args,
    ).toEqual([namehash('parent.eth'), 'sub', ACCOUNT, 0, 0n])
    expect(
      remove &&
        decodeFunctionData({
          abi: nameWrapperSetSubnodeRecordSnippet,
          data: remove.data,
        }).functionName,
    ).toBe('setSubnodeRecord')
  })

  // WEB-1458: the wrapper hashes the label it is given, so it must be the row's.
  it('refuses a wrapper write whose label is not the row’s', () => {
    expect(() => prepare('wrapper', 'other')).toThrow()
    expect(() => prepare('wrapper', null)).toThrow()
  })
})
