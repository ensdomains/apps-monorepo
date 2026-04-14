import { type Config as WagmiConfig, writeContract } from '@wagmi/core'
import type { Address, Hex } from 'viem'
import {
  buildUnwrappedCall,
  buildUnwrappedMulticall,
  buildWrappedBatchCall,
  buildWrappedSingleCall,
} from './buildMigrationCalls'
import type { ClassifiedName } from './classifyNames'
import { decodeMigrationRevertReason } from './decodeMigrationError'
import type { SkippedName } from './migrationService'

export const isUserRejection = (error: unknown): boolean => {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return (
      msg.includes('user rejected') ||
      msg.includes('user denied') ||
      msg.includes('rejected the request')
    )
  }
  return false
}

type BucketResult = { hashes: Hex[]; skipped: SkippedName[] }

const toSkipped = (name: ClassifiedName, error: unknown): SkippedName => ({
  name: name.domain.name,
  reason: decodeMigrationRevertReason(error),
})

const signMigrationBucket = async (params: {
  names: readonly ClassifiedName[]
  executeSingle: (name: ClassifiedName) => Promise<Hex>
  executeBatch: (names: readonly ClassifiedName[]) => Promise<Hex>
}): Promise<BucketResult> => {
  const { names, executeSingle, executeBatch } = params

  if (names.length === 0) return { hashes: [], skipped: [] }

  if (names.length === 1 && names[0]) {
    const only = names[0]
    try {
      const hash = await executeSingle(only)
      return { hashes: [hash], skipped: [] }
    } catch (error) {
      if (isUserRejection(error)) throw error
      return { hashes: [], skipped: [toSkipped(only, error)] }
    }
  }

  try {
    const hash = await executeBatch(names)
    return { hashes: [hash], skipped: [] }
  } catch (error) {
    if (isUserRejection(error)) throw error
  }

  const hashes: Hex[] = []
  const skipped: SkippedName[] = []
  for (const name of names) {
    try {
      hashes.push(await executeSingle(name))
    } catch (error) {
      if (isUserRejection(error)) throw error
      skipped.push(toSkipped(name, error))
    }
  }

  return { hashes, skipped }
}

export const signUnwrappedTxs = (params: {
  wagmiConfig: WagmiConfig
  names: readonly ClassifiedName[]
  migrationOwner: Address
  defaultResolver: Address
}): Promise<BucketResult> => {
  const { wagmiConfig, names, migrationOwner, defaultResolver } = params
  return signMigrationBucket({
    names,
    executeSingle: (name) =>
      writeContract(
        wagmiConfig,
        buildUnwrappedCall({ name, migrationOwner, defaultResolver }).request,
      ),
    executeBatch: (batch) =>
      writeContract(
        wagmiConfig,
        buildUnwrappedMulticall({
          names: batch,
          migrationOwner,
          defaultResolver,
        }),
      ),
  })
}

export const signWrappedTxs = (params: {
  wagmiConfig: WagmiConfig
  names: readonly ClassifiedName[]
  migrationOwner: Address
  defaultResolver: Address
  target: Address
}): Promise<BucketResult> => {
  const { wagmiConfig, names, migrationOwner, defaultResolver, target } = params
  return signMigrationBucket({
    names,
    executeSingle: (name) =>
      writeContract(
        wagmiConfig,
        buildWrappedSingleCall({
          name,
          migrationOwner,
          defaultResolver,
          target,
        }).request,
      ),
    executeBatch: (batch) =>
      writeContract(
        wagmiConfig,
        buildWrappedBatchCall({
          names: batch,
          migrationOwner,
          defaultResolver,
          target,
        }).request,
      ),
  })
}
