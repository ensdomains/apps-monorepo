import { render, screen } from '@testing-library/react'
import type * as React from 'react'
import { expect, it, vi } from 'vitest'
import { DnssecSummary } from './DnssecSummary'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { readonly children: React.ReactNode }) => (
    <a href="/import">{children}</a>
  ),
}))

it.each([
  { name: 'example.xyz', isOffered: true },
  { name: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045.xyz', isOffered: false },
])('offers record setup for $name: $isOffered', ({ name, isOffered }) => {
  render(
    <DnssecSummary name={name} verdict={{ kind: 'no-records', warnings: 0 }} />,
  )

  expect(screen.queryByText('Set up ENS records') !== null).toBe(isOffered)
})
