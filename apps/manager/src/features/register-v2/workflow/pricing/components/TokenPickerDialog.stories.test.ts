import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FIXTURE_MULTIPLE_METHODS,
  FIXTURE_NO_VALID_COMMON_METHODS,
  FixtureTokenPickerContent,
} from './TokenPickerDialog.stories'

i18n.loadAndActivate({ locale: 'en', messages: {} })

const renderFixture = (
  props: Parameters<typeof FixtureTokenPickerContent>[0],
) =>
  render(
    createElement(
      I18nProvider,
      { i18n },
      createElement(FixtureTokenPickerContent, props),
    ),
  )

afterEach(() => vi.unstubAllGlobals())

describe('TokenPickerDialog fixture stories', () => {
  it('disables registration when no method is available', () => {
    renderFixture({ methods: FIXTURE_NO_VALID_COMMON_METHODS })

    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
  })

  it('keeps fixture selection local and makes no network call', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderFixture({ methods: FIXTURE_MULTIPLE_METHODS })

    fireEvent.click(
      screen.getByRole('button', { name: 'Select DAI on Mainnet' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Register name' }))

    expect(
      screen.getByRole('button', { name: 'Select DAI on Mainnet' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
