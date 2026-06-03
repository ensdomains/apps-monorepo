import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { newEmptyProfileRecords } from '../../utils/transformRecords'
import { ViewBioSection } from './ViewBioSection'

i18n.loadAndActivate({ locale: 'en', messages: {} })

const renderWithI18n = (children: ReactNode) =>
  render(<I18nProvider i18n={i18n}>{children}</I18nProvider>)

describe('ViewBioSection', () => {
  it('does not render unsafe website URL schemes as links', () => {
    const records = {
      ...newEmptyProfileRecords(),
      base: {
        description: 'Profile bio',
        url: 'javascript:alert(document.domain)',
      },
    }

    const { container, getByText } = renderWithI18n(
      <ViewBioSection records={records} />,
    )

    expect(getByText('Profile bio')).toBeInTheDocument()
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull()
  })
})
