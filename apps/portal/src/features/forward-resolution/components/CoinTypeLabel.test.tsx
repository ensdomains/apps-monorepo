import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CoinTypeLabel } from './CoinTypeLabel'

describe('CoinTypeLabel', () => {
  it.each([
    ['60', 'Ethereum'],
    ['2147492101', 'Base'],
    ['2147483648', 'Default'],
    ['0', 'Bitcoin'],
    ['501', 'Solana'],
    // An EVM chain without a label keeps its chain id.
    ['2147483785', '137'],
  ])('labels coin type %s as %s', (coinType, label) => {
    render(<CoinTypeLabel coinType={coinType} />)

    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('does not read Bitcoin as the default EVM chain', () => {
    render(<CoinTypeLabel coinType="0" />)

    expect(screen.queryByText('Default')).not.toBeInTheDocument()
  })
})
