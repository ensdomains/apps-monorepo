/**
 * Build a shape on chain.
 *
 * One walker over `Shape.path`, so 31 shapes are a table rather than 31 bespoke
 * seed blocks. The declarative half composes the existing fixtures; the
 * imperative half is `fixtures/v1-tails.ts`, applied after the whole tree
 * exists because that is the only time a "split" or a "mismatch" can be made.
 */

import type { Actor, Shape, WrapClass } from '@ens-apps/v1-name-shapes'
import type { Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createMakeV1Name } from '../fixtures/makeV1Name.js'
import { makeV1RegistrySubname } from '../fixtures/makeV1RegistrySubname.js'
import { CHILD_FUSES, makeV1Subname } from '../fixtures/makeV1Subname.js'
import {
  splitController,
  splitRegistrant,
  unwrapChild,
  unwrapParent2LD,
} from '../fixtures/v1-tails.js'
import { testClient } from '../helpers/anvil-client.js'

type Accounts = {
  getAddress: (user: Actor) => Address
  getPrivateKey: (user: Actor) => `0x${string}`
}

export type SeededShape = {
  readonly shape: Shape
  /** The leaf — the name under test. */
  readonly name: string
  /** Every level, parent-first; `levels[0]` is the `.eth` 2LD. */
  readonly levels: readonly string[]
  /** Who ends up holding the leaf. */
  readonly holder: Address
}

/**
 * Two years, so a shape survives the 90-day clock advances the grace shapes
 * make. The fork's clock is shared and only moves forward, so a one-year
 * default would let a later batch retroactively expire an earlier one's names
 * — which reads as an app bug, not a fixture one.
 */
const TWO_YEARS = 2 * 365 * 24 * 60 * 60
const DAY = 24 * 60 * 60

/**
 * The registrar's minimum. Clock-moving shapes register for exactly this, so
 * reaching grace costs 29 days of shared fork clock instead of two years —
 * every day of it is permanent, and every other name on the fork ages with it.
 */
const MIN_REGISTRATION = 28 * DAY

/** One day past expiry: inside the 90-day grace window. */
const INTO_GRACE = 29 * DAY
/** Past expiry AND past grace: the name is anyone's to register. */
const PAST_GRACE = 119 * DAY

/** `wrapETH2LD` burns PCC itself, so an emancipated 2LD is just "wrapped". */
const rootTypeFor = (wrap: WrapClass): 'unwrapped' | 'wrapped' | 'locked' => {
  switch (wrap) {
    case 'unwrapped':
      return 'unwrapped'
    case 'emancipated':
      return 'wrapped'
    case 'locked':
      return 'locked'
    case 'wrapped':
      throw new Error(
        'a .eth 2LD cannot be merely "wrapped" — wrapETH2LD burns PARENT_CANNOT_CONTROL, so it is emancipated or locked',
      )
  }
}

const childFusesFor = (wrap: WrapClass): number => {
  switch (wrap) {
    case 'wrapped':
      return CHILD_FUSES.UNLOCKED_CHILD
    case 'emancipated':
      return CHILD_FUSES.EMANCIPATED
    case 'locked':
      return CHILD_FUSES.LOCKED_CHILD
    case 'unwrapped':
      throw new Error('an unwrapped child has no wrapper fuses')
  }
}

/**
 * Anvil's mnemonic is public, so bots sweep its addresses on live Sepolia —
 * some via an EIP-7702 delegation, which the fork inherits as real bytecode.
 * That turns a plain recipient EOA into a token receiver whose callback returns
 * the wrong magic value, so `safeTransferFrom` and every NameWrapper mint to it
 * revert. The portal fixture clears this per test, but seeding runs in
 * `beforeAll`, before any page fixture has touched the accounts.
 *
 * Measured, not theorised: the first `split-registrant` seed against a freshly
 * restarted fork died with "ERC721: transfer to non ERC721Receiver implementer".
 */
const ensurePlainEoas = async (
  addresses: readonly Address[],
): Promise<void> => {
  for (const address of new Set(addresses)) {
    await testClient.setCode({ address, bytecode: '0x' })
  }
}

export const seedShape = async (
  shape: Shape,
  accounts: Accounts,
): Promise<SeededShape> => {
  const signer = (actor: Actor = 'user') =>
    privateKeyToAccount(accounts.getPrivateKey(actor))

  // Every wallet this shape names can end up holding a token — plus `user`,
  // which is the implicit holder wherever a node does not name one.
  await ensurePlainEoas([
    accounts.getAddress('user'),
    ...shape.path.flatMap((node) =>
      [node.holder, node.controller]
        .filter((actor): actor is Actor => !!actor)
        .map((actor) => accounts.getAddress(actor)),
    ),
  ])

  const root = shape.path[0]
  // When the token is handed away afterwards, the wallet that registers is the
  // one that KEEPS the registry slot — the split tail moves the other half.
  const rootActor = shape.tails?.includes('split-registrant')
    ? (root.controller ?? 'user')
    : (root.holder ?? 'user')

  // A wrapped child can only be minted by the NameWrapper, which must hold the
  // parent at the time — so a shape that wants a wrapped child under an
  // UNWRAPPED parent is built wrapped and unwrapped afterwards. The declared
  // shape is what the test sees; this is only how it gets there.
  const seedRootWrap = shape.tails?.includes('unwrap-parent-2ld')
    ? 'emancipated'
    : root.wrap

  const makeV1Name = createMakeV1Name({ userAccount: signer(rootActor) })
  const rootName = await makeV1Name({
    label: `v1m-${shape.n}`,
    type: rootTypeFor(seedRootWrap),
    duration: shape.registration === 'active' ? TWO_YEARS : MIN_REGISTRATION,
    ...(root.extraFuses ? { fuses: root.extraFuses } : {}),
  })

  const levels: string[] = [rootName]

  for (const [index, node] of shape.path.slice(1).entries()) {
    const parentFull = levels[index] as string
    const parentNode = shape.path[index] as (typeof shape.path)[number]
    const parentActor = parentNode.holder ?? 'user'
    // The fixtures take the parent minus `.eth`, dotted paths included.
    const parentName = parentFull.replace(/\.eth$/, '')
    const childLabel = `l${index + 1}`
    const ownerAddress = accounts.getAddress(node.holder ?? 'user')

    if (node.wrap === 'unwrapped') {
      // Under an unwrapped parent this is a plain registry write.
      if (parentNode.wrap === 'unwrapped') {
        levels.push(
          await makeV1RegistrySubname({
            parentName,
            childLabel,
            ownerAddress,
            parentOwnerAccount: signer(parentActor),
          }),
        )
        continue
      }

      // Under a WRAPPED parent it cannot be: the parent's registry owner is the
      // NameWrapper, so an EOA's `setSubnodeOwner` reverts. Mint it wrapped to
      // the parent's holder, then unwrap it onto the declared holder — which is
      // also the only way this mismatch arises in the wild.
      const wrappedChild = await makeV1Subname({
        parentName,
        childLabel,
        ownerAddress: accounts.getAddress(parentActor),
        parentOwnerAccount: signer(parentActor),
        fuses: CHILD_FUSES.UNLOCKED_CHILD,
      })
      await unwrapChild(wrappedChild, signer(parentActor), ownerAddress)
      levels.push(wrappedChild)
      continue
    }

    levels.push(
      await makeV1Subname({
        parentName,
        childLabel,
        ownerAddress,
        parentOwnerAccount: signer(parentActor),
        fuses: childFusesFor(node.wrap),
      }),
    )
  }

  for (const tail of shape.tails ?? []) {
    switch (tail) {
      case 'split-registrant':
        await splitRegistrant(
          rootName,
          signer(root.controller ?? 'user'),
          accounts.getAddress(root.holder ?? 'user'),
        )
        break
      case 'split-controller':
        await splitController(
          rootName,
          signer(root.holder ?? 'user'),
          accounts.getAddress(root.controller ?? 'user2'),
        )
        break
      // Forward only, and never inside a chain snapshot: `evm_revert` rewinds
      // the chain but not Panoptes, which then halts permanently on a history
      // that no longer exists. These shapes live in their own project and sort
      // last precisely so nothing downstream depends on the clock they move.
      case 'to-grace':
        await testClient.increaseTime({ seconds: INTO_GRACE })
        await testClient.mine({ blocks: 1 })
        break
      case 'past-grace':
        await testClient.increaseTime({ seconds: PAST_GRACE })
        await testClient.mine({ blocks: 1 })
        break
      case 'unwrap-parent-2ld':
        // Runs last: the child had to be minted while the wrapper still held
        // the parent.
        await unwrapParent2LD(
          rootName,
          signer(rootActor),
          accounts.getAddress(root.holder ?? 'user'),
        )
        break
      default:
        throw new Error(
          `shape ${shape.id}: seed tail "${tail}" is not implemented yet — the clock tails land in batch B6`,
        )
    }
  }

  const leaf = levels.at(-1) as string
  return {
    shape,
    name: leaf,
    levels,
    holder: accounts.getAddress(
      (shape.path.at(-1) as (typeof shape.path)[number]).holder ?? 'user',
    ),
  }
}
