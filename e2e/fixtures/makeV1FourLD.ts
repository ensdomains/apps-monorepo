import type {
  Actor,
  NodeSpec,
  Shape,
  WrapClass,
} from '@ens-apps/v1-name-shapes'
import { namehash } from 'viem'
import { readChainTruth } from '../matrix/chain.js'
import { type SeedAccounts, seedShape } from '../matrix/seed.js'
import type { V1Records } from './v1-records.js'

type ChildClass = 'registry' | 'unlocked' | 'emancipated' | 'locked'
type Child =
  | ChildClass
  | {
      readonly type: ChildClass
      readonly extraFuses?: number
      readonly expiry?: bigint
    }
export type FourLDConfig = {
  /** Wrapped .eth 2LDs inherently have PCC; `wrapped` aliases `emancipated`. */
  readonly twoLd: 'unwrapped' | 'wrapped' | 'locked' | 'emancipated'
  readonly threeLd: Child
  readonly fourLd: Child
  readonly owners?: {
    readonly twoLd?: Actor
    readonly threeLd?: Actor
    readonly fourLd?: Actor
  }
  readonly records?: V1Records
  readonly duration?: number
}
const childWrap = (type: ChildClass): WrapClass =>
  type === 'registry' ? 'unwrapped' : type === 'unlocked' ? 'wrapped' : type
const childNode = (child: Child, holder: Actor): NodeSpec => ({
  wrap: childWrap(typeof child === 'string' ? child : child.type),
  holder,
  extraFuses: typeof child === 'string' ? undefined : child.extraFuses,
})

/** Same walker as the generated matrix; every level is verified independently. */
export const makeV1FourLD = async (
  config: FourLDConfig,
  accounts: SeedAccounts,
) => {
  const path: readonly [NodeSpec, NodeSpec, NodeSpec] = [
    {
      wrap: config.twoLd === 'wrapped' ? 'emancipated' : config.twoLd,
      holder: config.owners?.twoLd ?? 'user',
    },
    childNode(config.threeLd, config.owners?.threeLd ?? 'user'),
    childNode(config.fourLd, config.owners?.fourLd ?? 'user'),
  ]
  // A wrapped 3LD must be minted before its 2LD is unwrapped (Q2).
  const tails: Shape['tails'] =
    path[0].wrap === 'unwrapped' && path[1].wrap !== 'unwrapped'
      ? ['unwrap-parent-2ld']
      : []
  const seeded = await seedShape(
    {
      n: 90,
      id: 'action-4ld',
      path,
      tails,
      role: 'owner',
      registration: 'active',
      rationale: 'Iteration 53: V1 action scenarios Q1–Q24',
      v3NameType: 'eth-wrapped-subname',
    },
    accounts,
    {
      duration: config.duration,
      records: config.records ?? null,
      expiries: [
        undefined,
        ...[config.threeLd, config.fourLd].map((child) =>
          typeof child === 'string' ? undefined : child.expiry,
        ),
      ],
    },
  )
  const levels = await Promise.all(
    seeded.levels.map(async (name, i) => {
      const truth = await readChainTruth(name)
      const expected = path[i]
      if (!expected) throw new Error(`Unexpected fourth seed level: ${name}`)
      const owner = truth.wrapperOwner ?? truth.controller
      if (
        owner.toLowerCase() !==
          accounts.getAddress(expected.holder ?? 'user').toLowerCase() ||
        truth.wrapClass !== expected.wrap ||
        (truth.fuses & (expected.extraFuses ?? 0)) !==
          (expected.extraFuses ?? 0)
      )
        throw new Error(
          `4LD fixture mismatch at ${name}: owner=${owner}, wrap=${truth.wrapClass}, fuses=${truth.fuses}`,
        )
      return { name, node: namehash(name), owner, ...truth }
    }),
  )
  const [twoLd, threeLd, fourLd] = levels
  if (!twoLd || !threeLd || !fourLd)
    throw new Error('4LD seeder must return exactly three levels')
  return {
    name: seeded.name,
    node: namehash(seeded.name),
    levels,
    twoLd,
    threeLd,
    fourLd,
  }
}
export type V1FourLD = Awaited<ReturnType<typeof makeV1FourLD>>
