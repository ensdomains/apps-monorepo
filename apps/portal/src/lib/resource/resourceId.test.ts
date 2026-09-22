import { keccak256, labelhash, toHex } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  assertCalldataFunction,
  assertCalldataResourceId,
  canonicalResourceId,
  ResourceMismatchError,
  ROOT_RESOURCE_ID,
  requireResourceIdForName,
  resourceIdForName,
  resourceIdFromChainValue,
} from './resourceId'

const unregisterAbi = [
  {
    type: 'function',
    name: 'unregister',
    inputs: [{ name: 'anyId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

// `vault` written as an encoded label: 66 characters the registry hashed
// literally at registration, but which viem's `labelhash` returns verbatim as
// if they were already a hash.
const VAULT_LABELHASH = labelhash('vault')
const ENCODED_LABEL = `[${VAULT_LABELHASH.slice(2)}]`

describe('resourceIdForName', () => {
  it('hashes the first label exactly as it is written', () => {
    expect(resourceIdForName('vault.example.eth')._unsafeUnwrap()).toBe(
      BigInt(labelhash('vault')),
    )
  })

  // The registry hashed whatever characters were registered. Re-normalising
  // here would address a resource the owner does not hold, locking them out of
  // a name that exists — normalisation belongs on the registration path.
  it('does not normalise, so a registered label stays addressable', () => {
    for (const label of ['my_name', 'VAULT', 'a--b']) {
      expect(resourceIdForName(`${label}.eth`)._unsafeUnwrap()).toBe(
        BigInt(labelhash(label)),
      )
    }
  })

  // `labelhash('[<64 hex>]')` returns those digits unhashed. The string does
  // not say whether it is a label registered as those 66 characters or ENS
  // rendering a label nothing has decoded, so this declines to pick one.
  it('refuses an encoded first label rather than guessing which name it is', () => {
    const result = resourceIdForName(`${ENCODED_LABEL}.eth`)

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr().reason).toBe('encoded-label')
    // The trap: this is what a plain derivation produces.
    expect(BigInt(labelhash(ENCODED_LABEL))).toBe(BigInt(VAULT_LABELHASH))
  })

  // Only the first label decides this name's id, so an undecoded ancestor is
  // none of its business.
  it('addresses a subname under an encoded parent', () => {
    expect(resourceIdForName(`sub.${ENCODED_LABEL}.eth`)._unsafeUnwrap()).toBe(
      BigInt(labelhash('sub')),
    )
  })

  it('refuses a name with no first label', () => {
    expect(resourceIdForName('')._unsafeUnwrapErr().reason).toBe('empty-label')
    expect(resourceIdForName('.eth')._unsafeUnwrapErr().reason).toBe(
      'empty-label',
    )
  })

  it('throws from the calldata-builder variant instead of guessing', () => {
    expect(() => requireResourceIdForName(`${ENCODED_LABEL}.eth`)).toThrow()
    expect(requireResourceIdForName('vault.eth')).toBe(
      BigInt(labelhash('vault')),
    )
  })
})

describe('resourceIdFromChainValue', () => {
  it('reads a 32-byte hash and a decimal string', () => {
    const hash = keccak256(toHex('anything'))
    expect(resourceIdFromChainValue(hash)._unsafeUnwrap()).toBe(BigInt(hash))
    expect(resourceIdFromChainValue('42')._unsafeUnwrap()).toBe(42n)
    expect(resourceIdFromChainValue(42n)._unsafeUnwrap()).toBe(42n)
  })

  it('refuses anything it cannot read, and never substitutes root', () => {
    for (const bad of ['', 'nope', '0x123', '-1', '12.5']) {
      const result = resourceIdFromChainValue(bad)
      expect(result.isErr()).toBe(true)
      expect(result._unsafeUnwrapErr().reason).toBe('malformed-resource')
    }
    expect(resourceIdFromChainValue(-1n).isErr()).toBe(true)
    expect(resourceIdFromChainValue(1n << 256n).isErr()).toBe(true)
  })

  it('only returns root when root is what it was given', () => {
    expect(resourceIdFromChainValue('0')._unsafeUnwrap()).toBe(ROOT_RESOURCE_ID)
    expect(resourceIdFromChainValue('nope').unwrapOr(null)).toBeNull()
  })
})

describe('canonicalResourceId', () => {
  it('clears the token version bits', () => {
    const id = resourceIdFromChainValue(
      (BigInt(labelhash('vault')) | 0xffffffffn).toString(),
    )._unsafeUnwrap()

    expect(canonicalResourceId(id) & 0xffffffffn).toBe(0n)
    expect(canonicalResourceId(id) >> 32n).toBe(id >> 32n)
  })
})

describe('assertCalldataResourceId', () => {
  const expected = resourceIdFromChainValue('12345')._unsafeUnwrap()
  const data =
    '0xa02b161e0000000000000000000000000000000000000000000000000000000000003039' as const

  it('passes when the encoded id is the expected one', () => {
    expect(() =>
      assertCalldataResourceId({
        abi: unregisterAbi,
        data,
        expected,
        action: 'Deleting',
      }),
    ).not.toThrow()
  })

  it('refuses calldata that addresses another resource', () => {
    const other = resourceIdFromChainValue('999')._unsafeUnwrap()

    expect(() =>
      assertCalldataResourceId({
        abi: unregisterAbi,
        data,
        expected: other,
        action: 'Deleting',
      }),
    ).toThrow(ResourceMismatchError)
  })
})

describe('assertCalldataFunction', () => {
  const data =
    '0xa02b161e0000000000000000000000000000000000000000000000000000000000003039' as const

  it('refuses a call that is not the expected function', () => {
    expect(() =>
      assertCalldataFunction({
        abi: unregisterAbi,
        data,
        functionName: 'somethingElse',
        action: 'Revoking',
      }),
    ).toThrow(ResourceMismatchError)
  })

  it('passes the expected function', () => {
    expect(() =>
      assertCalldataFunction({
        abi: unregisterAbi,
        data,
        functionName: 'unregister',
        action: 'Revoking',
      }),
    ).not.toThrow()
  })
})
