import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GasRefusalWarning } from './GasRefusalWarning'

i18n.loadAndActivate({ locale: 'en', messages: {} })

const COPY =
  "Network fees are elevated right now, if you'd still like to register this name, please use the Explorer"

const renderWarning = (explorerRegisterUrl: string | null) =>
  render(
    <I18nProvider i18n={i18n}>
      <p>
        <GasRefusalWarning explorerRegisterUrl={explorerRegisterUrl} />
      </p>
    </I18nProvider>,
  )

describe('GasRefusalWarning', () => {
  it('links "Explorer" to the name there, in a new tab', () => {
    renderWarning('https://explorer.example/register?name=jeff.eth')

    const link = screen.getByRole('link', { name: 'Explorer' })
    expect(link).toHaveAttribute(
      'href',
      'https://explorer.example/register?name=jeff.eth',
    )
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('keeps the full sentence as text when the network has no Explorer', () => {
    const { container } = renderWarning(null)

    expect(container).toHaveTextContent(COPY)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
