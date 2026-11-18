import { promptForReadOnlyWallet } from '@ens-apps/utils/readOnlyWallet'
import { useHotkeySequence } from '@tanstack/react-hotkeys'
import { useLayoutEffect, useRef } from 'react'
import { getEnsAddress } from 'viem/actions'
import { wagmiConfig } from '@/lib/wagmi'

type ReadOnlyWalletTriggerProps = {
  readonly enabled: boolean
  readonly onError?: (message: string | null) => void
}

export const ReadOnlyWalletTrigger = ({
  enabled,
  onError,
}: ReadOnlyWalletTriggerProps) => {
  const dialogLifetime = useRef<AbortSignal | null>(null)

  useLayoutEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    dialogLifetime.current = controller.signal
    return () => controller.abort()
  }, [enabled])

  useHotkeySequence(
    ['C', 'U', 'S', 'T', 'O', 'M'],
    () => {
      const signal = dialogLifetime.current
      if (signal === null) return
      void promptForReadOnlyWallet({
        resolveName: (name) => getEnsAddress(wagmiConfig.getClient(), { name }),
        chainId: wagmiConfig.chains[0].id,
        signal,
        onError,
      })
    },
    {
      enabled,
      ignoreInputs: true,
      preventDefault: false,
      stopPropagation: false,
      timeout: 1000,
    },
  )

  return null
}
