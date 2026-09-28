/**
 * The record set every seedable shape carries, and who is allowed to write it.
 *
 * Until the resolver repoint landed, every V1 `setText` reverted, so the record
 * and address cells could only assert the *absence* of records — "No records
 * set" is a claim that passes equally well on a page that renders nothing. B7
 * gives those cells something real to be wrong about.
 *
 * Three choices here are load-bearing:
 *
 * - **Values are unique per shape.** `@v1m-24` cannot be satisfied by a stale
 *   render of shape 23's page, or by a resolver that returns a default.
 * - **The ETH address record is `user3`, never the holder.** It is the one
 *   wallet no shape gives a name to, so an assertion that accidentally reads an
 *   ownership row instead of the address record fails instead of passing by
 *   coincidence — the same trap `readAddressRows` was written to avoid.
 * - **The writer is read off the chain, not taken from the shape.** Whoever the
 *   shape calls the holder may not be who may write: a `split-controller` shape
 *   hands the registry slot to a second wallet precisely so the registrant
 *   cannot set records. Asking the chain means the seeder writes as whoever is
 *   actually authorised, or fails loudly.
 */

import type { Actor, Shape } from '@ens-apps/v1-name-shapes'
import type { Address } from 'viem'
import type { V1Records } from '../fixtures/v1-records.js'
import type { ChainTruth } from './chain.js'

/** Text keys the matrix seeds. Expectations name these; values come from chain. */
export const MATRIX_TEXT_KEYS = ['com.twitter', 'url'] as const

/** The coin the address tab is asserted on. */
export const ETH_COIN_TYPE = 60

/**
 * Records for one shape, or null when the shape must not carry any.
 *
 * Non-active shapes are excluded: their `.eth` 2LD has lapsed, so resolver
 * reads are a separate question from the refusal copy those cells exist to pin,
 * and writing records to them would spend fork clock proving nothing.
 */
export const recordsFor = (
  shape: Shape,
  ethAddress: Address,
): V1Records | null => {
  if (shape.registration !== 'active') return null
  return {
    texts: [
      { key: 'com.twitter', value: `@v1m-${shape.n}` },
      { key: 'url', value: `https://shape-${shape.n}.v1matrix.test` },
    ],
    addresses: [{ coinType: ETH_COIN_TYPE, value: ethAddress }],
  }
}

/**
 * The wallet the chain will accept records from: the wrapper owner when the
 * name is wrapped, otherwise the registry controller.
 */
export const recordWriterFor = (
  truth: ChainTruth,
  addressOf: (actor: Actor) => Address,
): Actor => {
  const authorised = (truth.wrapperOwner ?? truth.controller).toLowerCase()
  const actor = (['user', 'user2', 'user3'] as const).find(
    (candidate) => addressOf(candidate).toLowerCase() === authorised,
  )
  if (!actor) {
    throw new Error(
      `[matrix/records] no test wallet matches ${authorised}, which is the only address that may write this name's records — the shape and the seeded tree disagree about who holds it`,
    )
  }
  return actor
}
