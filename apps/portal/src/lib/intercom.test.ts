import { boot, Intercom, shutdown } from '@intercom/messenger-js-sdk'
import { describe, expect, it, vi } from 'vitest'
import { startIntercom, stopIntercom } from './intercom'

vi.mock('@intercom/messenger-js-sdk', () => ({
  boot: vi.fn(),
  Intercom: vi.fn(),
  shutdown: vi.fn(),
}))

describe('Intercom', () => {
  it('runs only between start and stop', () => {
    startIntercom()
    startIntercom()
    expect(Intercom).toHaveBeenCalledWith({ app_id: 're9q5yti' })
    expect(boot).toHaveBeenCalledTimes(1)

    stopIntercom()
    stopIntercom()
    expect(shutdown).toHaveBeenCalledTimes(1)

    // Consent given again boots the loaded widget again.
    startIntercom()
    expect(boot).toHaveBeenCalledTimes(2)
  })
})
