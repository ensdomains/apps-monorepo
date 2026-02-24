import type Stagehand from '@browserbasehq/stagehand'
import { runAgentFallback } from './agent-fallback.js'

export interface ActWithCachedFallbackOptions {
  /** Target page when using multiple pages; omit for default/active page */
  page?: unknown
  maxAgentSteps?: number
}

/**
 * Single entry point for UI actions with auto-repair:
 * 1) Try cached act (Stagehand uses cacheDir; no LLM if hit)
 * 2) On failure → re-observe and act (1 LLM call; cache updated)
 * 3) On second failure → agent fallback (only for complex failures)
 */
export async function actWithCachedFallback(
  stagehand: Stagehand,
  instruction: string,
  options: ActWithCachedFallbackOptions = {},
): Promise<void> {
  const { page, maxAgentSteps = 10 } = options
  const pageOpts = page ? { page } : undefined

  // 1) Try cached act (or direct act if no cache)
  try {
    await stagehand.act(instruction, pageOpts)
    return
  } catch (err) {
    // If it's a clear element-not-found or timeout, proceed to re-observe
    // Otherwise, might be a transient error - log and continue
    const errorMsg = err instanceof Error ? err.message : String(err)
    if (
      !errorMsg.includes('not found') &&
      !errorMsg.includes('timeout') &&
      !errorMsg.includes('element')
    ) {
      // Might be a transient error, try once more
      try {
        await new Promise((resolve) => setTimeout(resolve, 1000)) // brief wait
        await stagehand.act(instruction, pageOpts)
        return
      } catch {
        // Continue to re-observe
      }
    }
  }

  // 2) Re-observe and act (1 LLM call; cache updated)
  try {
    const actions = await stagehand.observe(instruction, pageOpts)
    const action = actions[0]
    if (!action) throw new Error('observe returned no actions')

    await stagehand.act(action, pageOpts)
    return
  } catch (err) {
    // Log the error but continue to agent fallback only if it's a real failure
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.warn(`Re-observe failed for "${instruction}": ${errorMsg}`)
  }

  // 3) Agent fallback (last resort)
  console.log(`Using agent fallback for: "${instruction}"`)
  await runAgentFallback(stagehand, instruction, { maxSteps: maxAgentSteps })
}
