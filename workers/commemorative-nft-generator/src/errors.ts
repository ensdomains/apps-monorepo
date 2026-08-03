export class InvalidGenerationInputError extends Error {
  override readonly name = 'InvalidGenerationInputError'
}

export class ImmutableArtifactConflictError extends Error {
  override readonly name = 'ImmutableArtifactConflictError'
}

export class UnsupportedRendererOutputError extends Error {
  override readonly name = 'UnsupportedRendererOutputError'
}

export class GraphicsRequirementError extends Error {
  override readonly name = 'GraphicsRequirementError'
}

export const isNonRetryableGeneratorError = (
  error: unknown,
): error is
  | InvalidGenerationInputError
  | ImmutableArtifactConflictError
  | UnsupportedRendererOutputError =>
  error instanceof InvalidGenerationInputError ||
  error instanceof ImmutableArtifactConflictError ||
  error instanceof UnsupportedRendererOutputError
