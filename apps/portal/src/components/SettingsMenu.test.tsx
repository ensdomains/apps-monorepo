import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

// PostHog, keeping the answer the way its consent cookie does.
const posthog = vi.hoisted(() => {
  const client = {
    __loaded: true,
    stored: 'pending',
    get_explicit_consent_status: () => client.stored,
    opt_in_capturing: () => {
      client.stored = 'granted'
    },
    opt_out_capturing: () => {
      client.stored = 'denied'
    },
    reset: () => {
      client.stored = 'pending'
    },
    displaySurvey: vi.fn(),
  }
  return client
})
vi.mock('posthog-js/dist/module.full.no-external', () => ({ default: posthog }))

vi.mock('./ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}))

vi.mock('./RpcSettingsDialog', () => ({
  RpcSettingsDialog: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="rpc-dialog" /> : null,
}))

// FEEDBACK_SURVEY_ID is read at module scope, so the env must be stubbed
// before a fresh import of the component.
const importSettingsMenu = async (surveyId: string | undefined) => {
  vi.resetModules()
  vi.stubEnv('VITE_PUBLIC_POSTHOG_FEEDBACK_SURVEY_ID', surveyId)
  return (await import('./SettingsMenu')).SettingsMenu
}

const openMenu = async (surveyId: string | undefined) => {
  const SettingsMenu = await importSettingsMenu(surveyId)
  const user = userEvent.setup()
  render(<SettingsMenu />)
  await user.click(screen.getByRole('button', { name: 'Settings' }))
  expect(await screen.findByTestId('theme-toggle')).toBeInTheDocument()
  return user
}

afterEach(() => {
  vi.unstubAllEnvs()
  posthog.__loaded = true
  posthog.stored = 'pending'
  posthog.displaySurvey.mockClear()
})

describe('SettingsMenu', () => {
  it('opens the PostHog feedback survey once analytics are accepted', async () => {
    posthog.stored = 'granted'
    const user = await openMenu('survey-123')

    await user.click(screen.getByRole('menuitem', { name: /feedback/i }))

    expect(posthog.displaySurvey).toHaveBeenCalledWith('survey-123', {
      displayType: 'popover',
      ignoreConditions: true,
      ignoreDelay: true,
    })
  })

  it('hides feedback until analytics are accepted', async () => {
    await openMenu('survey-123')
    expect(screen.queryByRole('menuitem', { name: /feedback/i })).toBeNull()
  })

  it('hides feedback when no survey id is configured', async () => {
    posthog.stored = 'granted'
    await openMenu(undefined)
    expect(screen.queryByRole('menuitem', { name: /feedback/i })).toBeNull()
  })

  it('turns sharing usage data on and off', async () => {
    const user = await openMenu(undefined)
    const item = screen.getByRole('menuitemcheckbox', {
      name: 'Share usage data',
    })
    expect(item).toHaveAttribute('aria-checked', 'false')

    await user.click(item)
    expect(posthog.stored).toBe('granted')
    expect(item).toHaveAttribute('aria-checked', 'true')

    await user.click(item)
    expect(posthog.stored).toBe('denied')
    expect(item).toHaveAttribute('aria-checked', 'false')
  })

  it('hides the usage data setting until PostHog loads', async () => {
    posthog.__loaded = false
    await openMenu(undefined)
    expect(
      screen.queryByRole('menuitemcheckbox', { name: 'Share usage data' }),
    ).toBeNull()
  })

  it('shows the RPC entry and opens its dialog', async () => {
    const SettingsMenu = await importSettingsMenu(undefined)
    const user = userEvent.setup()
    render(<SettingsMenu />)

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(
      await screen.findByRole('menuitem', { name: /rpc: default/i }),
    )

    expect(await screen.findByTestId('rpc-dialog')).toBeInTheDocument()
  })
})
