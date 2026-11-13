import { render, screen } from '@testing-library/react'
import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import type { V1TransferSubject } from '@/features/transfer/types'
import {
  getV1NameStateQueryOptions,
  type V1NameState,
} from '@/features/transfer/v1/getV1NameState'
import { createTestQueryClient, createTestWrapper } from '@/test-utils'
import { V1WrapperRow } from './V1WrapperRow'

const OWNER: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

const renderWith = (subject: V1TransferSubject | null) => {
  const queryClient = createTestQueryClient()
  const { queryKey } = getV1NameStateQueryOptions({ name: 'alice.eth' })
  queryClient.setQueryDefaults(queryKey, {
    staleTime: Number.POSITIVE_INFINITY,
  })
  const state: V1NameState = {
    subject,
    registration: 'active',
    resolverAddress: null,
    parent: null,
    ancestorRegistration: null,
  }
  queryClient.setQueryData(queryKey, state)
  return render(<V1WrapperRow name="alice.eth" />, {
    wrapper: createTestWrapper(queryClient),
  })
}

describe('V1WrapperRow', () => {
  it.each<[string, V1TransferSubject]>([
    [
      'Wrapped',
      {
        kind: 'v1-wrapped',
        owner: OWNER,
        fuses: {
          cannotTransfer: false,
          cannotSetResolver: false,
          cannotUnwrap: false,
          cannotCreateSubdomain: false,
          parentCannotControl: true,
        },
        expiry: null,
      },
    ],
    [
      'Unwrapped',
      { kind: 'v1-registrar', registrant: OWNER, controller: OWNER },
    ],
  ])('reads %s', (label, subject) => {
    renderWith(subject)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('stays hidden for a lapsed name', () => {
    const { container } = renderWith(null)
    expect(container).toBeEmptyDOMElement()
  })
})
