import { decodeFuses } from '@ensdomains/ensjs/utils'
import { render, screen } from '@testing-library/react'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestWrapper } from '@/test-utils/providers'
import { deriveV1NameState, type V1NameReads } from './getV1NameState'
import { V1Transfer } from './V1Transfer'

// The component reads its state through this query; everything downstream of
// the read — `deriveV1NameState`, the gate, the card — stays real, so a test
// feeds the raw ensjs shapes an RPC would return.
vi.mock('./getV1NameState', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./getV1NameState')>()),
  getV1NameStateQueryOptions: vi.fn(),
}))

const { getV1NameStateQueryOptions } = await import('./getV1NameState')

const A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address
const B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address
const WRAPPER = '0x0635513f179D50A207757E05759CbD106d7dFcE8' as Address
const RESOLVER = '0x3333333333333333333333333333333333333333' as Address

const wrapperData = (owner: Address): V1NameReads['wrapped'] => ({
  owner,
  expiry: 1_821_784_092_000n,
  fuses: { ...decodeFuses(0), value: 0 },
})

/** `other.label.eth`: wrapped, held by B, issued by the owner of `label.eth`. */
const reads = (overrides: Partial<V1NameReads>): V1NameReads => ({
  nameWrapper: WRAPPER,
  owner: { owner: B, ownershipLevel: 'nameWrapper' },
  wrapped: wrapperData(B),
  resolver: RESOLVER,
  expiry: null,
  parentOwner: null,
  parentWrapped: null,
  ancestorExpiry: null,
  ...overrides,
})

const renderAs = (account: Address, nameReads: V1NameReads) => {
  vi.mocked(getV1NameStateQueryOptions).mockReturnValue({
    queryKey: ['v1-name-state-test'],
    queryFn: () => deriveV1NameState(nameReads),
  } as never)
  return render(<V1Transfer name="other.label.eth" account={account} />, {
    wrapper: createTestWrapper(),
  })
}

/** A wrapped `.eth` 2LD in grace: `ownerOf` reverts, so ensjs reports the
 * registry slot (the wrapper) as a registrar name with no registrant. */
const parentInGrace = {
  parentOwner: {
    owner: WRAPPER,
    registrant: null,
    ownershipLevel: 'registrar',
  },
  parentWrapped: wrapperData(A),
  ancestorExpiry: { expiry: 1n, gracePeriod: 7_776_000, status: 'gracePeriod' },
} satisfies Partial<V1NameReads>

describe('V1Transfer — a subname whose parent is in its grace period', () => {
  beforeEach(() => vi.clearAllMocks())

  // WEB-1407: the parent's owner was read as the NameWrapper itself, so the
  // wallet that owns `label.eth` was told it owned nothing.
  it('tells the parent’s owner to renew, and links them to the parent', async () => {
    renderAs(A, reads(parentInGrace))

    expect(
      await screen.findByText('label.eth is in its grace period'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Go to label.eth' }),
    ).toHaveAttribute('href', '/label.eth/ownership')
    expect(screen.queryByText(/not authorized/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('still refuses a wallet that owns neither the subname nor its parent', async () => {
    renderAs('0xcccccccccccccccccccccccccccccccccccccccc', reads(parentInGrace))

    expect(await screen.findByText('Not authorized')).toBeInTheDocument()
    expect(
      screen.queryByText('label.eth is in its grace period'),
    ).not.toBeInTheDocument()
  })

  // The grace-period arm keys on the registry slot being the wrapper; an
  // unwrapped parent must still fall through to the ordinary registrar read.
  it('still refuses a wallet that only manages an unwrapped parent', async () => {
    renderAs(
      A,
      reads({
        parentOwner: { owner: B, registrant: B, ownershipLevel: 'registrar' },
      }),
    )

    expect(await screen.findByText('Not authorized')).toBeInTheDocument()
  })
})
