import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const payload = vi.hoisted(() => ({ value: undefined as unknown }))

vi.mock('@posthog/react', () => ({
  useFeatureFlagEnabled: () => payload.value !== undefined,
  useFeatureFlagPayload: () => payload.value,
}))
vi.mock('@/config', () => ({ envConfig: { chain: { id: 11155111 } } }))

const { NoticeBanner } = await import('./NoticeBanner')

describe('NoticeBanner', () => {
  beforeEach(() => {
    window.localStorage.clear()
    payload.value = undefined
  })

  it('renders nothing without text for this app and chain', () => {
    payload.value = { explorer: { '1': { message: 'Mainnet only' } } }
    const { container } = render(<NoticeBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the explorer text and stays dismissed until the text changes', () => {
    payload.value = { explorer: { '11155111': { message: 'First notice' } } }
    const first = render(<NoticeBanner />)
    expect(screen.getByText('First notice')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByText('First notice')).not.toBeInTheDocument()

    first.unmount()
    const second = render(<NoticeBanner />)
    expect(screen.queryByText('First notice')).not.toBeInTheDocument()

    payload.value = { explorer: { '11155111': { message: 'Second notice' } } }
    second.rerender(<NoticeBanner />)
    expect(screen.getByText('Second notice')).toBeInTheDocument()
  })
})
