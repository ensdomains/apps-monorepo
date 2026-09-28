import { describe, expect, it } from 'vitest'
import { buildCandidateVerificationRequest } from '@/features/ai/candidateVerification'
import { extractEnsNames } from '@/features/ai/intent'
import { buildProfileValueContext } from '@/features/ai/profileValueContext'
import { CANDIDATE_VERIFICATION_CORPUS } from './candidateVerificationCorpus'

describe('independent candidate verification contrasts', () => {
  it('freezes24 unique labeled cases with equal correct and incorrect candidates', () => {
    expect(CANDIDATE_VERIFICATION_CORPUS).toHaveLength(24)
    expect(
      new Set(CANDIDATE_VERIFICATION_CORPUS.map(({ id }) => id)).size,
    ).toBe(24)
    expect(
      CANDIDATE_VERIFICATION_CORPUS.filter(
        ({ expected }) => expected === 'verified',
      ),
    ).toHaveLength(12)
    expect(
      CANDIDATE_VERIFICATION_CORPUS.filter(
        ({ expected }) => expected === 'rejected',
      ),
    ).toHaveLength(12)
    for (const row of CANDIDATE_VERIFICATION_CORPUS) {
      expect(row.id).toMatch(/^verify-contrast-[a-z-]+-(?:valid|wrong)$/)
      expect(row.query.length).toBeGreaterThanOrEqual(2)
      expect(row.query.length).toBeLessThanOrEqual(160)
      expect(row.candidate.status).toBe('ok')
      expect(row.expected).toBe(
        row.id.endsWith('-valid') ? 'verified' : 'rejected',
      )
    }
  })

  it('contains paired changes to targets, old/new roles, duration, filters and supported operations', () => {
    for (const row of CANDIDATE_VERIFICATION_CORPUS.filter(({ id }) =>
      id.endsWith('-valid'),
    )) {
      const wrong = CANDIDATE_VERIFICATION_CORPUS.find(
        ({ id }) => id === row.id.replace(/-valid$/, '-wrong'),
      )
      expect(wrong).toBeDefined()
      expect({ query: row.query, candidate: row.candidate }).not.toEqual({
        query: wrong?.query,
        candidate: wrong?.candidate,
      })
    }
    const multi = CANDIDATE_VERIFICATION_CORPUS.find(
      ({ id }) => id === 'verify-contrast-second-action-valid',
    )
    expect(multi?.candidate.multiAction).toEqual({ nextIntent: 'set_primary' })
  })

  it.each(
    CANDIDATE_VERIFICATION_CORPUS,
  )('projects $id without leaking exact names or values', ({
    query,
    candidate,
  }) => {
    const built = buildCandidateVerificationRequest(query, candidate)
    expect(built).not.toBeNull()
    if (!built) throw new Error('Expected a directly evaluable candidate')
    const payload = JSON.stringify(built)
    const context = buildProfileValueContext(query)
    for (const name of extractEnsNames(context.targetQuery))
      expect(payload).not.toContain(name)
    // Notification-channel requests intentionally keep their instruction words
    // visible and use structured email redaction instead of profile candidates.
    if (candidate.action.intent === 'edit_profile')
      for (const { value } of context.candidates)
        expect(payload).not.toContain(value)
    for (const email of query.match(/[^\s,;<>]+@[^\s,;<>]+/g) ?? [])
      expect(payload).not.toContain(email)
    const references =
      JSON.stringify(built.state.candidate).match(
        /\[(?:ENS_NAME(?:_\d+)?|PROFILE_VALUE_\d+|EMAIL|ADDRESS)\]/g,
      ) ?? []
    for (const reference of references)
      expect(built.state.request).toContain(reference)
  })
})
