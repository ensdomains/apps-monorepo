import { expect, test } from '@playwright/test'
import { allProbesDenied, eachActor } from '../actor-scheduling.js'

test('allowed parent routes and unknown authority never qualify as read-only', () => {
  const denied = {
    records: { result: 'DENIED' },
    setResolver: { result: 'DENIED' },
    transfer: { result: 'DENIED' },
  }
  expect(allProbesDenied(denied)).toBe(true)
  expect(allProbesDenied(undefined)).toBe(false)
  expect(allProbesDenied({ transfer: { result: 'DENIED' } })).toBe(false)
  expect(
    allProbesDenied({ ...denied, transferAsParent: { result: 'ALLOWED' } }),
  ).toBe(false)
  expect(
    allProbesDenied({ ...denied, grantResolverRole: { result: 'BLOCKED' } }),
  ).toBe(false)
  expect(allProbesDenied({ ...denied, records: { result: 'ALLOWED' } })).toBe(
    false,
  )
})

test('readers overlap within the limit; writers execute alone after all readers', async () => {
  let active = 0,
    maximum = 0
  const finished: string[] = []
  await eachActor(
    ['write-1', 'read-1', 'read-2', 'write-2', 'read-3'],
    (actor) => actor.startsWith('write'),
    async (actor) => {
      if (actor.startsWith('write')) {
        expect(active).toBe(0)
        expect(finished.filter((x) => x.startsWith('read'))).toHaveLength(3)
      }
      active++
      maximum = Math.max(maximum, active)
      await new Promise<void>((resolve) => setImmediate(resolve))
      finished.push(actor)
      active--
    },
    2,
  )
  expect(maximum).toBe(2)
  expect(finished.slice(-2)).toEqual(['write-1', 'write-2'])
  expect(active).toBe(0)
})

test('a failed reader settles its peers and prevents every write', async () => {
  let peerFinished = false,
    wrote = false
  await expect(
    eachActor(
      ['read-fails', 'read-peer', 'write'],
      (actor) => actor === 'write',
      async (actor) => {
        if (actor === 'read-fails') throw new Error('Reader checkpoint failed')
        if (actor === 'write') wrote = true
        else {
          await new Promise<void>((resolve) => setImmediate(resolve))
          peerFinished = true
        }
      },
      2,
    ),
  ).rejects.toThrow('Reader checkpoint failed')
  expect(peerFinished).toBe(true)
  expect(wrote).toBe(false)
})
