import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import type { AiEvalCase } from './corpus'
import {
  buildEvalRequest,
  type EvalResult,
  evaluateInterpretation,
  evaluateResponse,
  providerFailure,
  summarizeEval,
  unattemptedCase,
} from './evaluate'
import { buildFocusedAiRequest, interpretFocusedAi } from './focusedInterpreter'
import { hashEvalSource } from './runner'

type Interpreter = typeof interpretFocusedAi
type Output = Awaited<ReturnType<Interpreter>>
type RequestMetadata = {
  readonly requestHash: string
  readonly originalRequestHash: string
  readonly stateHash: string
  readonly originalQuestionCount: number
  readonly candidateQuestionCount: number
  readonly originalRequestBytes: number
  readonly candidateRequestBytes: number
  readonly originalQuestionsUnchanged: true
  readonly stateMatchesBaseline: true
  readonly questionHashes: Readonly<Record<string, string>>
}
type FocusedCall = RequestMetadata & {
  readonly phase: 'fanout'
  readonly latencyMs: number
  readonly response?: unknown
  readonly error?: string
}
export type FocusedPair = {
  readonly id: string
  readonly baseline: EvalResult
  readonly candidate: EvalResult
  readonly calls: readonly FocusedCall[]
  readonly stages: Output['stages']
  readonly provenance: Output['provenance']
  readonly parseTimings?: Output['timings']
  readonly baselineEvaluationMs?: number
  readonly totalDurationMs: number
  readonly harnessError?: 'candidate_interpreter_error'
}

const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')
const elapsed = (start: number) => Math.round(performance.now() - start)
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// Independently verify the private state and every original question before fetch.
export const inspectFocusedRequest = (
  request: unknown,
  original: unknown,
): RequestMetadata => {
  if (
    !record(request) ||
    !record(original) ||
    request.state !== original.state ||
    request.model !== original.model ||
    Object.keys(request).some(
      (key) => !['model', 'state', 'questions'].includes(key),
    ) ||
    !record(request.questions) ||
    !record(original.questions)
  )
    throw new Error('focused_request_privacy_contract_failed')
  const originalQuestions = original.questions
  const candidateQuestions = request.questions
  if (
    Object.entries(originalQuestions).some(
      ([key, question]) =>
        !isDeepStrictEqual(candidateQuestions[key], question),
    )
  )
    throw new Error('focused_original_question_changed')
  const staticQuestions: Readonly<Record<string, unknown>> =
    buildFocusedAiRequest('').questions
  if (
    Object.entries(candidateQuestions).some(
      ([key, question]) =>
        !(key in originalQuestions) &&
        (!key.startsWith('focused_') ||
          !isDeepStrictEqual(question, staticQuestions[key])),
    )
  )
    throw new Error('focused_additional_question_contract_failed')
  return {
    requestHash: hash(request),
    originalRequestHash: hash(original),
    stateHash: hash(request.state),
    originalQuestionCount: Object.keys(originalQuestions).length,
    candidateQuestionCount: Object.keys(candidateQuestions).length,
    originalRequestBytes: Buffer.byteLength(JSON.stringify(original)),
    candidateRequestBytes: Buffer.byteLength(JSON.stringify(request)),
    originalQuestionsUnchanged: true,
    stateMatchesBaseline: true,
    questionHashes: Object.fromEntries(
      Object.entries(candidateQuestions).map(([key, question]) => [
        key,
        hash(question),
      ]),
    ),
  }
}

const callModel = async (
  request: unknown,
  key: string,
  fetcher: typeof fetch,
): Promise<{ response?: unknown; error?: string }> => {
  try {
    const response = await fetcher('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(8000),
    })
    return response.ok
      ? { response: await response.json() }
      : { error: `http_${response.status}` }
  } catch (error) {
    // Never serialize arbitrary exceptions, headers or credentials.
    return {
      error:
        error instanceof Error &&
        ['TimeoutError', 'AbortError'].includes(error.name)
          ? 'timeout'
          : 'network_or_json_error',
    }
  }
}

export const runFocusedPair = async (options: {
  readonly testCase: AiEvalCase
  readonly key: string
  readonly fetcher?: typeof fetch
  readonly interpreter?: Interpreter
}): Promise<FocusedPair> => {
  const { testCase } = options
  if (testCase.entryPoint !== 'ai')
    throw new Error('Focused experiment supports only /ai cases')
  const started = performance.now()
  const calls: FocusedCall[] = []
  try {
    const parsed = await (options.interpreter ?? interpretFocusedAi)(
      testCase.query,
      async (request, phase) => {
        if (calls.length || phase !== 'fanout')
          throw new Error('focused_call_count_contract_failed')
        const metadata = inspectFocusedRequest(
          request,
          buildEvalRequest(testCase),
        )
        const callStarted = performance.now()
        const response = await callModel(
          request,
          options.key,
          options.fetcher ?? fetch,
        )
        calls.push({
          phase,
          ...metadata,
          latencyMs: elapsed(callStarted),
          ...response,
        })
        if (response.error) throw new Error('focused_provider_unavailable')
        return response.response
      },
    )
    const captured = calls[0]
    if (!captured) throw new Error('focused_missing_capture')
    const baselineStarted = performance.now()
    // Baseline authority comes from the untouched provider body, independently
    // of any result or answer projection returned by experimental code.
    const baseline = evaluateResponse(testCase, captured.response)
    const baselineEvaluationMs = performance.now() - baselineStarted
    return {
      id: testCase.id,
      baseline,
      candidate: evaluateInterpretation(
        testCase,
        parsed.result ?? { status: 'unsupported' },
        parsed.response,
      ),
      calls,
      stages: parsed.stages,
      provenance: parsed.provenance,
      parseTimings: parsed.timings,
      baselineEvaluationMs,
      totalDurationMs: elapsed(started),
    }
  } catch {
    const providerError = calls.find((call) => call.error)?.error
    const captured = calls[0]
    // Preserve prior cases and the denominator even if preflight fails before
    // this case sends a request. Arbitrary error text never enters the report.
    const failure = providerError
      ? providerFailure(testCase, providerError, elapsed(started))
      : unattemptedCase(testCase, 'candidate_interpreter_error')
    return {
      id: testCase.id,
      baseline:
        providerError || !captured
          ? failure
          : evaluateResponse(testCase, captured.response),
      candidate: failure,
      calls,
      stages: [],
      provenance: null,
      totalDurationMs: elapsed(started),
      ...(!providerError && {
        harnessError: 'candidate_interpreter_error' as const,
      }),
    }
  }
}

const latency = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const percentile = (fraction: number) =>
    sorted.length ? sorted[Math.ceil(sorted.length * fraction) - 1] : null
  return {
    count: values.length,
    meanMs: values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
  }
}

export const summarizeFocusedPairs = (pairs: readonly FocusedPair[]) => {
  const calls = pairs.flatMap(({ calls }) => calls)
  const completed = pairs.filter(
    ({ baseline, candidate }) =>
      !['provider', 'not_run'].includes(baseline.stage) &&
      !['provider', 'not_run'].includes(candidate.stage),
  )
  return {
    baseline: summarizeEval(pairs.map(({ baseline }) => baseline)),
    candidate: summarizeEval(pairs.map(({ candidate }) => candidate)),
    completedPairs: completed.length,
    recoveredExact: completed.filter(
      ({ baseline, candidate }) => !baseline.pass && candidate.pass,
    ).length,
    lostExact: completed.filter(
      ({ baseline, candidate }) => baseline.pass && !candidate.pass,
    ).length,
    totalProviderCalls: calls.length,
    providerFailures: calls.filter(({ error }) => error).length,
    harnessFailures: pairs.filter(({ harnessError }) => harnessError).length,
    privacyStateVerifiedCalls: calls.filter(
      ({ stateMatchesBaseline, originalQuestionsUnchanged }) =>
        stateMatchesBaseline && originalQuestionsUnchanged,
    ).length,
    supportPairsSelected: pairs.filter(({ provenance }) => provenance !== null)
      .length,
    latency: {
      sharedProvider: latency(calls.map(({ latencyMs }) => latencyMs)),
      totalPairedEvaluation: latency(
        pairs
          .filter(({ calls }) => calls.length)
          .map(({ totalDurationMs }) => totalDurationMs),
      ),
      prototypeBaselineParse: latency(
        pairs.flatMap(({ parseTimings }) =>
          parseTimings ? [parseTimings.baselineParseMs] : [],
        ),
      ),
      independentBaselineEvaluation: latency(
        pairs.flatMap(({ baselineEvaluationMs }) =>
          baselineEvaluationMs === undefined ? [] : [baselineEvaluationMs],
        ),
      ),
      candidateParse: latency(
        pairs.flatMap(({ parseTimings }) =>
          parseTimings?.candidateParseMs == null
            ? []
            : [parseTimings.candidateParseMs],
        ),
      ),
    },
    changedOutcomes: completed
      .filter(
        ({ baseline, candidate }) =>
          !isDeepStrictEqual(baseline.actual, candidate.actual),
      )
      .map(({ id, baseline, candidate }) => ({
        id,
        before: baseline.actual,
        after: candidate.actual,
      })),
  }
}

const blockedProvider = (result: EvalResult): boolean =>
  result.actual.status === 'provider_error' &&
  ['http_401', 'http_403', 'http_429'].includes(result.actual.reason)

export const runFocusedCases = async (options: {
  readonly cases: readonly AiEvalCase[]
  readonly key: string
  readonly fetcher?: typeof fetch
  readonly interpreter?: Interpreter
  readonly onResult?: (
    pair: FocusedPair,
    completed: number,
    total: number,
  ) => void
}): Promise<readonly FocusedPair[]> => {
  const pairs: FocusedPair[] = []
  let reason: string | undefined
  for (const testCase of options.cases) {
    if (reason) {
      pairs.push({
        id: testCase.id,
        baseline: unattemptedCase(testCase, reason),
        candidate: unattemptedCase(testCase, reason),
        calls: [],
        stages: [],
        provenance: null,
        totalDurationMs: 0,
      })
      continue
    }
    const pair = await runFocusedPair({ ...options, testCase })
    pairs.push(pair)
    options.onResult?.(pair, pairs.length, options.cases.length)
    const summary = summarizeEval([pair.baseline, pair.candidate])
    if (blockedProvider(pair.baseline) || blockedProvider(pair.candidate))
      reason = 'aborted_after_provider_denial'
    else if (pair.harnessError) reason = 'aborted_after_interpreter_error'
    else if (
      summary.incorrectProposals ||
      summary.incorrectConfirmationProposals ||
      summary.incorrectClarificationProposals
    )
      reason = 'aborted_after_incorrect_proposal'
  }
  return pairs
}

const hashInterpreter = async (path: string) =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex')

export const hashFocusedHarness = async () => {
  const files = [
    'focusedRunner.ts',
    'focusedInterpreter.ts',
    'evaluate.ts',
    'focused.eval.ts',
    'focusedCorpus.ts',
    'focusedCorpus.freeze.json',
    'corpus.ts',
    'runner.ts',
  ]
  const entries = await Promise.all(
    files.map(
      async (file) =>
        [
          file,
          await hashInterpreter(fileURLToPath(new URL(file, import.meta.url))),
        ] as const,
    ),
  )
  const fileHashes = Object.fromEntries(entries)
  return { hash: hash(fileHashes), files: fileHashes }
}

export const runFocusedEval = async (options: {
  readonly cases: readonly AiEvalCase[]
  readonly key: string
  readonly sourceRoot: string
  readonly outputDirectory: string
  readonly label: string
  readonly privacyExposedIds?: readonly string[]
  readonly onResult?: (
    pair: FocusedPair,
    completed: number,
    total: number,
  ) => void
}) => {
  const startedAt = new Date().toISOString()
  const sourceHash = await hashEvalSource(options.sourceRoot)
  const interpreterPath = fileURLToPath(
    new URL('./focusedInterpreter.ts', import.meta.url),
  )
  const interpreterHash = await hashInterpreter(interpreterPath)
  const harnessBefore = await hashFocusedHarness()
  const pairs = await runFocusedCases(options)
  const sourceHashAfter = await hashEvalSource(options.sourceRoot)
  const interpreterHashAfter = await hashInterpreter(interpreterPath)
  const harnessAfter = await hashFocusedHarness()
  const privacyExposedIds = options.privacyExposedIds ?? []
  const reservedPairs = pairs.filter(
    ({ baseline }) => baseline.split === 'heldout',
  )
  const report = {
    startedAt,
    completedAt: new Date().toISOString(),
    interpretationMode: 'experimental-family-support-paired-single-capture',
    evidenceMode:
      'same-fanout-response-original-versus-family-support-evidence',
    separateProductionProviderCall: false,
    model: 'jev-latest',
    candidateEnabledInProduction: false,
    providerCallsExecuteActions: false,
    sourceHash,
    sourceHashAfter,
    interpreterHash,
    interpreterHashAfter,
    harnessBefore,
    harnessAfter,
    sourceChangedDuringRun:
      sourceHash !== sourceHashAfter ||
      interpreterHash !== interpreterHashAfter ||
      harnessBefore.hash !== harnessAfter.hash,
    corpusHash: hash(options.cases),
    label: options.label,
    summary: summarizeFocusedPairs(pairs),
    reservedEvidence: {
      privacyExposedIds,
      untouched: summarizeFocusedPairs(
        reservedPairs.filter(({ id }) => !privacyExposedIds.includes(id)),
      ),
      privacyExposed: summarizeFocusedPairs(
        reservedPairs.filter(({ id }) => privacyExposedIds.includes(id)),
      ),
    },
    pairs,
  }
  const basename = `${startedAt.replace(/[:.]/g, '-')}-${options.label.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  await mkdir(options.outputDirectory, { recursive: true })
  const jsonPath = join(options.outputDirectory, `${basename}.json`)
  const markdownPath = join(options.outputDirectory, `${basename}.md`)
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, {
    flag: 'wx',
  })
  const { baseline, candidate } = report.summary
  await writeFile(
    markdownPath,
    [
      `# Focused support experiment: ${options.label}`,
      '',
      `Same-capture baseline ${baseline.passed}/${baseline.total}; candidate ${candidate.passed}/${candidate.total}.`,
      `Wrong ready proposals: baseline ${baseline.incorrectProposals}; candidate ${candidate.incorrectProposals}.`,
      `Provider failures: ${report.summary.providerFailures}; actual calls: ${report.summary.totalProviderCalls}.`,
      `Recovered/lost exact completed pairs: ${report.summary.recoveredExact}/${report.summary.lostExact}.`,
      `Production source: ${sourceHash}. Candidate interpreter: ${interpreterHash}.`,
      '',
      'One augmented request supplies both interpretations. This is not two independent live runs; baseline latency/cost cannot be inferred from this experiment. The candidate is eval-only and no action is executed. Provider failures and unattempted cases remain in the total denominator.',
      '',
      '| Case | Baseline | Candidate | Shared provider time | Total evaluation time |',
      '| --- | --- | --- | --- | --- |',
      ...pairs.map(
        (pair) =>
          `| ${pair.id} | ${JSON.stringify(pair.baseline.actual)} | ${JSON.stringify(pair.candidate.actual)} | ${pair.calls[0]?.latencyMs ?? 0} ms | ${pair.totalDurationMs} ms |`,
      ),
      '',
    ].join('\n'),
    { flag: 'wx' },
  )
  return { report, jsonPath, markdownPath }
}
