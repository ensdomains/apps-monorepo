import { boot, Intercom, shutdown, update } from '@intercom/messenger-js-sdk'
import { describe, expect, it, vi } from 'vitest'
import {
  setIntercomLauncherClearance,
  startIntercom,
  stopIntercom,
} from './intercom'

vi.mock('@intercom/messenger-js-sdk', () => ({
  boot: vi.fn(),
  Intercom: vi.fn(),
  shutdown: vi.fn(),
  update: vi.fn(),
}))

describe('Intercom', () => {
  it('runs only between start and stop, keeping the launcher clearance', () => {
    // Set before consent: kept for start, not sent to a messenger that isn't running.
    setIntercomLauncherClearance(90)
    expect(update).not.toHaveBeenCalled()

    startIntercom()
    startIntercom()
    const settings = { app_id: 're9q5yti', vertical_padding: 106 }
    expect(Intercom).toHaveBeenCalledWith(settings)
    expect(boot).toHaveBeenCalledTimes(1)
    expect(boot).toHaveBeenCalledWith(settings)

    setIntercomLauncherClearance(0)
    expect(update).toHaveBeenCalledWith({ vertical_padding: 20 })

    stopIntercom()
    stopIntercom()
    expect(shutdown).toHaveBeenCalledTimes(1)

    // Consent given again boots the loaded widget again.
    startIntercom()
    expect(boot).toHaveBeenCalledTimes(2)
  })
})
