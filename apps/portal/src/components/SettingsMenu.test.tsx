import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const displaySurvey = vi.fn()
// PostHog's answer to the analytics banner.
let consent = 'pending'

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({
    __loaded: true,
    get_explicit_consent_status: () => consent,
    displaySurvey,
  }),
}))

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
  consent = 'pending'
  displaySurvey.mockClear()
})

describe('SettingsMenu', () => {
  it('opens the PostHog feedback survey once analytics are accepted', async () => {
    consent = 'granted'
    const user = await openMenu('survey-123')

    await user.click(screen.getByRole('menuitem', { name: /feedback/i }))

    expect(displaySurvey).toHaveBeenCalledWith('survey-123', {
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
    consent = 'granted'
    await openMenu(undefined)
    expect(screen.queryByRole('menuitem', { name: /feedback/i })).toBeNull()
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
