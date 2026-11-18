import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ReadOnlyWalletTrigger } from './ReadOnlyWalletTrigger'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

it('announces the entered address through the portal connect-dialog hotkey', async () => {
  vi.stubEnv('VITE_ENABLE_READ_ONLY_WALLET', 'true')
  vi.stubGlobal('prompt', () => '0x0000000000000000000000000000000000000001')
  const onAnnounce = vi.fn()
  window.addEventListener('eip6963:announceProvider', onAnnounce, {
    once: true,
  })
  render(<ReadOnlyWalletTrigger enabled />)

  await act(async () => {
    for (const key of 'custom') {
      fireEvent.keyDown(document, { key, code: `Key${key.toUpperCase()}` })
    }
  })

  window.removeEventListener('eip6963:announceProvider', onAnnounce)
  expect(onAnnounce).toHaveBeenCalledOnce()
})
