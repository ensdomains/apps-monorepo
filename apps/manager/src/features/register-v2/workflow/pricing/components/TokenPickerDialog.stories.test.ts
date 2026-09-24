import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FeeTooltipOpen,
  FIXTURE_MULTIPLE_METHODS,
  FIXTURE_NO_VALID_COMMON_METHODS,
  FixtureEmptyMethods,
  FixtureMultipleMethodsCollapsed,
  FixtureMultipleMethodsExpanded,
  FixtureNoValidCommonMethods,
  FixtureTokenPickerContent,
  FundedUSDC,
  InsufficientUSDC,
  WithAccountCredit,
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

describe('TokenPickerDialog stories', () => {
  it('exports every required deterministic browser state', () => {
    expect({
      FundedUSDC,
      InsufficientUSDC,
      WithAccountCredit,
      FeeTooltipOpen,
      FixtureMultipleMethodsCollapsed,
      FixtureMultipleMethodsExpanded,
      FixtureNoValidCommonMethods,
      FixtureEmptyMethods,
    }).toMatchObject({
      FundedUSDC: expect.any(Object),
      InsufficientUSDC: expect.any(Object),
      WithAccountCredit: expect.any(Object),
      FeeTooltipOpen: expect.any(Object),
      FixtureMultipleMethodsCollapsed: expect.any(Object),
      FixtureMultipleMethodsExpanded: expect.any(Object),
      FixtureNoValidCommonMethods: expect.any(Object),
      FixtureEmptyMethods: expect.any(Object),
    })
  })

  it('keeps unsupported multi-method data in a local collapsed fixture', () => {
    renderFixture({
      methods: FIXTURE_MULTIPLE_METHODS,
      initialSelectedId: 'usdc-mainnet',
    })

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Load 7 more' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Register name' })).toBeEnabled()
  })

  it('shows the exact fixture errors only after expansion', () => {
    renderFixture({ methods: FIXTURE_MULTIPLE_METHODS, defaultExpanded: true })

    expect(screen.getByText('Not enough ETH for permit approval')).toBeVisible()
    expect(screen.getByText('Need $352.00')).toBeVisible()
    expect(screen.getAllByRole('listitem')).toHaveLength(9)
  })

  it('limits the no-valid default to common errors and disables registration', () => {
    renderFixture({ methods: FIXTURE_NO_VALID_COMMON_METHODS })

    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(
      screen.getByText('not enough funds to pay network fees'),
    ).toBeVisible()
    expect(screen.getByText('Not enough ETH for permit approval')).toBeVisible()
    expect(screen.getByText('Need $352.00')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Register name' })).toBeDisabled()
  })

  it('supports an empty supplied list', () => {
    renderFixture({ methods: [] })

    expect(
      screen.getByRole('list', { name: 'Payment methods' }),
    ).toBeEmptyDOMElement()
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
