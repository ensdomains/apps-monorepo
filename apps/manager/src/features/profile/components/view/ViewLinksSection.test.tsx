import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { newEmptyProfileRecords } from '../../utils/transformRecords'
import { ViewLinksSection } from './ViewLinksSection'

i18n.loadAndActivate({ locale: 'en', messages: {} })

const renderWithI18n = (children: ReactNode) =>
  render(<I18nProvider i18n={i18n}>{children}</I18nProvider>)

describe('ViewLinksSection', () => {
  it('omits links with unsafe URL schemes', () => {
    const records = {
      ...newEmptyProfileRecords(),
      links: [
        { name: 'Docs', url: 'https://docs.ens.domains' },
        { name: 'Evil', url: 'javascript:alert(document.domain)' },
      ],
    }

    const { container, getByText, queryByText } = renderWithI18n(
      <ViewLinksSection records={records} />,
    )

    expect(getByText('Docs').closest('a')).toHaveAttribute(
      'href',
      'https://docs.ens.domains',
    )
    expect(queryByText('Evil')).toBeNull()
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull()
  })
})
