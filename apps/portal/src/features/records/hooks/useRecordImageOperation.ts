import { useRouter } from '@tanstack/react-router'
import { useLayoutEffect, useRef, useState } from 'react'
import { type Address, isAddressEqual } from 'viem'
import { useConfig } from 'wagmi'
import { getConnection, watchConnection } from 'wagmi/actions'

export const useRecordImageOperation = (
  address: Address,
  connectorUid: string | undefined,
) => {
  const router = useRouter()
  const config = useConfig()
  const pathname = router.state.location.pathname
  const mounted = useRef(false)
  const operation = useRef<AbortController | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  useLayoutEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      operation.current?.abort()
    }
  }, [])

  const isCurrent = (chainId?: number) => {
    const connection = getConnection(config)
    return (
      mounted.current &&
      router.latestLocation.pathname === pathname &&
      connection.status === 'connected' &&
      isAddressEqual(connection.address, address) &&
      connection.connector.uid === connectorUid &&
      (chainId === undefined || connection.chainId === chainId)
    )
  }

  const run = async <T>(
    task: (assertCurrent: () => void, signal: AbortSignal) => Promise<T>,
    isDraftCurrent: () => boolean,
  ): Promise<T> => {
    if (operation.current)
      throw new Error('An image operation is already in progress.')

    const { chainId } = getConnection(config)
    const controller = new AbortController()
    const assertCurrent = () => {
      if (
        controller.signal.aborted ||
        !isCurrent(chainId) ||
        !isDraftCurrent()
      ) {
        throw new Error('The editor or wallet changed. Please try again.')
      }
    }

    const stopWatchingWallet = watchConnection(config, {
      onChange: () => {
        if (!isCurrent(chainId)) controller.abort()
      },
    })
    const stopWatchingRoute = router.subscribe(
      'onBeforeNavigate',
      ({ pathChanged }) => {
        if (pathChanged) controller.abort()
      },
    )
    operation.current = controller
    setIsRunning(true)
    try {
      assertCurrent()
      return await task(assertCurrent, controller.signal)
    } finally {
      stopWatchingWallet()
      stopWatchingRoute()
      operation.current = null
      if (mounted.current) setIsRunning(false)
    }
  }

  return { run, isRunning, operation, isCurrent }
}
