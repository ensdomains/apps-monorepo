'use client'

import { useEffect } from 'react'
import { useSmartAccountContext } from './SmartAccountContext'
import type { SmartAccountState, UseSmartAccountConfig } from './types'

export type {
  KernelAccountState,
  ParaClient,
  PimlicoAccountState,
  RhinestoneAccountState,
  SmartAccountState,
  UseSmartAccountConfig,
} from './types'
export { isKernelAccount, isPimlicoAccount, isRhinestoneAccount } from './types'

/**
 * @deprecated Use `useSmartAccountContext` instead. This hook is maintained for backward compatibility
 * and now delegates to the shared context for a single source of truth.
 *
 * Unified Smart Account Hook
 *
 * This hook now uses the shared SmartAccountContext under the hood, ensuring all components
 * use the same smart account state. The config parameter is accepted for backward compatibility
 * but the context always uses kernel accounts.
 *
 * @example
 * // Use the context-based hook (recommended)
 * const account = useSmartAccountContext()
 *
 * @example
 * // Legacy usage (still works, but deprecated)
 * const account = useSmartAccount()
 * const account = useSmartAccount({ type: 'kernel', accountType: 'hca' })
 *
 * @example
 * // Type-safe usage
 * if (isKernelAccount(account)) {
 *   // account.client is KernelAccountClient
 *   // account.session contains the active session
 * }
 */
export function useSmartAccount(
  config?: UseSmartAccountConfig,
): SmartAccountState {
  // Show deprecation warning in development
  useEffect(() => {
    if (import.meta.env.DEV) {
      const providerType = config?.type ?? 'kernel'
      if (providerType !== 'kernel') {
        console.warn(
          `[DEPRECATED] useSmartAccount with type '${providerType}' is deprecated. ` +
            `The context only supports 'kernel' accounts. Please use useSmartAccountContext() instead.`,
        )
      } else {
        console.warn(
          '[DEPRECATED] useSmartAccount is deprecated. Please use useSmartAccountContext() instead.',
        )
      }
    }
  }, [config?.type])

  // Delegate to the shared context - single source of truth
  const contextValue = useSmartAccountContext()

  // The context always returns a KernelAccountState, which is compatible with SmartAccountState
  return contextValue as SmartAccountState
}
