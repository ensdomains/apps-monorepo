import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAddressPresentation } from '../data/records/address'
import { AddressIcon } from './AddressIcon'
import '@testing-library/jest-dom/vitest'

vi.mock('../data/records/address', () => ({
  getAddressPresentation: vi.fn(),
}))

const setIcon = (icon: ReturnType<typeof getAddressPresentation>['icon']) =>
  vi.mocked(getAddressPresentation).mockReturnValue({
    coinType: 60,
    label: 'Ethereum',
    notation: 'ETH',
    icon,
  })

describe('AddressIcon', () => {
  beforeEach(() => setIcon('/eth.svg'))

  it.each([
    undefined,
    '',
    'javascript:alert(1)',
    '//untrusted.example/icon.svg',
  ])(
    'uses decorative fallback artwork for missing or rejected source %s',
    (src) => {
      setIcon(src)
      const { container } = render(<AddressIcon coinType={60} />)
      expect(container.querySelector('img')).toBeNull()
      expect(container.querySelector('svg')).not.toBeNull()
      expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
    },
  )

  it('renders component artwork without an image or fallback', () => {
    setIcon(({ className }) => (
      <svg className={className} data-testid="brand-artwork" />
    ))
    const { container, getByTestId } = render(<AddressIcon coinType={784} />)
    expect(getByTestId('brand-artwork')).toHaveClass('size-full')
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.lucide-network')).toBeNull()
  })

  it('renders approved HTTPS artwork', () => {
    setIcon('https://example.com/coin.svg')
    const { container } = render(<AddressIcon coinType={60} />)
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://example.com/coin.svg',
    )
    expect(container.querySelector('.lucide-network')).toBeNull()
  })

  it('falls back after a loading error and retries when the source changes', () => {
    const { container, rerender } = render(<AddressIcon coinType={60} />)
    const image = container.querySelector('img')
    expect(image).toHaveAttribute('alt', '')
    if (!image) throw new Error('Expected the configured network artwork')
    fireEvent.error(image)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()

    rerender(<AddressIcon coinType={60} />)
    expect(container.querySelector('img')).toBeNull()

    setIcon('/btc.svg')
    rerender(<AddressIcon coinType={0} />)
    expect(container.querySelector('img')).toHaveAttribute('src', '/btc.svg')
    expect(container.querySelector('svg')).toBeNull()
  })
})
