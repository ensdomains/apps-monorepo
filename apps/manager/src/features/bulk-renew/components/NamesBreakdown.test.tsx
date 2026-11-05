import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { render } from '@/utils/test-utils'
import { NamesBreakdown } from './NamesBreakdown'

describe('NamesBreakdown', () => {
  it.each([
    [0.012506, '$27.87 USD', true],
    [0, '$27.88 USD', false],
  ])(
    'with an existing balance of %s, totals %s',
    (existingBalance, total, isShown) => {
      render(
        <NamesBreakdown
          existingBalance={existingBalance}
          rows={[]}
          total={existingBalance > 0 ? 27.867494 : 27.88}
        />,
      )

      expect(screen.getByText(total)).toBeInTheDocument()
      expect(screen.queryByText('-$0.01 USD') !== null).toBe(isShown)
    },
  )
})
