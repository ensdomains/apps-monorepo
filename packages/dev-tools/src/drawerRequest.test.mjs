import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getDevDrawerOpenRequest } from './drawerRequest.ts'

const capabilities = {
  isTimeTravelEnabled: true,
  isMigrationEnabled: true,
  isDesignQaEnabled: true,
}

test('explicit tool requests select the matching existing panel', () => {
  for (const [tool, tab] of [
    ['time-travel', 'time-travel'],
    ['migration', 'migration'],
    ['design-qa', 'dqa'],
  ]) {
    assert.deepEqual(getDevDrawerOpenRequest({ tool, capabilities }), {
      status: 'open',
      tab,
    })
  }
})

test('disabled tools stay unavailable even when a different tool enables the drawer', () => {
  assert.deepEqual(
    getDevDrawerOpenRequest({
      tool: 'time-travel',
      capabilities: { ...capabilities, isTimeTravelEnabled: false },
    }),
    { status: 'unavailable' },
  )
  assert.deepEqual(
    getDevDrawerOpenRequest({
      tool: 'migration',
      capabilities: { ...capabilities, isMigrationEnabled: false },
    }),
    { status: 'unavailable' },
  )
})

test('opening the drawer preserves an enabled active tab and falls back from stale preferences', () => {
  assert.deepEqual(
    getDevDrawerOpenRequest({ tool: 'drawer', activeTab: 'dqa', capabilities }),
    { status: 'open', tab: 'dqa' },
  )
  assert.deepEqual(
    getDevDrawerOpenRequest({
      tool: 'drawer',
      activeTab: 'time-travel',
      capabilities: { ...capabilities, isTimeTravelEnabled: false },
    }),
    { status: 'open', tab: 'migration' },
  )
})

test('ordinary mounts do not request an opening and fully gated drawers cannot be opened', () => {
  assert.deepEqual(getDevDrawerOpenRequest({ capabilities }), {
    status: 'none',
  })
  assert.deepEqual(
    getDevDrawerOpenRequest({
      tool: 'drawer',
      capabilities: {
        isTimeTravelEnabled: false,
        isMigrationEnabled: false,
        isDesignQaEnabled: false,
      },
    }),
    { status: 'unavailable' },
  )
})
