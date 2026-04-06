import { type Config as WagmiConfig, writeContract } from '@wagmi/core'
import type { Address, Hex } from 'viem'
import {
  buildUnwrappedCall,
  buildUnwrappedMulticall,
  buildWrappedCalls,
  type WrappedMigrationCall,
} from './buildMigrationCalls'
import type { ClassifiedName } from './classifyNames'
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

export const signUnwrappedTx = async (params: {
  wagmiConfig: WagmiConfig
  names: readonly ClassifiedName[]
  migrationOwner: Address
  defaultResolver: Address
}): Promise<Hex> => {
  const { wagmiConfig, names, migrationOwner, defaultResolver } = params

  if (names.length === 1 && names[0]) {
    const call = buildUnwrappedCall({
      name: names[0],
      migrationOwner,
      defaultResolver,
    })
    return writeContract(wagmiConfig, call.request)
  }

  return writeContract(
    wagmiConfig,
    buildUnwrappedMulticall({ names, migrationOwner, defaultResolver }),
  )
}

// Narrowing helper: writeContract requires a specific request type, not the WrappedMigrationCall union
const writeWrappedCall = (
  wagmiConfig: WagmiConfig,
  call: WrappedMigrationCall,
): Promise<Hex> =>
  call.type === 'wrapped-single'
    ? writeContract(wagmiConfig, call.request)
    : writeContract(wagmiConfig, call.request)

export const signWrappedTxs = async (params: {
  wagmiConfig: WagmiConfig
  names: readonly ClassifiedName[]
  migrationOwner: Address
  defaultResolver: Address
  target: Address
}): Promise<{ hashes: Hex[]; skipped: SkippedName[] }> => {
  const { wagmiConfig, names, migrationOwner, defaultResolver, target } = params

  const call = buildWrappedCalls({
    names,
    migrationOwner,
    defaultResolver,
    target,
  })

  try {
    const hash = await writeWrappedCall(wagmiConfig, call)
    return { hashes: [hash], skipped: [] }
  } catch (error) {
    if (isUserRejection(error)) throw error
    if (names.length <= 1) {
      return {
        hashes: [],
        skipped: [
          {
            name: names[0]?.domain.name ?? 'unknown',
            reason: 'transfer-failed',
          },
        ],
      }
    }
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
      const hash = await writeWrappedCall(wagmiConfig, singleCall)
      hashes.push(hash)
    } catch (error) {
      if (isUserRejection(error)) throw error
      skipped.push({ name: name.domain.name, reason: 'transfer-failed' })
    }
  }

  return { hashes, skipped }
}
