/** A complete literal proof may settle uncertainty, never an unsupported choice. */
export const hasSupportedSelectionConstraints = (
  answers: Record<string, unknown>,
  literalAgreement = false,
): boolean => {
  const answer = answers.selection_constraints
  if (typeof answer !== 'object' || answer === null || Array.isArray(answer))
    return false
  const value = answer as Record<string, unknown>
  return (
    value.type === 'choice' &&
    value.choice === 'represented' &&
    typeof value.confidence === 'number' &&
    Number.isFinite(value.confidence) &&
    value.confidence >= 0 &&
    value.confidence <= 1 &&
    (value.confidence >= 0.65 || literalAgreement)
  )
}
