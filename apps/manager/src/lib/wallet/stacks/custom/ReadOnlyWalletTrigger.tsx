import { promptForReadOnlyWallet } from '@ens-apps/utils/readOnlyWallet'
import { useHotkeySequence } from '@tanstack/react-hotkeys'
import { useLayoutEffect, useRef } from 'react'
import { publicClient, wagmiConfig } from '@/lib/wagmi'

type ReadOnlyWalletTriggerProps = {
  readonly enabled: boolean
  readonly onError?: (message: string | null) => void
}

export const ReadOnlyWalletTrigger = ({
  enabled,
  onError,
}: ReadOnlyWalletTriggerProps) => {
  const isEnabled =
    enabled && import.meta.env.VITE_ENABLE_READ_ONLY_WALLET === 'true'
  const dialogLifetime = useRef<AbortSignal | null>(null)

  useLayoutEffect(() => {
    if (!isEnabled) return
    const controller = new AbortController()
    dialogLifetime.current = controller.signal
    return () => controller.abort()
  }, [isEnabled])

  useHotkeySequence(
    ['C', 'U', 'S', 'T', 'O', 'M'],
    () => {
      const signal = dialogLifetime.current
      if (signal === null) return
      void promptForReadOnlyWallet({
        resolveName: (name) => publicClient.getEnsAddress({ name }),
        chainId: wagmiConfig.chains[0].id,
        signal,
        onError,
      })
    },
    {
      enabled: isEnabled,
      ignoreInputs: true,
      preventDefault: false,
      stopPropagation: false,
      timeout: 1000,
    },
  )

  return null
}
