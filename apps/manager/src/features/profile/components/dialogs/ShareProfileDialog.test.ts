import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { beforeAll, describe, expect, it } from 'vitest'
import { ShareProfileDialog } from './ShareProfileDialog'
import { resolveDefaultExport } from './ShareProfileDialog.helpers'

i18n.loadAndActivate({ locale: 'en', messages: {} })

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
})

describe('ShareProfileDialog', () => {
  it('unwraps browser-wrapped default exports before rendering them', () => {
    const component = () => null

    expect(resolveDefaultExport({ default: component })).toBe(component)
  })

  it('keeps direct default exports unchanged', () => {
    const component = () => null

    expect(resolveDefaultExport(component)).toBe(component)
  })

  it('opens the share dialog without crashing', async () => {
    render(
      createElement(
        I18nProvider,
        { i18n },
        createElement(ShareProfileDialog, {
          name: 'bigint.eth',
          url: 'https://app.ens.domains/bigint.eth',
        }),
      ),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Share' }))

    expect(await screen.findByText('Copy Link')).toBeInTheDocument()
  })

  it('renders the new profile sharing card header', async () => {
    render(
      createElement(
        I18nProvider,
        { i18n },
        createElement(ShareProfileDialog, {
          name: 'bigint.eth',
          url: 'https://app.ens.domains/bigint.eth',
        }),
      ),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Share' }))

    expect(await screen.findByText('Share profile link')).toBeInTheDocument()
  })
})
