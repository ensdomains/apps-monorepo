import { type EvalResult, matchesExpected } from './evaluate'

const latencyDistribution = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const percentile = (fraction: number) =>
    sorted.length ? sorted[Math.ceil(sorted.length * fraction) - 1] : null
  return {
    count: sorted.length,
    meanMs: sorted.length
      ? values.reduce((sum, value) => sum + value, 0) / sorted.length
      : null,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
  }
}

export const summarizeVerification = (results: readonly EvalResult[]) => {
  const calls = results.flatMap((result) => result.calls ?? [])
  const providerCalls = calls.filter((call) => call.source !== 'stored')
  const paired = results.filter((result) => result.baseline !== undefined)
  const attempted = paired.filter((result) =>
    result.calls?.some((call) => call.phase === 'candidate_verification'),
  )
  return {
    mode: 'paired-provider-call-accounting' as const,
    totalProviderCalls: providerCalls.length,
    storedInitialResponses: calls.filter((call) => call.source === 'stored')
      .length,
    initialCalls: providerCalls.filter((call) => call.phase === 'initial')
      .length,
    verificationCalls: providerCalls.filter(
      (call) => call.phase === 'candidate_verification',
    ).length,
    verificationProviderErrors: calls.filter(
      (call) => call.phase === 'candidate_verification' && call.error,
    ).length,
    attemptedCases: attempted.length,
    recoveredExactOutcomes: paired.filter(
      (result) => !result.baseline?.pass && result.pass,
    ).length,
    lostExactOutcomes: paired.filter(
      (result) => result.baseline?.pass && !result.pass,
    ).length,
    acceptedAfterVerification: attempted.filter(
      (result) => result.actual.status === 'ready',
    ).length,
    rejectedAfterVerification: attempted.filter(
      (result) =>
        result.actual.status === 'unsupported' ||
        result.actual.status === 'invalid',
    ).length,
    confirmationsAfterVerification: attempted.filter(
      (result) => result.actual.status === 'needs_confirmation',
    ).length,
    matchingConfirmationOutcomes: attempted.filter(
      (result) =>
        result.actual.status === 'needs_confirmation' &&
        matchesExpected(result.expected, result.actual.proposedOutcome),
    ).length,
    initialLatency: latencyDistribution(
      providerCalls
        .filter((call) => call.phase === 'initial')
        .map((call) => call.latencyMs),
    ),
    verificationLatency: latencyDistribution(
      providerCalls
        .filter((call) => call.phase === 'candidate_verification')
        .map((call) => call.latencyMs),
    ),
    totalCaseLatency: latencyDistribution(
      paired.map((result) => result.latencyMs),
    ),
    changedOutcomes: paired
      .filter(
        (result) =>
          JSON.stringify(result.baseline?.actual) !==
          JSON.stringify(result.actual),
      )
      .map((result) => ({
        id: result.id,
        before: result.baseline?.actual,
        after: result.actual,
      })),
  }
}
