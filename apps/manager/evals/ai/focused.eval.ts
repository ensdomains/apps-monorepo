import { join } from 'node:path'
import { expect, it } from 'vitest'
import { FOCUSED_AI_EVAL_CORPUS } from './focusedCorpus'
import { runFocusedEval } from './focusedRunner'
import { loadLocalKey } from './runner'

it.runIf(process.env.AI_EVAL_FOCUSED_LIVE === '1')(
  'compares original and focused support evidence from one synthetic model capture',
  async () => {
    const split = process.env.AI_EVAL_SPLIT ?? 'development'
    if (!['development', 'heldout'].includes(split))
      throw new Error('Choose development or heldout explicitly')
    const key = await loadLocalKey(
      process.env,
      join(process.cwd(), '.dev.vars'),
    )
    if (!key)
      throw new Error(
        'A local TypeSafe key is required for this opt-in evaluation',
      )
    const cases = FOCUSED_AI_EVAL_CORPUS.filter(
      (testCase) => testCase.split === split,
    )
    const { report, jsonPath } = await runFocusedEval({
      cases,
      key,
      sourceRoot: process.env.AI_EVAL_SOURCE_ROOT ?? join(process.cwd(), 'src'),
      outputDirectory: join(process.cwd(), 'evals/ai/reports'),
      label: process.env.AI_EVAL_LABEL ?? `focused-${split}`,
      // A privacy audit exposed this one scenario before provider evaluation.
      // Its original expectation stays fixed; the other 19 remain separate.
      privacyExposedIds: ['focused-contrasted-resource-role-1'],
      onResult: (pair, complete, total) =>
        console.info(
          `[${complete}/${total}] ${pair.id}: baseline=${pair.baseline.stage}, candidate=${pair.candidate.stage}`,
        ),
    })
    console.info(JSON.stringify({ summary: report.summary, jsonPath }))
    expect(report.sourceChangedDuringRun).toBe(false)
    expect(report.summary.providerFailures).toBe(0)
    expect(report.summary.harnessFailures).toBe(0)
    expect(report.summary.baseline.notRun).toBe(0)
    expect(report.summary.candidate.notRun).toBe(0)
    expect(report.summary.candidate.incorrectProposals).toBe(0)
    expect(report.summary.baseline.incorrectProposals).toBe(0)
    expect(report.summary.candidate.incorrectClarificationProposals).toBe(0)
    expect(report.summary.baseline.incorrectClarificationProposals).toBe(0)
    if (process.env.AI_EVAL_ENFORCE === '1') {
      expect(
        report.summary.candidate.canonicalAndParaphrase.accuracy,
      ).toBeGreaterThanOrEqual(0.95)
      expect(report.summary.candidate.typo.accuracy).toBeGreaterThanOrEqual(0.9)
      expect(report.summary.candidate.clarification.accuracy).toBe(1)
      expect(report.summary.candidate.unsupported.accuracy).toBe(1)
    }
  },
  15 * 60 * 1000,
)
