import { act, fireEvent, render } from '@testing-library/react'
import type { Address } from 'viem'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { publicClient } from '@/lib/wagmi'
import { ReadOnlyWalletTrigger } from './ReadOnlyWalletTrigger'

const ADDRESS: Address = '0x0000000000000000000000000000000000000001'

const typeCustom = () => {
  for (const key of 'custom') {
    fireEvent.keyDown(document, { key, code: `Key${key.toUpperCase()}` })
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('ReadOnlyWalletTrigger', () => {
  it('opens the prompt only when the test wallet is enabled', () => {
    vi.stubEnv('VITE_ENABLE_READ_ONLY_WALLET', undefined)
    const prompt = vi.fn(() => null)
    vi.stubGlobal('prompt', prompt)
    const { rerender } = render(<ReadOnlyWalletTrigger enabled />)

    typeCustom()
    expect(prompt).not.toHaveBeenCalled()

    vi.stubEnv('VITE_ENABLE_READ_ONLY_WALLET', 'true')
    rerender(<ReadOnlyWalletTrigger enabled />)
    typeCustom()
    expect(prompt).toHaveBeenCalledOnce()
  })

  it.each([ADDRESS, null])(
    'ignores a pending lookup returning %s after close and reopen',
    async (address) => {
      vi.stubEnv('VITE_ENABLE_READ_ONLY_WALLET', 'true')
      vi.stubGlobal('prompt', () => 'example.eth')
      let finishLookup: (value: Address | null) => void = () => undefined
      const lookup = new Promise<Address | null>((resolve) => {
        finishLookup = resolve
      })
      const getEnsAddress = vi
        .spyOn(publicClient, 'getEnsAddress')
        .mockReturnValue(lookup)
      const onError = vi.fn()
      const onAnnounce = vi.fn()
      window.addEventListener('eip6963:announceProvider', onAnnounce, {
        once: true,
      })
      const { rerender } = render(
        <ReadOnlyWalletTrigger enabled onError={onError} />,
      )
      typeCustom()
      expect(getEnsAddress).toHaveBeenCalledOnce()

      rerender(<ReadOnlyWalletTrigger enabled={false} onError={onError} />)
      rerender(<ReadOnlyWalletTrigger enabled onError={onError} />)
      await act(async () => finishLookup(address))
      window.removeEventListener('eip6963:announceProvider', onAnnounce)

      expect(onError).not.toHaveBeenCalled()
      expect(onAnnounce).not.toHaveBeenCalled()
    },
  )
})
