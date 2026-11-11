import type {
  AddressNamesQuery,
  AddressNamesResponse,
} from '@ens-apps/indexer/bigname'
import { screen, waitFor } from '@testing-library/react'
import { okAsync, ResultAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@/utils/test-utils'
import { useDashboardNames } from './useDashboardNames'

const ACCOUNT = '0x0000000000000000000000000000000000000abc'

const mocks = vi.hoisted(() => ({
  resolveGrace: {
    current: (_: AddressNamesResponse): undefined => undefined,
  },
}))

const EMPTY: AddressNamesResponse = {
  data: [],
  page: {
    cursor: null,
    next_cursor: null,
    page_size: 50,
    total_count: 0,
    has_more: false,
  },
  meta: { as_of: {} },
}

vi.mock('@/lib/smart-account/SmartAccountContext', () => ({
  useSmartAccountContextSafe: () => ({
    accountAddress: ACCOUNT,
    ownerAddress: ACCOUNT,
  }),
}))
vi.mock('@/lib/bigname', () => ({
  bigname: {
    // The grace read answers only when a test resolves it.
    addressNames: (_address: string, query: AddressNamesQuery) =>
      query.relation === 'former_owner'
        ? ResultAsync.fromSafePromise(
            new Promise<AddressNamesResponse>((resolve) => {
              mocks.resolveGrace.current = (response) => {
                resolve(response)
                return undefined
              }
            }),
          )
        : okAsync(EMPTY),
  },
}))

const Probe = () => {
  const { isPending, isComplete, total } = useDashboardNames()
  return (
    <output data-testid="names">
      {isPending
        ? 'pending'
        : `${isComplete ? 'complete' : 'partial'} ${total}`}
    </output>
  )
}

describe('useDashboardNames', () => {
  beforeEach(() => {
    mocks.resolveGrace.current = () => undefined
  })

  it('is not complete while the grace read is still pending', async () => {
    render(<Probe />)

    await waitFor(() =>
      expect(screen.getByTestId('names')).not.toHaveTextContent('pending'),
    )
    expect(screen.getByTestId('names')).toHaveTextContent('partial 0')

    mocks.resolveGrace.current(EMPTY)
    await waitFor(() =>
      expect(screen.getByTestId('names')).toHaveTextContent('complete 0'),
    )
  })
})
