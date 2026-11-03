import { createContext, use } from 'react'
import type { UpgradeReadCoordinator } from '../service/upgradeReadCoordinator'

export const UpgradeReadCoordinatorContext =
  createContext<UpgradeReadCoordinator | null>(null)

/** Shared hooks outside /upgrade retain their standalone read clients. */
export const useUpgradeReadCoordinator = () =>
  use(UpgradeReadCoordinatorContext)
