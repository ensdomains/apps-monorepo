import { join } from 'node:path'
import { expect, it } from 'vitest'
import { loadLocalKey, runLiveEval, selectEvalCases } from './runner'

it.runIf(process.env.AI_EVAL_LIVE === '1')(
  'evaluates synthetic requests against live Jev without executing actions',
  async () => {
    const key = await loadLocalKey(
      process.env,
      join(process.cwd(), '.dev.vars'),
    )
    if (!key)
      throw new Error(
        'Set TYPESAFE_API_KEY locally or in ignored .dev.vars before running live evals.',
      )
    const cases = selectEvalCases({
      corpus: process.env.AI_EVAL_CORPUS,
      smoke: process.env.AI_EVAL_SMOKE === '1',
      split: process.env.AI_EVAL_SPLIT,
      ids: process.env.AI_EVAL_IDS?.split(','),
    })
    expect(cases.length).toBeGreaterThan(0)
    const { report, jsonPath, markdownPath } = await runLiveEval({
      cases,
      key,
      sourceRoot: process.env.AI_EVAL_SOURCE_ROOT ?? join(process.cwd(), 'src'),
      outputDirectory: join(process.cwd(), 'evals/ai/reports'),
      label: process.env.AI_EVAL_LABEL ?? 'current',
      candidateVerification: process.env.AI_EVAL_CANDIDATE_VERIFICATION === '1',
      onResult: (result, completed, total) =>
        console.info(`[${completed}/${total}] ${result.id}: ${result.stage}`),
    })
    console.info(JSON.stringify(report.summary, null, 2))
    console.info(`Reports: ${jsonPath}\n${markdownPath}`)
    expect(
      report.sourceChangedDuringRun,
      'Production source changed during the evaluation; freeze it and rerun.',
    ).toBe(false)
    expect(
      report.summary.providerErrors,
      `TypeSafe access or availability failed. See ${jsonPath}; remaining cases may be marked not_run.`,
    ).toBe(0)
    expect(
      report.summary.notRun,
      'Provider denial aborted the evaluation',
    ).toBe(0)
    if (process.env.AI_EVAL_ENFORCE === '1') {
      expect(report.summary.unsafeProposals).toBe(0)
      expect(
        report.summary.incorrectConfirmationProposals,
        'A confirmation must not conceal a wrong candidate action',
      ).toBe(0)
      expect(
        report.summary.incorrectProposals,
        'A wrong target or value must not be hidden by aggregate accuracy',
      ).toBe(0)
      expect(
        report.summary.incorrectClarificationProposals,
        'A clarification must preserve the whole supplied remainder',
      ).toBe(0)
      expect(
        report.summary.canonicalAndParaphrase.accuracy,
      ).toBeGreaterThanOrEqual(0.95)
      expect(report.summary.typo.accuracy).toBeGreaterThanOrEqual(0.9)
      expect(report.summary.clarification.accuracy).toBe(1)
      expect(report.summary.unsupported.accuracy).toBe(1)
    }
  },
  30 * 60 * 1000,
)
