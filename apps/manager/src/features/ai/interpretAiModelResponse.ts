import {
  parseCandidateVerification,
  prepareCandidateVerification,
} from './candidateVerification'
import { type AiInterpretResult, parseJevAiResponse } from './intent'
import type { JevModelResponse } from './jevBoundary'

/** At most one follow-up; no candidate can become an action without a verdict. */
export const interpretAiModelResponse = async (
  response: unknown,
  query: string,
  verify: (request: unknown) => Promise<JevModelResponse>,
): Promise<AiInterpretResult> => {
  const interpretation = parseJevAiResponse(response, query)
  if (interpretation) return interpretation
  const prepared = prepareCandidateVerification(response, query)
  if (!prepared) return { status: 'unsupported' }
  const verification = await verify(prepared.request)
  if (verification.status !== 'ok') return verification
  const verdict = parseCandidateVerification(verification.body)
  if (verdict === 'rejected') return { status: 'unsupported' }
  if (verdict === 'verified') return prepared.candidate.interpretation
  return {
    ...prepared.candidate.interpretation,
    status: 'needs_confirmation',
  }
}
