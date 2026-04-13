import { type Config as WagmiConfig, writeContract } from '@wagmi/core'
import type { Address, Hex } from 'viem'
import {
  buildUnwrappedCall,
  buildUnwrappedMulticall,
  buildWrappedCalls,
  type WrappedMigrationCall,
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

const writeWrappedRequest = (
  wagmiConfig: WagmiConfig,
  call: WrappedMigrationCall,
): Promise<Hex> =>
  call.type === 'wrapped-single'
    ? writeContract(wagmiConfig, call.request)
    : writeContract(wagmiConfig, call.request)

export const signUnwrappedTxs = async (params: {
  wagmiConfig: WagmiConfig
  names: readonly ClassifiedName[]
  migrationOwner: Address
  defaultResolver: Address
}): Promise<{ hashes: Hex[]; skipped: SkippedName[] }> => {
  const { wagmiConfig, names, migrationOwner, defaultResolver } = params

  if (names.length === 0) return { hashes: [], skipped: [] }

  if (names.length === 1 && names[0]) {
    const call = buildUnwrappedCall({
      name: names[0],
      migrationOwner,
      defaultResolver,
    })
    try {
      const hash = await writeContract(wagmiConfig, call.request)
      return { hashes: [hash], skipped: [] }
    } catch (error) {
      if (isUserRejection(error)) throw error
      return {
        hashes: [],
        skipped: [
          {
            name: names[0].domain.name,
            reason: decodeMigrationRevertReason(error),
          },
        ],
      }
    }
  }

  try {
    const hash = await writeContract(
      wagmiConfig,
      buildUnwrappedMulticall({ names, migrationOwner, defaultResolver }),
    )
    return { hashes: [hash], skipped: [] }
  } catch (error) {
    if (isUserRejection(error)) throw error
  }

  const hashes: Hex[] = []
  const skipped: SkippedName[] = []
  for (const name of names) {
    const call = buildUnwrappedCall({
      name,
      migrationOwner,
      defaultResolver,
    })
    try {
      const hash = await writeContract(wagmiConfig, call.request)
      hashes.push(hash)
    } catch (error) {
      if (isUserRejection(error)) throw error
      skipped.push({
        name: name.domain.name,
        reason: decodeMigrationRevertReason(error),
      })
    }
  }

  return { hashes, skipped }
}

export const signWrappedTxs = async (params: {
  wagmiConfig: WagmiConfig
  names: readonly ClassifiedName[]
  migrationOwner: Address
  defaultResolver: Address
  target: Address
}): Promise<{ hashes: Hex[]; skipped: SkippedName[] }> => {
  const { wagmiConfig, names, migrationOwner, defaultResolver, target } = params

  if (names.length === 0) return { hashes: [], skipped: [] }

  if (names.length === 1 && names[0]) {
    const call = buildWrappedCalls({
      names,
      migrationOwner,
      defaultResolver,
      target,
    })
    try {
      const hash = await writeWrappedRequest(wagmiConfig, call)
      return { hashes: [hash], skipped: [] }
    } catch (error) {
      if (isUserRejection(error)) throw error
      return {
        hashes: [],
        skipped: [
          {
            name: names[0].domain.name,
            reason: decodeMigrationRevertReason(error),
          },
        ],
      }
    }
  }

  try {
    const hash = await writeWrappedRequest(
      wagmiConfig,
      buildWrappedCalls({ names, migrationOwner, defaultResolver, target }),
    )
    return { hashes: [hash], skipped: [] }
  } catch (error) {
    if (isUserRejection(error)) throw error
  }

  const hashes: Hex[] = []
  const skipped: SkippedName[] = []
  for (const name of names) {
    const singleCall = buildWrappedCalls({
      names: [name],
      migrationOwner,
      defaultResolver,
      target,
    })
    try {
      const hash = await writeWrappedRequest(wagmiConfig, singleCall)
      hashes.push(hash)
    } catch (error) {
      if (isUserRejection(error)) throw error
      skipped.push({
        name: name.domain.name,
        reason: decodeMigrationRevertReason(error),
      })
    }
  }

  return { hashes, skipped }
}
