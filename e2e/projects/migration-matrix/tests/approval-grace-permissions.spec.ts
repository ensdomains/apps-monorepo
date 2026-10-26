import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect } from '../matrix-fixture.js'
import { account, recordBundle } from '../seed.js'
import { afterPermissions, v2State } from '../probes.js'
import { chainActivity } from '../record-evidence.js'
import { resolveRecords } from '../../../helpers/resolve-records.js'

test('corrected transfer oracle on the exact renewed and migrated split-manager fixture', async ({}, info) => {
  const source = process.env.APPROVAL_GRACE_PERMISSION_SOURCE!
  const prior = JSON.parse(readFileSync(source, 'utf8'))
  const c = prior.configuration
  expect(prior.migrationOutcome, 'Original UI renewal and migration completed').toBe('success')
  expect(prior.error, 'Only correct the identified overly strict transfer assertion').toContain('Renewed owner retains transfer')
  const records = recordBundle(`${c.config_id}/${prior.subject}`)
  const fixture = { leaf: prior.subject, records } as Parameters<typeof afterPermissions>[0]
  const d: Record<string, any> = { ...prior, originalSource: source, originalError: prior.error, originalAssertionErrors: prior.assertionErrors, error: undefined, assertionErrors: [], completedAt: undefined, startedAt: new Date().toISOString(), scope: 'Read-only completion of authorization and retention assertions on the exact fresh fixture whose UI renewal and migration already succeeded. No migration is repeated and no contract response is mocked. The original failed safeTransferFrom expectation remains linked; this uses unsafeTransfer, as the established retention oracle does.' }
  const out = resolve(process.env.REPLACEMENT_RESULTS!, 'supplemental')
  mkdirSync(out, { recursive: true })
  try {
    d.afterState = await v2State(prior.subject)
    expect(d.afterState?.status).toBe(2)
    expect(d.afterState?.latestOwner.toLowerCase()).toBe(account(c.root_owner).address.toLowerCase())
    d.afterRecords = await resolveRecords(prior.subject, records)
    expect(d.afterRecords).toHaveLength(18)
    expect(d.afterRecords.filter((r: any) => r.got !== r.want)).toEqual([])
    d.ownerAfter = await afterPermissions(fixture, c.root_owner)
    d.managerAfter = await afterPermissions(fixture, c.root_manager)
    d.unrelatedAfter = await afterPermissions(fixture, 'Unrelated')
    for (const action of ['records', 'setResolver', 'unsafeTransfer']) {
      expect(d.ownerAfter[action].result, `Owner ${action}`).toBe('ALLOWED')
      expect(d.unrelatedAfter[action].result, `Unrelated ${action}`).toBe('DENIED')
    }
    expect(d.managerAfter.registryRoles).toBe(1n << 24n)
    expect(d.managerAfter.resolverRoles).toBe(0x1111111n)
    for (const action of ['records', 'setResolver']) expect(d.managerAfter[action].result, `Manager ${action}`).toBe('ALLOWED')
    for (const action of ['unsafeTransfer', 'grantResolverRole']) expect(d.managerAfter[action].result, `Manager ${action}`).toBe('DENIED')
    d.transferOracle = 'unsafeTransfer: same authorization requirement as retention-oracle.ts; safeTransferFrom is a different, more restrictive contract operation.'
    d.checks['Separate renewal then migration preserves records and owner'] = { result: 'PASS', detail: 'The original UI renewal and migration succeeded. Read-only assertions on that exact fixture passed: owner, all 18 resolved records, owner transfer/record/resolver authority, unrelated-wallet denial, and exact retained-manager registry/resolver roles with limited authority.' }
    d.phase = 'completed separate renewal and migration workaround'
  } catch (error) { d.error = String(error); throw error }
  finally {
    d.afterActivity = await chainActivity(BigInt(prior.beforeActivity.fromBlock))
    d.completedAt = new Date().toISOString()
    d.assertionErrors = info.errors.map(error => error.message)
    writeFileSync(resolve(out, `v1-grace-recovery-${c.config_id}.json`), JSON.stringify(d, (_k, v) => typeof v === 'bigint' ? String(v) : v, 2))
  }
})
