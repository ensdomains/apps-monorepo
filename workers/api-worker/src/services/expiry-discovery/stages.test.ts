import { nameExpiryStageSchema } from '@ens-apps/shared-schema/notifications'
import { describe, expect, it } from 'vitest'
import { EXPIRY_STAGE_IDS, type ExpiryStageId } from '#types/events/index.js'
import {
  type ExpiryStageConfig,
  type ExpiryTrack,
  type ExpiryTrackId,
  getCloserStage,
  getDefaultCursorForStage,
  getExpiryStageRank,
  getLowerBoundForStage,
  getQueryCursorForStage,
  getStageOffsetSeconds,
  getUpperBoundForStage,
  isNotifiableAtStage,
  MAX_STAGE_CATCH_UP_SECONDS,
  REGISTRATION_STAGES,
  SUBNAME_STAGES,
  TRACKS,
} from './stages.js'

const DAY = 86_400
const STAGES = REGISTRATION_STAGES
const getStage = (id: ExpiryStageId): ExpiryStageConfig => {
  const stage = [...REGISTRATION_STAGES, ...SUBNAME_STAGES].find(
    (candidate) => candidate.id === id,
  )
  if (!stage) throw new Error(`Missing stage fixture: ${id}`)
  return stage
}
const getTrack = (id: ExpiryTrackId): ExpiryTrack => {
  const track = TRACKS.find((candidate) => candidate.id === id)
  if (!track) throw new Error(`Missing track fixture: ${id}`)
  return track
}
const V2 = getTrack('ens_v2')
const V1_LEASE = getTrack('ens_v1_lease')
const V1_RESERVED = getTrack('ens_v1_reserved')
const SUBNAME = getTrack('subname')

describe('expiry stages', () => {
  it('defines and orders the complete registration lifecycle', () => {
    expect(STAGES.map((stage) => stage.id)).toEqual([
      'expiry-30d',
      'expiry-7d',
      'expiry-1d',
      'grace-start',
      'grace-7d',
      'grace-1d',
      'premium-start',
    ])
    expect(getStage('expiry-30d').includeFavorites).toBe(false)
    expect(STAGES.slice(1).every((stage) => stage.includeFavorites)).toBe(true)
  })

  it('places ENSv2 stages on the expiry and its 28-day grace', () => {
    expect(STAGES.map((stage) => getStageOffsetSeconds(stage, V2))).toEqual([
      30 * DAY,
      7 * DAY,
      DAY,
      0,
      -21 * DAY,
      -27 * DAY,
      -28 * DAY,
    ])
  })

  it.each([
    V1_LEASE,
    V1_RESERVED,
  ])('places $id stages on the lease and its 90-day grace', (track) => {
    expect(STAGES.map((stage) => getStageOffsetSeconds(stage, track))).toEqual([
      30 * DAY,
      7 * DAY,
      DAY,
      0,
      -83 * DAY,
      -89 * DAY,
      // The lease is released only after its grace's last second.
      -90 * DAY - 1,
    ])
  })

  it('gives each .eth track the registration lifecycle and subnames their own', () => {
    expect(
      Object.fromEntries(
        TRACKS.map((track) => [
          track.id,
          track.stages.map((stage) => stage.id),
        ]),
      ),
    ).toEqual({
      ens_v2: STAGES.map((stage) => stage.id),
      ens_v1_lease: STAGES.map((stage) => stage.id),
      ens_v1_reserved: STAGES.map((stage) => stage.id),
      subname: ['expiry-30d', 'expiry-7d', 'expiry-1d', 'expired'],
    })
  })

  it('sweeps every subname on its served expiry, with no grace', () => {
    expect(SUBNAME).toMatchObject({
      names: 'subnames',
      expirySource: 'served',
      servedShiftSeconds: 0,
      graceSeconds: 0,
    })
    expect(SUBNAME.authority).toBeUndefined()
    expect(
      SUBNAME.stages.map((stage) => getStageOffsetSeconds(stage, SUBNAME)),
    ).toEqual([30 * DAY, 7 * DAY, DAY, 0])
    expect(getStage('expired').includeFavorites).toBe(true)
  })

  it('sweeps ENSv1 by authority, shifting reserved leases by 62 days', () => {
    expect(V2.authority).toEqual(['ens_v2'])
    expect(V1_LEASE.authority).toEqual(['ens_v1', 'ens_v0'])
    expect(V1_RESERVED.authority).toEqual(['ens_v1', 'ens_v0'])
    expect(V1_LEASE.servedShiftSeconds).toBe(0)
    expect(V1_RESERVED.servedShiftSeconds).toBe(62 * DAY)
  })

  it('keeps the lifecycle order on every track', () => {
    for (const track of TRACKS) {
      const offsets = track.stages.map((stage) =>
        getStageOffsetSeconds(stage, track),
      )
      expect(offsets).toEqual([...offsets].sort((a, b) => b - a))
    }
  })

  it('uses exclusive stage windows and a bounded final catch-up', () => {
    const now = 1_700_000_000
    const lower = (id: ExpiryStageId, track: ExpiryTrack) =>
      getLowerBoundForStage(getStage(id), track, now)

    expect(lower('expiry-30d', V2)).toBe(now + 7 * DAY)
    expect(lower('expiry-7d', V2)).toBe(now + DAY)
    expect(lower('expiry-1d', V2)).toBe(now)
    expect(lower('grace-start', V2)).toBe(now - 21 * DAY)
    expect(lower('grace-7d', V2)).toBe(now - 27 * DAY)
    expect(lower('grace-1d', V2)).toBe(now - 28 * DAY)
    expect(lower('premium-start', V2)).toBe(
      getUpperBoundForStage(getStage('premium-start'), V2, now) -
        MAX_STAGE_CATCH_UP_SECONDS,
    )

    expect(lower('expiry-1d', V1_LEASE)).toBe(now)
    expect(lower('grace-start', V1_LEASE)).toBe(now - 83 * DAY)
    expect(lower('grace-1d', V1_LEASE)).toBe(now - 90 * DAY - 1)

    // The subname track's windows close at its own expiry stage, not at grace.
    expect(lower('expiry-1d', SUBNAME)).toBe(now)
    expect(lower('expired', SUBNAME)).toBe(now - MAX_STAGE_CATCH_UP_SECONDS)
  })

  it('finds closer stages by offset instead of array position', () => {
    const disordered: ExpiryStageConfig[] = [
      getStage('premium-start'),
      getStage('expiry-30d'),
      getStage('grace-start'),
      getStage('expiry-7d'),
    ]
    const track = { ...V2, stages: disordered }
    expect(getCloserStage(getStage('expiry-30d'), track)?.id).toBe('expiry-7d')
    expect(getCloserStage(getStage('grace-start'), track)?.id).toBe(
      'premium-start',
    )
  })

  it('clamps stale cursors without moving in-window cursors', () => {
    const now = 1_700_000_000
    const stage = getStage('expiry-30d')
    expect(getQueryCursorForStage(stage, V2, now - 200 * DAY, now)).toBe(
      now + 7 * DAY,
    )
    expect(getQueryCursorForStage(stage, V2, now + 10 * DAY, now)).toBe(
      now + 10 * DAY,
    )
  })

  it('defaults post-expiry stages at their current boundaries', () => {
    const now = 1_700_000_000
    const defaultCursor = (id: ExpiryStageId, track: ExpiryTrack) =>
      getDefaultCursorForStage(getStage(id), track, now)

    expect(defaultCursor('expiry-30d', V2)).toBe(now)
    expect(defaultCursor('grace-start', V2)).toBe(now)
    expect(defaultCursor('grace-7d', V2)).toBe(now - 21 * DAY)
    expect(defaultCursor('premium-start', V2)).toBe(now - 28 * DAY)
    expect(defaultCursor('grace-7d', V1_RESERVED)).toBe(now - 83 * DAY)
  })

  it('ranks stages from future to past', () => {
    expect(getExpiryStageRank('expiry-30d')).toBeLessThan(
      getExpiryStageRank('grace-start'),
    )
    expect(getExpiryStageRank('grace-start')).toBeLessThan(
      getExpiryStageRank('premium-start'),
    )
    expect(getExpiryStageRank('expiry-1d')).toBeLessThan(
      getExpiryStageRank('expired'),
    )
  })

  it('ranks every stage the schema accepts', () => {
    expect([...EXPIRY_STAGE_IDS].sort()).toEqual(
      [...nameExpiryStageSchema.options].sort(),
    )
  })

  describe('isNotifiableAtStage', () => {
    const held = (['active', 'wrapped', 'registered'] as const).map(
      (registrationStatus) => ({ registrationStatus }),
    )
    const expiredRelease = {
      registrationStatus: 'released',
      releaseKind: 'expired',
    } as const
    const neverNotified = [
      { registrationStatus: 'released', releaseKind: 'unregistered' },
      { registrationStatus: 'released' },
      { registrationStatus: 'unregistered' },
    ] as const

    it.each([
      'expiry-30d',
      'expiry-7d',
      'expiry-1d',
    ] as const)('keeps only held names before expiry (%s)', (id) => {
      for (const candidate of held) {
        expect(isNotifiableAtStage(getStage(id), candidate)).toBe(true)
      }
      for (const candidate of [expiredRelease, ...neverNotified]) {
        expect(isNotifiableAtStage(getStage(id), candidate)).toBe(false)
      }
    })

    it.each([
      'grace-start',
      'grace-7d',
      'grace-1d',
    ] as const)('keeps held ENSv1 leases and expired ENSv2 releases in grace (%s)', (id) => {
      for (const candidate of [...held, expiredRelease]) {
        expect(isNotifiableAtStage(getStage(id), candidate)).toBe(true)
      }
      for (const candidate of neverNotified) {
        expect(isNotifiableAtStage(getStage(id), candidate)).toBe(false)
      }
    })

    it('keeps held and expired-release subnames at their expiry', () => {
      const stage = getStage('expired')
      for (const candidate of [...held, expiredRelease]) {
        expect(isNotifiableAtStage(stage, candidate)).toBe(true)
      }
      for (const candidate of neverNotified) {
        expect(isNotifiableAtStage(stage, candidate)).toBe(false)
      }
    })

    it('keeps only expired releases once grace has ended', () => {
      const stage = getStage('premium-start')
      expect(isNotifiableAtStage(stage, expiredRelease)).toBe(true)
      for (const candidate of [...held, ...neverNotified]) {
        expect(isNotifiableAtStage(stage, candidate)).toBe(false)
      }
    })
  })
})
