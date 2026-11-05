import { fireEvent, render, screen } from '@testing-library/react'
import type { Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { useAddressHighlight } from '@/components/AddressHighlight'

const ADDRESS: Address = '0x4976000000000000000000000000000000000a41'

vi.mock('@tanstack/react-router', () => ({
  // Shaped like the router's own route, so `Route.options` is typed.
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useParams: () => ({ name: 'onshow.eth' }),
  }),
}))

// Two copies of one address on the timeline, through the real highlight hook,
// so the test sees whether the route mounts the provider.
const Copy = ({ label }: { readonly label: string }) => {
  const highlight = useAddressHighlight(ADDRESS)
  return (
    <button
      type="button"
      data-testid={label}
      data-address-highlighted={highlight.isHighlighted || undefined}
      onPointerEnter={highlight.onPointerEnter}
    />
  )
}

vi.mock('@/features/history/components/HistoryTimeline', () => ({
  HistoryTimeline: () => (
    <>
      <Copy label="first" />
      <Copy label="second" />
    </>
  ),
}))

const { Route } = await import('./history')

describe('name history route', () => {
  it('highlights every copy of the hovered address', () => {
    const Component = Route.options.component
    if (!Component) throw new Error('Route has no component')
    render(<Component />)

    fireEvent.pointerEnter(screen.getByTestId('first'), {
      pointerType: 'mouse',
    })
    expect(screen.getByTestId('second')).toHaveAttribute(
      'data-address-highlighted',
    )
  })
})
