// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { ok } from 'neverthrow'
import { match } from 'ts-pattern'
import { type Address, getAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAINNET_COIN_TYPE } from '@/lib/coinType'

// Checksummed: ensjs' address coder rejects a non-checksummed spelling, which
// is exactly why the builder encodes from the connected account rather than
// from whatever a caller hands it.
const CONNECTED = getAddress('0x55e55c649895940826a852820d9e1a076ec47b09')
const VIEWED = getAddress('0x225f137127d9067788314bc7fcc1f36746a3c3b5')
const RESOLVER = '0xcccccccccccccccccccccccccccccccccccccccc' as Address

type QueryStub = { readonly data: unknown; readonly isPending: boolean }

const settled = (data: unknown): QueryStub => ({ data, isPending: false })

let connectedAddress: Address | undefined = CONNECTED

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useConnection: () => ({ address: connectedAddress, chain: undefined }),
  useWalletClient: () => ({ data: undefined }),
}))
// The query-options factories reach the app's wagmi client transitively; the
// queries themselves are stubbed below, so it never runs.
vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({ chain: { id: 11155111 } }),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) =>
    match(queryKey[0])
      .with('get-name-resolver-address', () => settled(RESOLVER))
      // A legacy resolver, so the request is the `setAddr(node, …)` shape.
      .with('is-permissioned-resolver', () => settled(false))
      .otherwise(() => settled(undefined)),
}))

const { useReverseResolutionMutations } = await import(
  './useReverseResolutionMutations'
)

const renderMutations = () =>
  renderHook(() =>
    useReverseResolutionMutations({
      reverseRegistrarChainId: 60,
      coinType: MAINNET_COIN_TYPE,
      displayName: 'alice.eth',
    }),
  ).result.current

describe('useReverseResolutionMutations', () => {
  beforeEach(() => {
    connectedAddress = CONNECTED
  })

  // WEB-1429: `setAddr` writes the record deciding which address a name
  // resolves to, so the only correct target is the account that signs. The
  // sidebar used to hand it the address from the route; the guard lives here so
  // a presentational change cannot re-open it.
  describe('getForwardResolutionRequest', () => {
    it('refuses a target address that is not the connected signer', () => {
      const { getForwardResolutionRequest } = renderMutations()

      expect(() => getForwardResolutionRequest(VIEWED)).toThrow(
        'A primary name can only be set for the connected wallet.',
      )
    })

    it('refuses to build anything with no connected account', () => {
      connectedAddress = undefined

      const { getForwardResolutionRequest } = renderMutations()

      expect(() => getForwardResolutionRequest(CONNECTED)).toThrow(
        'Connect a wallet to set a primary name.',
      )
    })

    it('builds the request against the connected account', () => {
      const { getForwardResolutionRequest } = renderMutations()

      const request = getForwardResolutionRequest(CONNECTED)

      expect(request.address).toBe(RESOLVER)
      // `setAddr(bytes32 node, uint256 coinType, bytes value)` — the address
      // actually written is the last argument, hex-encoded and lower-cased.
      expect(request.args.at(-1)).toBe(CONNECTED.toLowerCase())
    })

    it('accepts a differently-cased spelling of the connected account', () => {
      const { getForwardResolutionRequest } = renderMutations()

      const request = getForwardResolutionRequest(
        CONNECTED.toLowerCase() as Address,
      )

      expect(request.args.at(-1)).toBe(CONNECTED.toLowerCase())
    })
  })
})
