import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const displaySurvey = vi.fn()

vi.mock('@posthog/react', () => ({
  usePostHog: () => ({ displaySurvey }),
}))

vi.mock('./ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}))

vi.mock('./RpcSettingsDialog', () => ({
  RpcSettingsDialog: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="rpc-dialog" /> : null,
}))

// FEEDBACK_SURVEY_ID is read at module scope, so the env must be stubbed
// before a fresh import of the component, which comes with a fresh consent store.
const importSettingsMenu = async (
  surveyId: string | undefined,
  consent: 'granted' | 'pending' = 'pending',
) => {
  vi.resetModules()
  vi.stubEnv('VITE_PUBLIC_POSTHOG_FEEDBACK_SURVEY_ID', surveyId)
  const { connectAnalyticsConsent } = await import(
    '@ens-apps/utils/posthog/analyticsConsent'
  )
  // Stands in for PostHog, which keeps the answer.
  connectAnalyticsConsent({
    get_explicit_consent_status: () => consent,
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
  })
  return (await import('./SettingsMenu')).SettingsMenu
}

const openMenu = async (surveyId: string | undefined, consent?: 'granted') => {
  const SettingsMenu = await importSettingsMenu(surveyId, consent)
  const user = userEvent.setup()
  render(<SettingsMenu />)
  await user.click(screen.getByRole('button', { name: 'Settings' }))
  expect(await screen.findByTestId('theme-toggle')).toBeInTheDocument()
  return user
}

afterEach(() => {
  vi.unstubAllEnvs()
  displaySurvey.mockClear()
})

describe('SettingsMenu', () => {
  it('opens the PostHog feedback survey once analytics are accepted', async () => {
    const user = await openMenu('survey-123', 'granted')

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
    await openMenu(undefined, 'granted')
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
