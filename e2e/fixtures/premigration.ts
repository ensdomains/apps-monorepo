/**
 * HW10 — put the fork in the premigration state the apps actually run against.
 *
 * On Sepolia every unmigrated V1 name is RESERVED in the V2 ETH Registry with
 * its resolver set to the **ENSV1Resolver**, a wildcard (ENSIP-10) resolver
 * that proxies reads back to V1. That is what makes `UniversalResolver` answer
 * for V1 names at all, and — because it is wildcard-capable — what makes a V1
 * *subname* resolve even though the plain V1 PublicResolver cannot serve one.
 *
 * This fixture exists because getting that one address wrong cost a day and a
 * wrongly-filed defect. `reserveInV2` used to reserve with the plain
 * `V1_PUBLIC_RESOLVER`, so on the fork:
 *
 *   findResolver(a V1 2LD)     -> 0x8FADE66B…  offset 0   works by luck
 *   findResolver(a V1 subname) -> 0x8FADE66B…  offset 3   wildcard, unserved
 *
 * while on Sepolia both return the ENSV1Resolver and both work. The 2LD case
 * looked identical under both wirings and the subname case did not, which read
 * exactly like an app bug in the subname path (E2E-017, withdrawn).
 *
 * **The address is discovered, never pinned.** ensjs does not expose it, and
 * this repo has been bitten twice by a local service pinned to a deployment the
 * apps had moved off. Instead we ask the fork what resolver it already uses for
 * names reserved before the fork point, and require them to agree.
 */

import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { type Address, getAddress, parseAbi } from 'viem'
import { publicClient } from '../helpers/anvil-client.js'

const V2_ETH_REGISTRY = ensL1Contracts[supportedL1Chains.sepolia].ensRegistry
  .address as Address

const REGISTRY_ABI = parseAbi([
  'function getResolver(string label) view returns (address)',
])

const ZERO = '0x0000000000000000000000000000000000000000'

/**
 * Labels reserved on Sepolia long before any fork point, used only to read back
 * the resolver the deployment assigns to a reserved V1 name.
 *
 * Several, not one, because any single label could be migrated or allowed to
 * lapse and would then answer differently — and a probe that silently picks up
 * the wrong answer reinstates exactly the bug this fixture exists to prevent.
 * Measured 2026-09-18: 14 of 15 such labels returned the same address, the odd
 * one out being simply unreserved. 2026-10-09: `hello` dropped — on a fork
 * taken that day it answered `0x61336d67…` while the other seven agreed on
 * `0x322B7581…`, i.e. it had been migrated or re-pointed on live Sepolia.
 */
const PROBE_LABELS = [
  'demo',
  'test',
  'ens',
  'vitalik',
  'nick',
  'alice',
  'bob',
  'example',
  'sepolia',
] as const

let cached: Address | null = null

/**
 * The resolver this deployment puts on reserved-but-unmigrated V1 names.
 *
 * Throws rather than guessing. A wrong answer here is invisible — names still
 * resolve, 2LDs still render, and only subnames quietly stop working — so the
 * failure has to be at discovery time, where it is legible.
 */
export const discoverV1CompatResolver = async (): Promise<Address> => {
  if (cached) return cached

  const seen = new Map<string, string[]>()
  for (const label of PROBE_LABELS) {
    const resolver = await publicClient
      .readContract({
        address: V2_ETH_REGISTRY,
        abi: REGISTRY_ABI,
        functionName: 'getResolver',
        args: [label],
      })
      .catch(() => ZERO as Address)
    if (resolver === ZERO) continue
    const key = getAddress(resolver)
    seen.set(key, [...(seen.get(key) ?? []), label])
  }

  if (seen.size === 0) {
    throw new Error(
      `[premigration] none of the probe labels is reserved in the V2 registry at ${V2_ETH_REGISTRY}. ` +
        'Either the fork is not a Sepolia fork, or the registry has moved — refusing to guess a resolver, ' +
        'because the wrong one leaves V1 subnames silently unresolvable.',
    )
  }
  if (seen.size > 1) {
    const detail = [...seen]
      .map(([address, labels]) => `${address} (${labels.join(', ')})`)
      .join(' vs ')
    throw new Error(
      `[premigration] reserved V1 names disagree about their resolver: ${detail}. ` +
        'One of these is a migrated or re-pointed name; pick fresh probe labels rather than letting a ' +
        'coin toss decide how every seeded V1 name resolves.',
    )
  }

  cached = [...seen.keys()][0] as Address
  console.log(
    `[premigration] V1 compat resolver on this fork: ${cached} (agreed by ${(seen.get(cached) ?? []).length} reserved labels)`,
  )
  return cached
}

/** Test-only: forget the discovered address, e.g. after a fork restart. */
export const resetV1CompatResolverCache = (): void => {
  cached = null
}
