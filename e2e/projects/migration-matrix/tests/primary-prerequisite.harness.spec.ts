import { type Browser, expect, test } from '@playwright/test'
import type { NamespaceCheck } from '../namespace-actions.js'
import { checkPrimaryActions } from '../primary-actions.js'

test('missing before-stage reverse proof blocks retention without attempting the app or chain', async () => {
  const checks: NamespaceCheck[] = []
  const browser = {
    newContext: () => {
      throw new Error(
        'The missing prerequisite must be handled before app access',
      )
    },
  } as unknown as Browser
  const fixture = {
    leaf: 'unverified-primary.matrix.eth',
    c: { config_id: 'CFG-0040' },
  } as Parameters<typeof checkPrimaryActions>[1]
  await checkPrimaryActions(browser, fixture, 'W3', 'after', (check) =>
    checks.push(check),
  )
  expect(checks).toHaveLength(1)
  expect(checks[0]).toMatchObject({
    actor: 'W3',
    stage: 'after',
    action: 'retain reverse and verified primary after migration/refusal',
    result: 'BLOCKED',
    evidence: { prerequisiteResult: 'NOT ESTABLISHED' },
  })
  expect(checks[0].detail).toContain('does not prove lost reverse data')
})
