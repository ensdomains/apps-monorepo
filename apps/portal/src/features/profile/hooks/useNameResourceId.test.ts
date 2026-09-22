import { keccak256, labelhash, toHex } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.fn()
vi.mock('@/lib/indexer', () => ({
  graphqlIndexerClient: { request: (...args: unknown[]) => request(...args) },
}))

const { getNameResourceId } = await import('./useNameResourceId')

const VAULT_LABELHASH = labelhash('vault')
const ENCODED_LABEL = `[${VAULT_LABELHASH.slice(2)}]`
const LITERAL_LABELHASH = keccak256(toHex(ENCODED_LABEL))

beforeEach(() => {
  request.mockReset()
})

describe('getNameResourceId', () => {
  // WEB-1458: the digits inside the brackets are what `labelhash` returns for
  // this string, and for a label registered as those 66 characters they are the
  // wrong name. The indexer recorded the hash from the registration event, so
  // that is what gets used.
  it('takes the indexer labelhash, not the hash the brackets spell out', async () => {
    request.mockResolvedValue({ domains: [{ labelhash: LITERAL_LABELHASH }] })

    const result = await getNameResourceId({ name: `${ENCODED_LABEL}.eth` })

    expect(result._unsafeUnwrap()).toBe(BigInt(LITERAL_LABELHASH))
    expect(result._unsafeUnwrap()).not.toBe(BigInt(VAULT_LABELHASH))
  })

  // A name whose preimage nothing decoded is rendered this way by design, and
  // then the digits really are its id. It must stay manageable.
  it('keeps an undecoded name addressable at its own labelhash', async () => {
    request.mockResolvedValue({ domains: [{ labelhash: VAULT_LABELHASH }] })

    const result = await getNameResourceId({ name: `${ENCODED_LABEL}.eth` })

    expect(result._unsafeUnwrap()).toBe(BigInt(VAULT_LABELHASH))
  })

  it('refuses when two names are displayed the same way', async () => {
    request.mockResolvedValue({
      domains: [
        { labelhash: VAULT_LABELHASH },
        { labelhash: LITERAL_LABELHASH },
      ],
    })

    expect(
      (await getNameResourceId({ name: `${ENCODED_LABEL}.eth` })).isErr(),
    ).toBe(true)
  })

  it('refuses when the indexer knows no such name', async () => {
    request.mockResolvedValue({ domains: [] })

    expect(
      (await getNameResourceId({ name: `${ENCODED_LABEL}.eth` })).isErr(),
    ).toBe(true)
  })

  it('refuses when the indexer gives no usable labelhash', async () => {
    request.mockResolvedValue({ domains: [{ labelhash: null }] })

    expect(
      (await getNameResourceId({ name: `${ENCODED_LABEL}.eth` })).isErr(),
    ).toBe(true)
  })
})
