import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import {
  buildCandidateVerificationRequest,
  parseCandidateVerification,
} from '@/features/ai/candidateVerification'
import { CANDIDATE_VERIFICATION_CORPUS } from './candidateVerificationCorpus'
import { hashEvalSource, loadLocalKey } from './runner'

const callVerifier = async (request: unknown, key: string) => {
  const started = performance.now()
  let response: unknown
  let error: string | undefined
  try {
    const result = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(8000),
    })
    if (result.ok) response = await result.json()
    else error = `http_${result.status}`
  } catch (failure) {
    error =
      failure instanceof Error &&
      ['AbortError', 'TimeoutError'].includes(failure.name)
        ? 'timeout'
        : 'network_or_json_error'
  }
  return { response, error, latencyMs: Math.round(performance.now() - started) }
}

// Direct second-stage contrasts are not end-to-end accuracy measurements.
// Every expected label is authored independently of provider responses.
it.runIf(process.env.AI_VERIFY_CONFORMANCE === '1')(
  'measures candidate verifier conformance without executing actions',
  async () => {
    const key = await loadLocalKey(
      process.env,
      join(process.cwd(), '.dev.vars'),
    )
    if (!key)
      throw new Error('Set the local TypeSafe secret before evaluating.')
    const sourceRoot =
      process.env.AI_EVAL_SOURCE_ROOT ?? join(process.cwd(), 'src')
    const sourceHash = await hashEvalSource(sourceRoot)
    const startedAt = new Date().toISOString()
    type Row = {
      id: string
      expected: 'verified' | 'rejected'
      actual: string
      pass: boolean
      called: boolean
      latencyMs: number
      requestHash?: string
      request?: unknown
      response?: unknown
      error?: string
    }
    const results: Row[] = []
    let abortReason: string | undefined
    for (const testCase of CANDIDATE_VERIFICATION_CORPUS) {
      if (abortReason) {
        results.push({
          id: testCase.id,
          expected: testCase.expected,
          actual: 'not_run',
          pass: false,
          called: false,
          latencyMs: 0,
          error: abortReason,
        })
        continue
      }
      const request = buildCandidateVerificationRequest(
        testCase.query,
        testCase.candidate,
      )
      if (!request) {
        // Local refusals do not count as provider rejection successes.
        results.push({
          id: testCase.id,
          expected: testCase.expected,
          actual: 'local_projection_rejection',
          pass: false,
          called: false,
          latencyMs: 0,
        })
        continue
      }
      const { response, error, latencyMs } = await callVerifier(request, key)
      if (error && ['http_401', 'http_403', 'http_429'].includes(error))
        abortReason = `aborted_after_${error}`
      const actual = error
        ? 'provider_error'
        : parseCandidateVerification(response)
      results.push({
        id: testCase.id,
        expected: testCase.expected,
        actual,
        pass: actual === testCase.expected,
        called: true,
        latencyMs,
        requestHash: createHash('sha256')
          .update(JSON.stringify(request))
          .digest('hex'),
        request,
        ...(error ? { error } : { response }),
      })
      console.info(`${testCase.id}: ${actual}`)
    }
    const sourceHashAfter = await hashEvalSource(sourceRoot)
    const summary = {
      total: results.length,
      passed: results.filter((row) => row.pass).length,
      providerCalls: results.filter((row) => row.called).length,
      providerErrors: results.filter((row) => row.actual === 'provider_error')
        .length,
      localProjectionRejections: results.filter(
        (row) => row.actual === 'local_projection_rejection',
      ).length,
      notRun: results.filter((row) => row.actual === 'not_run').length,
      validCandidatesAccepted: results.filter(
        (row) => row.expected === 'verified' && row.actual === 'verified',
      ).length,
      validCandidatesConfirmed: results.filter(
        (row) =>
          row.expected === 'verified' && row.actual === 'confirm_operation',
      ).length,
      invalidCandidatesRejected: results.filter(
        (row) => row.expected === 'rejected' && row.actual === 'rejected',
      ).length,
      invalidCandidatesAcceptedOrConfirmed: results.filter(
        (row) =>
          row.expected === 'rejected' &&
          ['verified', 'confirm_operation'].includes(row.actual),
      ).length,
    }
    const report = {
      startedAt,
      completedAt: new Date().toISOString(),
      evidenceMode: 'direct-verifier-contrasts-not-end-to-end',
      model: 'jev-latest',
      sourceHash,
      sourceHashAfter,
      sourceChangedDuringRun: sourceHash !== sourceHashAfter,
      corpusHash: createHash('sha256')
        .update(JSON.stringify(CANDIDATE_VERIFICATION_CORPUS))
        .digest('hex'),
      summary,
      results,
    }
    const directory = join(process.cwd(), 'evals/ai/reports')
    await mkdir(directory, { recursive: true })
    const basename = `${startedAt.replaceAll(/[:.]/g, '-')}-verification-conformance`
    const path = join(directory, `${basename}.json`)
    await writeFile(path, `${JSON.stringify(report, null, 2)}\n`)
    await writeFile(
      join(directory, `${basename}.md`),
      `# Candidate verifier contrasts\n\nDirect second-stage judgments; not end-to-end action accuracy.\n\nSource: ${sourceHash}\n\n${JSON.stringify(summary, null, 2)}\n\n| Case | Expected | Actual | Latency (ms) |\n| --- | --- | --- | --- |\n${results.map((row) => `| ${row.id} | ${row.expected} | ${row.actual} | ${row.latencyMs} |`).join('\n')}\n`,
    )
    console.info(JSON.stringify({ path, ...summary }))
    expect(report.sourceChangedDuringRun).toBe(false)
    expect(summary.providerErrors).toBe(0)
    expect(summary.notRun).toBe(0)
    expect(summary.localProjectionRejections).toBe(0)
    expect(summary.invalidCandidatesAcceptedOrConfirmed).toBe(0)
    expect(summary.passed).toBe(summary.total)
  },
  5 * 60 * 1000,
)
