import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildJevAiRequest } from '@/features/ai/intent'
import { FOCUSED_AI_EVAL_CORPUS, FOCUSED_AI_EVAL_GROUPS } from './focusedCorpus'
import { buildFocusedAiRequest } from './focusedInterpreter'

const manifest = JSON.parse(
  readFileSync(new URL('./focusedCorpus.freeze.json', import.meta.url), 'utf8'),
)

type Row = (typeof FOCUSED_AI_EVAL_CORPUS)[number]
type PrivateSpan = { value: string; kind: string }

const literalPrivateSpans = (query: string): PrivateSpan[] => [
  ...(query.match(/\b[a-z\d-]+\.eth\b/gi) ?? []).map((value) => ({
    value,
    kind: 'ENS name',
  })),
  ...(query.match(/https?:\/\/[^\s"']+/g) ?? []).map((value) => ({
    value,
    kind: 'URL',
  })),
  ...(query.match(/[a-z\d._+-]+@[a-z\d.-]+\.[a-z]{2,}/gi) ?? []).map(
    (value) => ({ value, kind: 'email' }),
  ),
  ...[...query.matchAll(/"([^"]+)"/g)].map((match) => ({
    value: match[1] ?? '',
    kind: 'quoted value',
  })),
]

const proposalPrivateSpans = (row: Row): PrivateSpan[] => {
  if (
    row.expected.status !== 'ready' ||
    row.expected.action.intent !== 'edit_profile'
  )
    return []
  const proposal = row.expected.action.proposal as
    | Record<string, unknown>
    | undefined
  return ['value', 'expectedValue', 'linkName', 'linkTarget'].flatMap((key) => {
    const value = proposal?.[key]
    return typeof value === 'string' &&
      value.length > 0 &&
      row.query.includes(value)
      ? [{ value, kind: `profile ${key}` }]
      : []
  })
}

const privacyFailures = (row: Row) => {
  const privateSpans = [
    ...literalPrivateSpans(row.query),
    ...proposalPrivateSpans(row),
  ]
  return [
    ['original', buildJevAiRequest(row.query)],
    ['focused', buildFocusedAiRequest(row.query)],
  ].flatMap(([builder, request]) => {
    const body = JSON.stringify(request).toLowerCase()
    return privateSpans
      .filter(({ value }) => body.includes(value.toLowerCase()))
      .map(({ kind }) => ({ split: row.split, id: row.id, builder, kind }))
  })
}

describe('independent focused-interpreter evaluation corpus', () => {
  it('keeps exact targets and supplied private values out of both outgoing request bodies', () => {
    // Only IDs and data kinds enter a failure; reserved prompts/values stay private.
    expect(FOCUSED_AI_EVAL_CORPUS.flatMap(privacyFailures)).toEqual([])
  })

  it('freezes exact prompts, labels, input context, order and split before model calls', () => {
    expect(FOCUSED_AI_EVAL_CORPUS).toHaveLength(60)
    expect(new Set(FOCUSED_AI_EVAL_CORPUS.map(({ id }) => id)).size).toBe(60)
    expect(
      new Set(FOCUSED_AI_EVAL_CORPUS.map(({ query }) => query.toLowerCase()))
        .size,
    ).toBe(60)
    expect(
      createHash('sha256')
        .update(JSON.stringify(FOCUSED_AI_EVAL_CORPUS))
        .digest('hex'),
    ).toBe(manifest.corpusSha256)
    expect(manifest.labelsAuthoredBeforeProviderCalls).toBe(true)
    expect(manifest.interpreterInspectedByAuthor).toBe(false)
    expect(manifest.outcomeBasedLabelChangesAllowed).toBe(false)
  })

  it('holds out whole construction and scenario groups with a fixed 40/20 split', () => {
    expect(FOCUSED_AI_EVAL_GROUPS).toHaveLength(12)
    expect(
      FOCUSED_AI_EVAL_GROUPS.filter(({ split }) => split === 'development'),
    ).toHaveLength(8)
    expect(
      FOCUSED_AI_EVAL_GROUPS.filter(({ split }) => split === 'heldout'),
    ).toHaveLength(4)
    for (const group of FOCUSED_AI_EVAL_GROUPS) {
      const rows = FOCUSED_AI_EVAL_CORPUS.filter(
        ({ constructionGroup }) => constructionGroup === group.id,
      )
      expect(rows).toHaveLength(5)
      expect(new Set(rows.map(({ split }) => split))).toEqual(
        new Set([group.split]),
      )
    }
    expect(
      FOCUSED_AI_EVAL_CORPUS.filter(({ split }) => split === 'development'),
    ).toHaveLength(40)
    expect(
      FOCUSED_AI_EVAL_CORPUS.filter(({ split }) => split === 'heldout'),
    ).toHaveLength(20)
    expect(FOCUSED_AI_EVAL_CORPUS.filter(({ smoke }) => smoke)).toHaveLength(8)
    expect(
      FOCUSED_AI_EVAL_CORPUS.filter(({ smoke }) => smoke).every(
        ({ split }) => split === 'development',
      ),
    ).toBe(true)
  })

  it('covers broad existing families, clarification, typos and required rejection', () => {
    expect(new Set(FOCUSED_AI_EVAL_CORPUS.map(({ family }) => family))).toEqual(
      new Set([
        'set_primary',
        'register',
        'renew',
        'favorite',
        'view_name',
        'edit_profile',
        'find_names',
        'bulk_renew',
        'migrate',
        'notification',
        'manager_action',
        'safety',
      ]),
    )
    expect(
      FOCUSED_AI_EVAL_CORPUS.filter(({ category }) => category === 'supported'),
    ).toHaveLength(39)
    expect(
      FOCUSED_AI_EVAL_CORPUS.filter(
        ({ category }) => category === 'clarification',
      ),
    ).toHaveLength(7)
    expect(
      FOCUSED_AI_EVAL_CORPUS.filter(
        ({ category }) => category === 'unsupported',
      ),
    ).toHaveLength(14)
    expect(
      FOCUSED_AI_EVAL_CORPUS.filter(({ language }) => language === 'typo'),
    ).toHaveLength(5)
    for (const row of FOCUSED_AI_EVAL_CORPUS) {
      expect(row.query.length).toBeGreaterThan(10)
      expect(row.query.length).toBeLessThanOrEqual(160)
      expect(row.expected.status).toBe(
        row.category === 'supported'
          ? 'ready'
          : row.category === 'clarification'
            ? 'needs_input'
            : 'unsupported',
      )
    }
  })
})
