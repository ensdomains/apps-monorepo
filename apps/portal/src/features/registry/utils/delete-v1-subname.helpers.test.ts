import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import {
  registrySetRecordSnippet,
  registrySetSubnodeRecordSnippet,
} from '@ensdomains/ensjs-abi/registry'
import {
  nameWrapperSetRecordSnippet,
  nameWrapperSetSubnodeOwnerSnippet,
  nameWrapperSetSubnodeRecordSnippet,
} from '@ensdomains/ensjs-abi/v1/nameWrapper'
import {
  type Address,
  concatHex,
  decodeFunctionData,
  isAddressEqual,
  keccak256,
  labelhash,
  namehash,
  zeroAddress,
} from 'viem'
import { describe, expect, it } from 'vitest'
import type { V1ParentState } from '@/features/transfer/types'
import { ensChain } from '@/lib/wagmi'
import {
  getV1SubnameDeleteAccess,
  getV1SubnameDeleteGate,
  prepareDeleteV1SubnameTransactions,
  type V1SubnameDeleteChild,
} from './delete-v1-subname.helpers'

const ACCOUNT: Address = '0x7Bc153b2a4C8a2f3428bd0da77a901b81c6dD809'
const OTHER: Address = '0x0000000000000000000000000000000000000022'

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
  holder: OTHER,
  ...overrides,
})
const WRAPPED = {
  isWrapped: true,
  parentCannotControl: false,
  isLocked: false,
} as const
const EMANCIPATED = { ...WRAPPED, parentCannotControl: true } as const

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
      child({ wrapping: EMANCIPATED }),
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

// WEB-1909: a subname's own holder can delete it, the way the legacy app lets
// them, whether or not they also hold the parent.
describe('getV1SubnameDeleteAccess', () => {
  const asHolder = (overrides: Partial<V1SubnameDeleteChild> = {}) =>
    child({ holder: ACCOUNT, ...overrides })

  it.each([
    ['an unwrapped subname', asHolder(), 'registry-as-holder'],
    ['a wrapped subname', asHolder({ wrapping: WRAPPED }), 'wrapper-as-holder'],
    [
      'an emancipated subname',
      asHolder({ wrapping: EMANCIPATED }),
      'wrapper-as-holder',
    ],
    // Its own node needs no label, unlike the parent's NameWrapper path.
    [
      'a wrapped subname whose label is unknown',
      asHolder({ wrapping: WRAPPED, labelName: null }),
      'wrapper-as-holder',
    ],
  ])(
    'lets the holder of %s delete it without the parent',
    (_, entry, target) => {
      expect(getV1SubnameDeleteAccess(null, entry, ACCOUNT)).toEqual({
        reason: 'ok',
        target,
      })
    },
  )

  it('lets a wallet holding the parent and an emancipated subname delete it', () => {
    expect(
      getV1SubnameDeleteAccess(
        parent({ isWrapped: true }),
        asHolder({ wrapping: EMANCIPATED }),
        ACCOUNT,
      ),
    ).toEqual({ reason: 'ok', target: 'wrapper-as-holder' })
  })

  it('keeps the parent path when the parent holder can use it', () => {
    expect(getV1SubnameDeleteAccess(parent(), asHolder(), ACCOUNT)).toEqual({
      reason: 'ok',
      target: 'registry',
    })
  })

  it('still refuses the parent holder an emancipated subname they do not hold', () => {
    expect(
      getV1SubnameDeleteAccess(
        parent({ isWrapped: true }),
        child({ wrapping: EMANCIPATED }),
        ACCOUNT,
      ),
    ).toEqual({ reason: 'emancipated' })
  })

  it('refuses the holder of a locked subname, which the NameWrapper cannot unwrap', () => {
    expect(
      getV1SubnameDeleteAccess(
        null,
        asHolder({ wrapping: { ...EMANCIPATED, isLocked: true } }),
        ACCOUNT,
      ),
    ).toEqual({ reason: 'locked' })
  })

  it('refuses the holder a subname with subnames of its own', () => {
    expect(
      getV1SubnameDeleteAccess(null, asHolder({ subnameCount: 1 }), ACCOUNT),
    ).toEqual({ reason: 'has-subnames' })
  })

  it('offers nothing to a wallet that holds neither', () => {
    expect(getV1SubnameDeleteAccess(null, child(), ACCOUNT)).toBeNull()
  })
})

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

describe('prepareDeleteV1SubnameTransactions as the holder', () => {
  // The row's own node, from the parent's namehash and the row's labelhash.
  const NODE = keccak256(concatHex([namehash('parent.eth'), labelhash('sub')]))
  const prepareAsHolder = (
    target: 'registry-as-holder' | 'wrapper-as-holder',
  ) =>
    calls(
      prepareDeleteV1SubnameTransactions({
        target,
        parentName: 'parent.eth',
        labelhash: labelhash('sub'),
        labelName: null,
        walletClient,
        chainId: ensChain.id,
      }),
    )

  it('zeroes an unwrapped subname on its own registry node', () => {
    const [call, ...rest] = prepareAsHolder('registry-as-holder')

    expect(rest).toEqual([])
    expect(call && isAddressEqual(call.to, contract('ensLegacyRegistry'))).toBe(
      true,
    )
    expect(
      call &&
        decodeFunctionData({ abi: registrySetRecordSnippet, data: call.data })
          .args,
    ).toEqual([NODE, zeroAddress, zeroAddress, 0n])
  })

  it('zeroes a wrapped subname through the NameWrapper on its own node', () => {
    const [call] = prepareAsHolder('wrapper-as-holder')

    expect(call && isAddressEqual(call.to, contract('ensNameWrapper'))).toBe(
      true,
    )
    expect(
      call &&
        decodeFunctionData({
          abi: nameWrapperSetRecordSnippet,
          data: call.data,
        }).args,
    ).toEqual([NODE, zeroAddress, zeroAddress, 0n])
  })
})
