import { fireEvent, render, screen } from '@testing-library/react'
import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  AddressHighlightProvider,
  useAddressHighlight,
} from './AddressHighlight'

const OWNER: Address = '0xC28d000000000000000000000000000000Abc20D'
const OTHER: Address = '0xA708000000000000000000000000000000008AAa'
const MOUSE = { pointerType: 'mouse' }

describe('AddressHighlightProvider', () => {
  it('re-renders only the badges whose highlight changes', () => {
    const renders = { owner: 0, other: 0 }
    const Badge = ({
      address,
      label,
    }: {
      readonly address: Address
      readonly label: keyof typeof renders
    }) => {
      const highlight = useAddressHighlight(address)
      renders[label] += 1
      return (
        <button
          type="button"
          data-testid={label}
          onPointerEnter={highlight.onPointerEnter}
          onPointerLeave={highlight.onPointerLeave}
        />
      )
    }
    render(
      <AddressHighlightProvider>
        <Badge address={OWNER} label="owner" />
        <Badge address={OTHER} label="other" />
      </AddressHighlightProvider>,
    )
    const mounted = { ...renders }

    fireEvent.pointerEnter(screen.getByTestId('owner'), MOUSE)
    fireEvent.pointerLeave(screen.getByTestId('owner'), MOUSE)

    expect(renders.other).toBe(mounted.other)
    expect(renders.owner).toBe(mounted.owner + 2)
  })
})
