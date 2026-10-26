export type WorkflowResult = {
  result: 'PASS' | 'FAIL' | 'BLOCKED'
  detail: string
  evidence?: unknown
}

export function rethrowUnsettledWallet(error: unknown) {
  if (String(error).includes('Local matrix wallet request did not settle')) throw error
}

/** An unresolved wallet request may still commit after cleanup has checked state. */
export async function checkWorkflow(
  run: () => Promise<{ detail: string; evidence?: unknown }>,
  ready: () => boolean,
  captureFailure: () => Promise<unknown>,
  record: (result: WorkflowResult) => void,
) {
  try {
    record({ result: 'PASS', ...await run() })
  } catch (error) {
    const detail = String(error)
    const unsettledWallet = detail.includes('Local matrix wallet request did not settle')
    const infrastructure = unsettledWallet || /Authority unavailable|HTTP request failed|fetch failed|ECONNREFUSED|missing bytecode for code hash/.test(detail)
    record({ result: ready() && !infrastructure ? 'FAIL' : 'BLOCKED', detail, evidence: await captureFailure() })
    // Promise.race bounds the wait; it does not cancel the wallet's sender.
    // Preserve this blocked attempt and stop the fixture before another action
    // or migration can consume a baseline changed by that late transaction.
    rethrowUnsettledWallet(error)
  }
}
