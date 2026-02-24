import type Stagehand from '@browserbasehq/stagehand'

export interface AgentFallbackOptions {
  maxSteps?: number
  systemPrompt?: string
}

/**
 * Last-resort fallback when re-observe + act fails (e.g. flow or layout changed significantly).
 * Uses the agent to complete the requested UI action in multiple steps.
 */
export async function runAgentFallback(
  stagehand: Stagehand,
  instruction: string,
  options: AgentFallbackOptions = {},
): Promise<void> {
  const {
    maxSteps = 10,
    systemPrompt = 'Complete the requested UI action step by step. One instruction at a time.',
  } = options
  const agent = stagehand.agent({
    model: process.env.GEMINI_API_KEY
      ? {
          modelName: 'google/gemini-2.5-flash',
          apiKey: process.env.GEMINI_API_KEY,
        }
      : 'google/gemini-2.5-flash',
    mode: 'hybrid',
    systemPrompt,
  })
  await agent.execute({
    instruction,
    maxSteps,
  })
}
