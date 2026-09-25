import { describe, expect, it } from 'vitest'
import {
  buildJevNameSearchRequest,
  looksLikeJevNameSearchRequest,
  parseExplicitDayCount,
  parseJevNameSearchResponse,
} from './jevNameSearch'

const choice = (value: string, confidence = 0.95) => ({
  type: 'choice',
  choice: value,
  confidence,
})

const response = (overrides: Record<string, unknown> = {}) => ({
  answers: {
    fully_supported: { type: 'noul', noul: 0.95 },
    unsupported_requirement: { type: 'noul', noul: 0.05 },
    expiry: choice('expiring'),
    role: choice('any'),
    version: choice('any'),
    upgrade: choice('any'),
    favorite: choice('any'),
    primary: choice('any'),
    sort: choice('any'),
    ...overrides,
  },
})

describe('Jev name search interpretation', () => {
  it('sends only the supplied query as state', () => {
    const request = buildJevNameSearchRequest('names expiring soon')
    expect(request.model).toBe('jev-latest')
    expect(request.state).toBe('names expiring soon')
    expect(Object.keys(request.questions)).toContain('fully_supported')
    expect(Object.keys(request.questions)).toContain('unsupported_requirement')
  })

  it('matches the production UI routing policy', () => {
    expect(looksLikeJevNameSearchRequest('favorites')).toBe(true)
    expect(looksLikeJevNameSearchRequest('v1')).toBe(true)
    expect(looksLikeJevNameSearchRequest('active')).toBe(false)
    expect(looksLikeJevNameSearchRequest('reverse')).toBe(false)
    expect(looksLikeJevNameSearchRequest('active names')).toBe(true)
  })

  it('parses arbitrary positive day counts', () => {
    expect(parseExplicitDayCount('expiring within 45 days')).toBe(45)
    expect(parseExplicitDayCount('expiring in the next 123 days')).toBe(123)
    expect(parseExplicitDayCount('expiring soon')).toBeNull()
    expect(parseExplicitDayCount('expired 45 days ago')).toBe('invalid')
    expect(parseExplicitDayCount('within 0 days')).toBe('invalid')
  })

  it('accepts supported combined filters and a day count', () => {
    expect(
      parseJevNameSearchResponse(
        response({
          role: choice('manager'),
          version: choice('v1'),
          upgrade: choice('eligible'),
          favorite: choice('yes'),
          sort: choice('expiry-asc'),
        }),
        'my favorite v1 manager names eligible for upgrade expiring within 45 days sorted by expiry',
      ),
    ).toEqual({
      expiry: 'expiring',
      withinDays: 45,
      role: 'manager',
      version: 'v1',
      upgrade: 'eligible',
      favorite: 'yes',
      sort: 'expiry-asc',
    })
  })

  it('rejects uncertain and partially unsupported interpretations', () => {
    expect(
      parseJevNameSearchResponse(
        response({ fully_supported: { type: 'noul', noul: 0.25 } }),
        'names about surfing expiring soon',
      ),
    ).toBeNull()
    expect(
      parseJevNameSearchResponse(
        response({ expiry: choice('expiring', 0.3) }),
        'names approaching expiry',
      ),
    ).toBeNull()
    expect(
      parseJevNameSearchResponse(
        response({ expiry: choice('any') }),
        'alice.eth',
      ),
    ).toBeNull()
    expect(
      parseJevNameSearchResponse(
        response({ version: choice('v2'), upgrade: choice('eligible') }),
        'v2 names eligible for upgrade',
      ),
    ).toBeNull()
    expect(
      parseJevNameSearchResponse(
        response({
          unsupported_requirement: { type: 'noul', noul: 0.95 },
        }),
        'names about surfing expiring soon',
      ),
    ).toBeNull()
  })

  it('accepts direct supported wording when global support is less certain', () => {
    expect(
      parseJevNameSearchResponse(
        response({
          expiry: choice('any'),
          role: choice('manager', 0.58),
        }),
        'names I manage',
      ),
    ).toEqual({ role: 'manager' })
    expect(
      parseJevNameSearchResponse(
        response({
          expiry: choice('any'),
          primary: choice('any'),
        }),
        'primary name',
      ),
    ).toEqual({ primary: 'yes' })
    expect(
      parseJevNameSearchResponse(
        response({
          fully_supported: { type: 'noul', noul: 0.43 },
          expiry: choice('any'),
          favorite: choice('any'),
        }),
        'favorites',
      ),
    ).toEqual({ favorite: 'yes' })
    expect(
      parseJevNameSearchResponse(
        response({ expiry: choice('any'), sort: choice('expiry-asc') }),
        'sort by expiry',
      ),
    ).toEqual({ sort: 'expiry-asc' })
    expect(
      parseJevNameSearchResponse(
        response({
          unsupported_requirement: { type: 'noul', noul: 0.77 },
          expiry: choice('expiring'),
        }),
        'names expiring within 45 days',
      ),
    ).toEqual({ expiry: 'expiring', withinDays: 45 })
    expect(
      parseJevNameSearchResponse(
        response({
          expiry: choice('any'),
          favorite: choice('no'),
          primary: choice('no', 0.6),
        }),
        'not favorites',
      ),
    ).toEqual({ favorite: 'no' })
    expect(
      parseJevNameSearchResponse(
        response({ expiry: choice('any'), upgrade: choice('any') }),
        'which names can I upgrade?',
      ),
    ).toEqual({ upgrade: 'eligible' })
    expect(
      parseJevNameSearchResponse(
        response({ expiry: choice('any'), upgrade: choice('any') }),
        "names I can't upgrade",
      ),
    ).toEqual({ upgrade: 'ineligible' })
    expect(
      parseJevNameSearchResponse(
        response({ expiry: choice('any'), favorite: choice('any') }),
        'non-favorites',
      ),
    ).toEqual({ favorite: 'no' })
    expect(
      parseJevNameSearchResponse(
        response({ expiry: choice('any'), primary: choice('any') }),
        'non-primary names',
      ),
    ).toEqual({ primary: 'no' })
    expect(
      parseJevNameSearchResponse(
        response({ expiry: choice('any') }),
        'names about to expire',
      ),
    ).toEqual({ expiry: 'expiring' })
    expect(
      parseJevNameSearchResponse(
        response({ expiry: choice('in-grace') }),
        'names whose grace period has ended',
      ),
    ).toEqual({ expiry: 'past-grace' })
  })

  it('rejects a supported filter mixed with an unsupported request', () => {
    expect(
      parseJevNameSearchResponse(
        response({
          unsupported_requirement: { type: 'noul', noul: 0.1 },
        }),
        'names about surfing expiring soon',
      ),
    ).toBeNull()
  })
})
