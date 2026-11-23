import { requiresIndependentGraceMigration } from './migration-policy.js'
import type { Configuration } from './seed.js'

type Check = {
  check: string
  actor?: string
  result: 'PASS' | 'FAIL' | 'NOT RUN' | 'BLOCKED'
  expected: string
  actual: string
}
const ALL = BigInt(`0x${'1'.repeat(64)}`)
const SET_RESOLVER = 1n << 24n
const SET_SUBREGISTRY = 1n << 20n
const CAN_TRANSFER_ADMIN = 1n << 156n
const WAS_RESERVED = 1n << 32n

/** Requirement oracle for the matrix's minimal legal fuse baseline.
 * Recreated children receive ALL roles and MAX expiry (N-07/N-08).
 * Native locked names retain fuse-derived roles (migration case study).
 * Constants are from the pinned protocol, not learned from observed results.
 */
export function retentionAssertions(
  c: Configuration,
  evidence: Record<string, any>,
): Check[] {
  const checks: Check[] = []
  const equal = (
    check: string,
    actual: unknown,
    expected: unknown,
    actor?: string,
  ) => {
    const normalize = (v: unknown) =>
      typeof v === 'bigint'
        ? v.toString()
        : typeof v === 'object'
          ? JSON.stringify(v, (_k, val) =>
              typeof val === 'bigint' ? String(val) : val,
            )
          : String(v)
    checks.push({
      check,
      actor,
      result:
        actual === undefined
          ? 'NOT RUN'
          : actual === 'BLOCKED' || expected === 'BLOCKED'
            ? 'BLOCKED'
            : normalize(actual) === normalize(expected)
              ? 'PASS'
              : 'FAIL',
      expected: normalize(expected),
      actual: normalize(actual),
    })
  }
  const state = evidence.afterState
  // A successful subject check must not hide a changed parent or sibling.
  // Compare each seeded name, including the complete record-key inventory.
  // Identical resolution errors mean continuity only; original source storage
  // is independently checked below and must never be inferred from them.
  type TreeRead = { name: string; records: unknown[] }
  const beforeTree = evidence.beforeTreeRecords as TreeRead[] | undefined
  const afterTree = evidence.afterTreeRecords as TreeRead[] | undefined
  const names = evidence.names as string[] | undefined
  if (names)
    equal(
      'All seeded names have a before-resolution snapshot',
      beforeTree?.map((t) => t.name).sort(),
      [...names].sort(),
    )
  if (beforeTree) {
    equal(
      'All seeded names have an after-resolution snapshot',
      afterTree?.map((t) => t.name).sort(),
      beforeTree.map((t) => t.name).sort(),
    )
    for (const prior of beforeTree) {
      const current = afterTree?.find((t) => t.name === prior.name)
      equal(
        `Resolution unchanged across migration attempt: ${prior.name}`,
        afterTree === undefined ? undefined : (current?.records ?? null),
        prior.records,
      )
    }
  }
  if (requiresIndependentGraceMigration(c)) {
    const migrated =
      state?.status === 2
        ? true
        : /^blocked/.test(String(evidence.migrationOutcome))
          ? false
          : undefined
    equal(
      'MIGRATION-GRACE-01: active emancipated child migrates independently of V2 ancestor grace',
      migrated,
      true,
    )
  }
  if (!state || state.status !== 2) {
    if (/^(blocked|expired subject)/.test(String(evidence.migrationOutcome))) {
      equal(
        'Refusal preserves the V2 root state',
        evidence.afterRoot,
        evidence.beforeRoot,
      )
      equal(
        'Refusal preserves the subject resolution',
        evidence.afterRecords,
        evidence.beforeRecords,
      )
      // Resolution can fail identically on both sides of an ancestor-grace
      // refusal. Check the original resolver's stored values independently.
      const sourceBefore = evidence.beforeSourceRecords as
        | { what: string; want: unknown; got: unknown; raw?: string }[]
        | undefined
      const sourceAfter = evidence.afterSourceRecords as typeof sourceBefore
      const unreadable = (records: NonNullable<typeof sourceBefore>) =>
        records.some(
          (r) =>
            !r.raw ||
            r.got === undefined ||
            String(r.got).startsWith('read failed:'),
        )
      const keys = (records: { what: string }[]) =>
        JSON.stringify(records.map((r) => r.what).sort())
      const completeSource =
        !evidence.beforeRecords ||
        keys(sourceBefore ?? []) === keys(evidence.beforeRecords)
      const sourceBaseline =
        sourceBefore === undefined
          ? undefined
          : unreadable(sourceBefore)
            ? 'BLOCKED'
            : completeSource &&
              sourceBefore.length > 0 &&
              sourceBefore.every((r) => r.got === r.want)
      equal(
        'Original stored records match seeded values before refusal',
        sourceBaseline,
        true,
      )
      const bytes = (records: NonNullable<typeof sourceBefore>) =>
        records.map(({ what, got, raw }) => ({ what, got, raw }))
      const preserved =
        sourceBefore === undefined || sourceAfter === undefined
          ? undefined
          : sourceBaseline !== true || unreadable(sourceAfter)
            ? 'BLOCKED'
            : bytes(sourceAfter)
      equal(
        'Refusal preserves original stored record bytes',
        preserved,
        sourceBefore ? bytes(sourceBefore) : 'record snapshot',
      )
      if (evidence.beforeTreeRecords)
        equal(
          'Refusal preserves every seeded name in the tree',
          evidence.afterTreeRecords,
          evidence.beforeTreeRecords,
        )
      for (const actor of c.actors) {
        const observation = evidence.actors?.[actor.case_id]
        for (const [action, value] of Object.entries(
          observation?.afterRefusal ?? {},
        )) {
          if (value && typeof value === 'object' && 'result' in value)
            equal(
              `Refusal preserves ${action} authority`,
              value.result,
              observation.before?.[action]?.result,
              actor.case_id,
            )
        }
      }
    }
    return checks
  }
  const ownerId =
    c.level === '2LD'
      ? c.root_owner
      : c.name_holder.startsWith('W')
        ? c.name_holder
        : c.name_manager
  const recreated = c.expected_migration.startsWith('Recreate')
  const locked =
    c.level === '2LD' ? c.root_type === 'Locked' : c.lock === 'Locked'
  const basic = SET_RESOLVER | (locked ? 0n : SET_SUBREGISTRY)
  const ownerBitmap = recreated
    ? ALL
    : basic |
      (basic << 128n) |
      CAN_TRANSFER_ADMIN |
      (c.level === '2LD' ? WAS_RESERVED : 0n)
  if (c.level === '2LD')
    equal(
      'Exact premigrated root expiry retained',
      state.expiry,
      evidence.beforeRoot?.expiry,
    )
  if (recreated)
    equal('Recreated child receives MAX expiry', state.expiry, (1n << 64n) - 1n)
  if (c.level !== '2LD' && !recreated && evidence.beforeMetadata) {
    const subject = evidence.beforeMetadata.find(
      (m: { name: string }) => m.name === evidence.subject,
    )
    equal(
      'Native child retains exact wrapper expiry',
      state.expiry,
      subject?.wrapperExpiry,
    )
  }
  for (const actor of c.actors.filter((a) => a.actor !== 'Disconnected')) {
    const post = evidence.actors?.[actor.case_id]?.after
    if (!post) {
      equal(
        'After-migration role and permission reads',
        undefined,
        'completed',
        actor.case_id,
      )
      continue
    }
    const owner = actor.actor === ownerId
    const parentRoot = recreated && actor.actor === c.root_owner
    const manager =
      c.level === '2LD' &&
      c.root_owner !== c.root_manager &&
      actor.actor === c.root_manager &&
      c.retain_manager === 'Keep'
    for (const [action, expected] of [
      ['unsafeTransfer', owner],
      ['grantResolverRole', owner || parentRoot],
      ['unregister', recreated && (owner || parentRoot)],
      ['setSubregistry', (owner && !locked) || parentRoot],
      ['createSubname', owner || parentRoot],
    ] as const) {
      if (post[action])
        equal(
          `Contract ${action} authorization`,
          post[action].result,
          expected ? 'ALLOWED' : 'DENIED',
          actor.case_id,
        )
    }
    equal(
      'Exact per-name registry role bitmap',
      BigInt(post.registryRoles),
      owner ? ownerBitmap : manager ? SET_RESOLVER : 0n,
      actor.case_id,
    )
    if (!recreated) {
      equal(
        'Exact root resolver role bitmap',
        post.resolverRoles == null ? undefined : BigInt(post.resolverRoles),
        owner ? ALL : manager ? 0x1111111n : 0n,
        actor.case_id,
      )
      equal(
        'Direct record-write authorization',
        post.records.result,
        owner || manager ? 'ALLOWED' : 'DENIED',
        actor.case_id,
      )
      equal(
        'Resolver-change authorization',
        post.setResolver.result,
        owner || manager ? 'ALLOWED' : 'DENIED',
        actor.case_id,
      )
    } else {
      if (
        owner ||
        actor.actor === 'Resolver delegate' ||
        actor.actor === 'Unrelated'
      )
        equal(
          'Retained V1 resolver authorization',
          post.records.result,
          actor.actor === 'Unrelated' ? 'DENIED' : 'ALLOWED',
          actor.case_id,
        )
      equal(
        'Child resolver-change authorization including parent control',
        post.setResolver.result,
        owner || actor.actor === c.root_owner ? 'ALLOWED' : 'DENIED',
        actor.case_id,
      )
    }
  }
  return checks
}
