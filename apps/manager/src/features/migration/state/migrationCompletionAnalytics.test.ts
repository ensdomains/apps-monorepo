import type { Hex } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { bindAnalyticsFlow, createAnalyticsFlow } from '@/lib/posthog/flow'
import type { MigrationResult } from '../service/migrationService'
import { captureMigrationCompletion } from './migrationCompletionAnalytics'

const result: MigrationResult = {
  completed: 1,
  migrated: 0,
  copied: 1,
  completedOperations: [{ name: 'copy.eth', action: 'copy' }],
  txHashes: ['0xabc' as Hex],
  ineligible: [],
}

describe('migration completion analytics', () => {
  it('counts confirmed partial work once across rebinds and allows a fresh run', () => {
    const capture = vi.fn()
    const analytics = createAnalyticsFlow('first-flow')
    vi.spyOn(analytics, 'capture').mockImplementation(capture)
    captureMigrationCompletion(analytics, result, [
      { name: 'migrated.eth', action: 'migrate' },
    ])
    const rebound = bindAnalyticsFlow(analytics)
    vi.spyOn(rebound, 'capture').mockImplementation(capture)
    captureMigrationCompletion(rebound, result, [
      { name: 'migrated.eth', action: 'migrate' },
    ])
    expect(capture).toHaveBeenCalledOnce()
    expect(capture).toHaveBeenCalledWith('migration:flow_complete', {
      flow_id: 'first-flow',
      item_count: 2,
      migrated_count: 1,
      copied_count: 1,
      ineligible_count: 0,
    })
    const fresh = createAnalyticsFlow('next-flow')
    vi.spyOn(fresh, 'capture').mockImplementation(capture)
    captureMigrationCompletion(fresh, result, [])
    expect(capture).toHaveBeenCalledTimes(2)
  })

  it('does not let conflicting-operation reporting replace the service result', () => {
    const existing = [{ name: 'copy.eth', action: 'migrate' }] as const
    const analytics = createAnalyticsFlow('conflict-flow')
    const capture = vi.spyOn(analytics, 'capture')
    expect(() =>
      captureMigrationCompletion(analytics, result, existing),
    ).not.toThrow()
    expect(capture).not.toHaveBeenCalled()
  })
})
