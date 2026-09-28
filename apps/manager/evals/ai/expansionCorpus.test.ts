import { describe, expect, it } from 'vitest'
import { managerActionCatalog } from '@/features/ai/managerActions'
import { PROFILE_FIELD_DEFINITIONS } from '@/features/profile/service/profileFieldRegistry'
import { EXPANSION_AI_EVAL_CORPUS } from './expansionCorpus'
import { selectEvalCases } from './runner'

describe('separate Manager action expansion evaluation', () => {
  it('adds 160 independent cases without altering either previous corpus', () => {
    expect(EXPANSION_AI_EVAL_CORPUS).toHaveLength(160)
    expect(new Set(EXPANSION_AI_EVAL_CORPUS.map(({ id }) => id)).size).toBe(160)
    expect(
      new Set(EXPANSION_AI_EVAL_CORPUS.map(({ query }) => query)).size,
    ).toBe(160)
    expect(selectEvalCases({})).toHaveLength(140)
    expect(selectEvalCases({ corpus: 'fresh' })).toHaveLength(250)
    expect(
      selectEvalCases({ corpus: 'expansion', split: 'heldout' }),
    ).toHaveLength(32)
    expect(
      selectEvalCases({ corpus: 'expansion', split: 'development' }),
    ).toHaveLength(128)
  })

  it('covers every original native manager operation with three language variants', () => {
    const cases = EXPANSION_AI_EVAL_CORPUS.filter(
      ({ expected }) =>
        expected.status === 'ready' &&
        expected.action.intent === 'manager_action',
    )
    expect(cases).toHaveLength(72)
    // The original 160 labels remain fixed as new native actions are added.
    // Later native kinds have separate corpora; preserve this original set.
    for (const kind of Object.keys(managerActionCatalog).filter(
      (kind) =>
        kind !== 'copy_profile_address' &&
        kind !== 'open_notification_settings' &&
        kind !== 'copy_profile_owner' &&
        kind !== 'view_profile_owner' &&
        kind !== 'view_primary_profile',
    ))
      expect(
        cases.filter(
          ({ expected }) =>
            expected.status === 'ready' && expected.action.kind === kind,
        ),
      ).toHaveLength(3)
    expect(cases.filter(({ language }) => language === 'typo')).toHaveLength(24)
  })

  it('covers the actual profile field catalog and all new operation types', () => {
    const proposals = EXPANSION_AI_EVAL_CORPUS.flatMap(({ expected }) => {
      if (
        expected.status !== 'ready' ||
        expected.action.intent !== 'edit_profile'
      )
        return []
      return [expected.action.proposal as Record<string, unknown>]
    })
    expect(proposals).toHaveLength(48)
    const fields = new Set(proposals.map(({ field }) => field))
    for (const { field } of PROFILE_FIELD_DEFINITIONS)
      expect(fields.has(field)).toBe(true)
    for (const field of ['address', 'eth_address', 'link'])
      expect(fields.has(field)).toBe(true)
    expect(
      new Set(proposals.map(({ operation }) => operation ?? 'set')),
    ).toEqual(
      new Set(['set', 'remove', 'feature', 'unfeature', 'use_eth', 'rename']),
    )
    expect(
      proposals.some(({ expectedValue }) => expectedValue !== undefined),
    ).toBe(true)
  })

  it('keeps missing exact targets and dropped constraints visible', () => {
    expect(
      EXPANSION_AI_EVAL_CORPUS.filter(
        ({ category }) => category === 'clarification',
      ),
    ).toHaveLength(20)
    expect(
      EXPANSION_AI_EVAL_CORPUS.filter(
        ({ category }) => category === 'unsupported',
      ),
    ).toHaveLength(20)
    expect(
      selectEvalCases({
        corpus: 'expansion',
        ids: ['expansion-unsupported-12'],
      })[0]?.expected,
    ).toEqual({ status: 'unsupported' })
    expect(
      selectEvalCases({
        corpus: 'expansion',
        ids: ['expansion-clarification-10'],
      })[0]?.expected,
    ).toEqual({ status: 'needs_input', field: 'profileValue' })
  })
})
